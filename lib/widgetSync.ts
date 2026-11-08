import * as FileSystem from 'expo-file-system/legacy';

import { dayIndex, fmtHM, nowMinutes, weekdayCN } from '@/lib/date';
import { coursePalette } from '@/constants/theme';
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

export type WidgetPayload = {
  week: number;
  day: string;
  /** 「周日 11月8日」这种日期标签，小组件顶部用 */
  dateLabel: string;
  courses: WidgetCourse[];
  /** 除前三节外还剩几节，显示「其他 N 个日程」 */
  more: number;
  /** 小尺寸小组件用：正在上 / 下一节课 */
  highlight?: WidgetHighlight;
  emptyText?: string;
  updatedAt: string;
};

const FILE = `${FileSystem.documentDirectory ?? ''}widget.json`;

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

  const courses: WidgetCourse[] = entries.slice(0, 3).map((e) => ({
    time: `${fmtHM(e.slot.start)}-${fmtHM(e.slot.end)}`,
    name: e.course.name,
    room: e.slot.room ?? e.course.room ?? '',
    color: colorOf(e.course),
  }));

  const status = statusNow(entries, nowMinutes());
  let emptyText = '今天没课，好好休息';
  if (status.kind === 'class') {
    emptyText = `正在上：${status.entry.course.name}`;
  } else if (status.kind === 'break') {
    emptyText = `下一节 ${fmtHM(status.next.slot.start)} 开始`;
  }

  const highlight: WidgetHighlight | undefined =
    status.kind === 'class'
      ? {
          time: `${fmtHM(status.entry.slot.start)}-${fmtHM(status.entry.slot.end)}`,
          name: status.entry.course.name,
          room: status.entry.slot.room ?? status.entry.course.room ?? '',
          color: colorOf(status.entry.course),
          state: 'class',
        }
      : status.kind === 'break'
        ? {
            time: `${fmtHM(status.next.slot.start)}-${fmtHM(status.next.slot.end)}`,
            name: status.next.course.name,
            room: status.next.slot.room ?? status.next.course.room ?? '',
            color: colorOf(status.next.course),
            state: 'next',
          }
        : undefined;

  return {
    week,
    day,
    dateLabel: `${day} ${now.getMonth() + 1}月${now.getDate()}日`,
    courses,
    more: Math.max(0, entries.length - 3),
    highlight,
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
