import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import { reloadWidgets, widgetGroupPath, writeGroupWidgetJson } from '@/modules/widget-bridge';

import { dayIndex, fmtHM, nowMinutes, weekdayCN } from '@/lib/date';
import { coursePalette } from '@/constants/theme';
import { periodEnd, periodStart } from '@/lib/periods';
import { statusNow } from '@/lib/schedule';
import { currentWeek, getState, subscribe, todayCourses } from '@/lib/store';

/**
 * 桌面小组件的数据源。
 *
 * Android 小组件（AppWidget）跑在系统进程里，读不到 AsyncStorage；
 * 所以 App 每次数据变化时，把「今天要显示的课」序列化成 widget.json 写到应用私有目录，
 * 小组件读这个文件渲染（见 plugins/withScheduleWidget.js）。
 */

export type WidgetCourse = { time: string; name: string; room: string; color: string };

export type WidgetHighlight = {
  time: string;
  name: string;
  room: string;
  color: string;
  state: 'class' | 'next';
};

/** 小尺寸小组件要显示的那一两门课：正在上 / 下一节 / 再后面 */
export type WidgetFocus = {
  time: string;
  name: string;
  room: string;
  color: string;
  state: 'class' | 'next' | 'later';
};

export type WidgetPayload = {
  /**
   * 数据格式版本。小组件侧会读它：比它能识别的版本新时显示「数据待更新」，
   * 而不是解码失败后静默变成空课表。
   */
  payloadVersion: number;
  week: number;
  day: string;
  /** 「周日 11月8日」这种日期标签，小组件顶部用 */
  dateLabel: string;
  courses: WidgetCourse[];
  /** 超过小组件 6 行的部分，显示「还有 N 门」 */
  more: number;
  /** 小尺寸小组件用：正在上 / 下一节课 */
  highlight?: WidgetHighlight;
  /** 小尺寸小组件最多显示两门，按「现在最相关」排序 */
  focus?: WidgetFocus[];
  /** 今天的课全部上完了 */
  done?: boolean;
  doneText?: string;
  emptyText?: string;
  updatedAt: string;
};

const FILE = `${FileSystem.documentDirectory ?? ''}widget.json`;

/**
 * iOS 小组件（WidgetKit）读的是 App Group 容器里的同一份 JSON：
 * Android 写沙盒文件就够了，iOS 得额外写一份到共享目录。
 */
function iosGroupFile(): string | null {
  if (Platform.OS !== 'ios') return null;
  const dir = widgetGroupPath();
  return dir ? `${dir}/widget.json` : null;
}

function pad2(n: number) {
  return `${n}`.padStart(2, '0');
}

export function buildWidgetPayload(): WidgetPayload {
  const state = getState();
  const now = new Date();
  const week = currentWeek(state.settings, now);
  const day = weekdayCN(now);
  const entries = todayCourses(state.courses, dayIndex(now), week);

  const colorOf = (course: { colorIndex: number }) =>
    coursePalette[Math.abs(course.colorIndex) % coursePalette.length].fg;

  const courses: WidgetCourse[] = entries.map((e) => ({
    time: `${fmtHM(periodStart(e.slot.start))}-${fmtHM(periodEnd(e.slot.end))}`,
    name: e.course.name,
    room: e.slot.room ?? e.course.room ?? '',
    color: colorOf(e.course),
  }));

  const status = statusNow(entries, nowMinutes());
  let emptyText = '今天没课，好好休息';
  if (status.kind === 'class') {
    emptyText = `正在上：${status.entry.course.name}`;
  } else if (status.kind === 'break') {
    emptyText = `下一节 ${fmtHM(periodStart(status.next.slot.start))} 开始`;
  }

  const courseOf = (e: (typeof entries)[number]): WidgetCourse => ({
    time: `${fmtHM(periodStart(e.slot.start))}-${fmtHM(periodEnd(e.slot.end))}`,
    name: e.course.name,
    room: e.slot.room ?? e.course.room ?? '',
    color: colorOf(e.course),
  });

  // 今天最后一节的下课时间：过了就算「今天的课程已经上完了」
  const lastEnd = entries.reduce((m, e) => Math.max(m, periodEnd(e.slot.end)), 0);
  const done = entries.length > 0 && nowMinutes() > lastEnd;

  // 小尺寸要显示的那两门：正在上 + 下一节，或下一节 + 再下一节，或前两节
  const cur =
    status.kind === 'class' ? entries.indexOf(status.entry) : status.kind === 'break' ? entries.indexOf(status.next) : 0;
  const focus: WidgetFocus[] = done
    ? []
    : [cur, cur + 1]
        .filter((i) => i >= 0 && i < entries.length)
        .slice(0, 2)
        .map((i, n) => ({
          ...courseOf(entries[i]),
          state: status.kind === 'class' ? (n === 0 ? 'class' : 'later') : status.kind === 'break' ? (n === 0 ? 'next' : 'later') : 'later',
        }));

  const highlight: WidgetHighlight | undefined =
    status.kind === 'class'
      ? {
          time: `${fmtHM(periodStart(status.entry.slot.start))}-${fmtHM(periodEnd(status.entry.slot.end))}`,
          name: status.entry.course.name,
          room: status.entry.slot.room ?? status.entry.course.room ?? '',
          color: colorOf(status.entry.course),
          state: 'class',
        }
      : status.kind === 'break'
        ? {
            time: `${fmtHM(periodStart(status.next.slot.start))}-${fmtHM(periodEnd(status.next.slot.end))}`,
            name: status.next.course.name,
            room: status.next.slot.room ?? status.next.course.room ?? '',
            color: colorOf(status.next.course),
            state: 'next',
          }
        : undefined;

  return {
    payloadVersion: 1,
    week,
    day,
    dateLabel: `${day} ${now.getMonth() + 1}月${now.getDate()}日`,
    courses,
    more: Math.max(0, entries.length - 6),
    highlight,
    focus,
    done,
    doneText: done ? '今日课程已经上完了' : undefined,
    emptyText,
    updatedAt: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
  };
}

let lastWritten = '';

/** 把当前课表写进小组件数据文件；内容没变就不写盘 */
export async function syncWidget(force = false): Promise<void> {
  try {
    if (!FileSystem.documentDirectory) return;
    const text = JSON.stringify(buildWidgetPayload());
    if (!force && text === lastWritten) return;
    await FileSystem.writeAsStringAsync(FILE, text);
    // iOS 小组件读的是 App Group 容器：优先走原生写（expo-file-system 写不进共享容器）
    if (await writeGroupWidgetJson(text)) {
      reloadWidgets();
    } else {
      const groupFile = iosGroupFile();
      if (groupFile) {
        try {
          await FileSystem.writeAsStringAsync(`file://${groupFile}`, text);
          reloadWidgets();
        } catch (e) {
          if (__DEV__) console.warn('[sicau] group widget write failed', e);
        }
      }
    }
    lastWritten = text;
  } catch (e) {
    // 小组件是附加功能，写失败不影响主流程
    if (__DEV__) console.warn('[sicau] syncWidget failed', e);
  }
}

/** 订阅 store，课表/设置一变就（防抖 800ms）刷新一次小组件数据 */
export function startWidgetSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void syncWidget();
    }, 800);
  };
  void syncWidget(true);
  const unsubscribe = subscribe(schedule);
  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
