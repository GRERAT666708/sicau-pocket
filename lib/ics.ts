import { periodEnd, periodStart } from './periods';
import type { Course } from './types';

/**
 * 把课表导出成 iCalendar（.ics）。
 *
 * 为什么要这个：鸿蒙（HarmonyOS NEXT）上没有安卓小组件宿主 —— 用户通过「卓易通」
 * 这类安卓兼容层装我们的 App，AppWidgetProvider 永远拿不到宿主，桌面小组件必然不显示。
 * 而系统自带的「日历」在三个平台上都有服务卡片/负一屏日程，
 * 所以把课表导进系统日历，等于给鸿蒙（以及任何平台）一个可以放在桌面的课表卡片，
 * 顺便白送系统级上课提醒。本文件只负责生成文本，不碰网络。
 */

export type IcsOptions = {
  /** 学期名，写进日历标题，例如「2026-2027 学年第一学期」 */
  termName: string;
  /** 第 1 教学周的周一，YYYY-MM-DD */
  termStart: string;
  courses: Course[];
  /** 提前多少分钟提醒；0 表示不加提醒 */
  remindMinutes?: number;
};

const TZID = 'Asia/Shanghai';
const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function parseTermStart(input: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 本地时间（当天第几分钟）→ 20260907T081000（带 TZID 的浮动写法，配合 VTIMEZONE 使用） */
function stamp(date: Date, minutes: number): string {
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return (
    `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}` +
    `T${pad2(hh)}${pad2(mm)}00`
  );
}

/** UTC 时间戳，用于 DTSTAMP */
function utcStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

/** iCalendar 文本转义：反斜杠、分号、逗号、换行 */
function escapeText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** 按 75 字节折行（中文一个字 3 字节，不折行部分客户端会截断） */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 74) return line;
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > 73) {
      out.push(cur);
      cur = ` ${ch}`;
      bytes = 1 + size;
    } else {
      cur += ch;
      bytes += size;
    }
  }
  if (cur) out.push(cur);
  return out.join('\r\n');
}

/** 把周次切成等差段：连续周用 INTERVAL=1，单/双周用 INTERVAL=2 */
export function weekRuns(weeks: number[]): { first: number; step: number; count: number }[] {
  const sorted = [...new Set(weeks)].filter((w) => Number.isFinite(w) && w > 0).sort((a, b) => a - b);
  if (!sorted.length) return [];
  const runs: { first: number; step: number; count: number }[] = [];
  let first = sorted[0];
  let count = 1;
  let step = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const delta = sorted[i] - sorted[i - 1];
    if (step === 0 && (delta === 1 || delta === 2)) {
      step = delta;
      count += 1;
      continue;
    }
    if (delta === step) {
      count += 1;
      continue;
    }
    runs.push({ first, step: step || 1, count });
    first = sorted[i];
    count = 1;
    step = 0;
  }
  runs.push({ first, step: step || 1, count });
  return runs;
}

function weeksLabel(weeks: number[]): string {
  const runs = weekRuns(weeks);
  if (!runs.length) return '';
  const parts: string[] = [];
  for (const run of runs) {
    const last = run.first + (run.count - 1) * run.step;
    if (run.count === 1) parts.push(`${run.first}`);
    else if (run.step === 1) parts.push(`${run.first}-${last}`);
    else if (run.step === 2) parts.push(`${run.first}-${last} ${run.first % 2 ? '单' : '双'}周`);
    else parts.push(`${run.first}-${last}`);
  }
  return parts.join('、');
}

/** 生成整份 .ics 文本 */
export function buildIcs(options: IcsOptions): string {
  const { termName, termStart, courses, remindMinutes = 10 } = options;
  const start = parseTermStart(termStart);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//sicau-pocket//timetable//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(termName ? `川农口袋 · ${termName}` : '川农口袋课表')}`,
    `X-WR-TIMEZONE:${TZID}`,
    'BEGIN:VTIMEZONE',
    `TZID:${TZID}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:CST',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  if (start) {
    const now = utcStamp(new Date());
    for (const course of courses) {
      for (const slot of course.slots) {
        if (!slot.weeks.length) continue;
        const room = slot.room ?? course.room ?? '';
        for (const run of weekRuns(slot.weeks)) {
          const dayOffset = (run.first - 1) * 7 + (slot.day - 1);
          const day = new Date(start.getTime() + dayOffset * DAY_MS);
          const begin = stamp(day, periodStart(slot.start));
          const end = stamp(day, periodEnd(slot.end));
          const detail = [
            course.teacher ? `老师：${course.teacher}` : '',
            room ? `教室：${room}` : '',
            `周次：${weeksLabel(slot.weeks)}`,
            `第 ${slot.start}${slot.end > slot.start ? `-${slot.end}` : ''} 节`,
          ]
            .filter(Boolean)
            .join('\n');
          lines.push(
            'BEGIN:VEVENT',
            `UID:sicau-pocket-${course.id}-${slot.id}-${run.first}@sicau-pocket`,
            `DTSTAMP:${now}`,
            `DTSTART;TZID=${TZID}:${begin}`,
            `DTEND;TZID=${TZID}:${end}`,
            `RRULE:FREQ=WEEKLY;INTERVAL=${run.step};COUNT=${run.count}`,
            `SUMMARY:${escapeText(course.name)}`,
            room ? `LOCATION:${escapeText(room)}` : '',
            `DESCRIPTION:${escapeText(detail)}`,
            'TRANSP:OPAQUE',
          );
          if (remindMinutes > 0) {
            lines.push(
              'BEGIN:VALARM',
              'ACTION:DISPLAY',
              `DESCRIPTION:${escapeText(`${course.name} 要上课了`)}`,
              `TRIGGER:-PT${remindMinutes}M`,
              'END:VALARM',
            );
          }
          lines.push('END:VEVENT');
        }
      }
    }
  }

  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).map(fold).join('\r\n') + '\r\n';
}

/** 文件名里不能有这些字符，学期名还要限制长度 */
export function icsFileName(termName: string): string {
  const safe = (termName || '课表').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 24);
  return `川农课表-${safe}.ics`;
}

export type IcsExportResult =
  | { ok: true; uri: string; events: number }
  | {
      ok: false;
      reason: 'no-courses' | 'no-term-start' | 'write' | 'open' | 'unsupported';
      /** 打不开日历时的兜底：用户自己挑一个文件夹存下来 */
      savedTo?: string;
      events?: number;
    };

/**
 * 打不开日历时的兜底：让用户选一个文件夹（下载/文档都行），把 .ics 存进去。
 * 之后用文件管理器点开就能导入 —— 鸿蒙/卓易通里没有日历 App 时靠这条路。
 */
async function saveToPickedFolder(text: string, fileName: string): Promise<string | null> {
  try {
    const FileSystem = require('expo-file-system/legacy');
    const SAF = FileSystem.StorageAccessFramework;
    if (!SAF?.requestDirectoryPermissionsAsync) return null;
    const perm = await SAF.requestDirectoryPermissionsAsync();
    if (!perm?.granted) return null;
    // mime 决定后缀，文件名别再带 .ics
    const target = await SAF.createFileAsync(perm.directoryUri, fileName.replace(/\.ics$/i, ''), 'text/calendar');
    await FileSystem.writeAsStringAsync(target, text, { encoding: FileSystem.EncodingType.UTF8 });
    return target;
  } catch {
    return null;
  }
}

/** 把课表文本写进缓存目录，返回文件路径 */
async function writeIcsFile(text: string, termName: string): Promise<string | null> {
  try {
    const FileSystem = require('expo-file-system/legacy');
    const path = `${FileSystem.cacheDirectory}${icsFileName(termName)}`;
    await FileSystem.writeAsStringAsync(path, text, { encoding: FileSystem.EncodingType.UTF8 });
    return path;
  } catch {
    return null;
  }
}

/**
 * 生成 .ics 后走系统分享面板（微信 / QQ / 邮件 / 文件…）。
 * 用于把课表发给同学、或在鸿蒙那一侧用系统日历打开。
 */
export async function shareIcs(options: IcsOptions): Promise<IcsExportResult> {
  if (!options.courses.length) return { ok: false, reason: 'no-courses' };
  if (!parseTermStart(options.termStart)) return { ok: false, reason: 'no-term-start' };

  const text = buildIcs(options);
  const events = (text.match(/BEGIN:VEVENT/g) ?? []).length;
  const { Platform } = require('react-native');

  if (Platform.OS === 'web') {
    const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = icsFileName(options.termName);
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true, uri: url, events };
  }

  const path = await writeIcsFile(text, options.termName);
  if (!path) return { ok: false, reason: 'write' };

  try {
    const Sharing = require('expo-sharing');
    if (!(await Sharing.isAvailableAsync())) {
      const savedTo = await saveToPickedFolder(text, icsFileName(options.termName));
      return { ok: false, reason: 'unsupported', savedTo: savedTo ?? undefined, events };
    }
    await Sharing.shareAsync(path, {
      mimeType: 'text/calendar',
      dialogTitle: '分享课表（.ics）',
      UTI: 'com.apple.ical.ics',
    });
    return { ok: true, uri: path, events };
  } catch {
    return { ok: false, reason: 'open', events };
  }
}

/**
 * 写文件并尝试用系统日历打开。
 * 安卓/鸿蒙：ACTION_VIEW + text/calendar，让用户自己选日历 App 导入；
 * Web：交给浏览器下载。
 */
export async function exportIcs(options: IcsOptions): Promise<IcsExportResult> {
  if (!options.courses.length) return { ok: false, reason: 'no-courses' };
  if (!parseTermStart(options.termStart)) return { ok: false, reason: 'no-term-start' };

  const text = buildIcs(options);
  const events = (text.match(/BEGIN:VEVENT/g) ?? []).length;
  // 延迟 require：让 buildIcs 可以脱离 React Native 单独跑测试
  const { Platform } = require('react-native');

  if (Platform.OS === 'web') {
    const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = icsFileName(options.termName);
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true, uri: url, events };
  }

  const FileSystem = require('expo-file-system/legacy');
  const path = await writeIcsFile(text, options.termName);
  if (!path) return { ok: false, reason: 'write' };

  if (Platform.OS !== 'android') return { ok: false, reason: 'unsupported' };

  try {
    const uri = await FileSystem.getContentUriAsync(path);
    const IntentLauncher = require('expo-intent-launcher');
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: uri,
      type: 'text/calendar',
      flags: 1,
    });
    return { ok: true, uri: path, events };
  } catch {
    const savedTo = await saveToPickedFolder(text, icsFileName(options.termName));
    return { ok: false, reason: 'open', savedTo: savedTo ?? undefined, events };
  }
}
