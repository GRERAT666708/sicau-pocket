import { PERIOD_COUNT, PERIOD_GROUPS, periodEnd, periodStart } from './periods';
import type { Course, CourseSlot } from './types';

export type DayEntry = { course: Course; slot: CourseSlot };
/** 节次属于哪个时段（上午 1-4 / 下午 5-8 / 晚上 9-10）；用于避免跨越午休合并 */
function groupOf(period: number): number {
  const idx = PERIOD_GROUPS.findIndex((g) => period >= g.from && period <= g.to);
  return idx < 0 ? -1 : idx;
}

/**
 * 把「同一门课、同一天、连着的节次」合成一块。
 *
 * 教务课表里 4 学时的课常被排成 1-2 节 + 3-4 节两个格子，
 * 分开画会变成上下两块、课程名重复；合并后是一块「第 1-4 节」。
 * 只合并：同课程 + 同一时段（不跨午休）+ 节次紧挨着（中间没空节）。
 */
export function mergeEntries(entries: DayEntry[]): DayEntry[] {
  const groups = new Map<string, DayEntry[]>();
  for (const entry of entries) {
    const key = `${entry.course.id}#${entry.slot.day}`;
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  const merged: DayEntry[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.slot.start - b.slot.start);
    const first = list[0];
    if (!first) continue;
    let cur: DayEntry = { course: first.course, slot: { ...first.slot } };
    for (let i = 1; i < list.length; i += 1) {
      const entry: DayEntry = list[i];
      const adjacent = entry.slot.start <= cur.slot.end + 1;
      const sameGroup = groupOf(entry.slot.start) === groupOf(cur.slot.end);
      const sameRoom = (entry.slot.room ?? '') === (cur.slot.room ?? '');
      if (adjacent && sameGroup && sameRoom) {
        cur = {
          course: cur.course,
          slot: { ...cur.slot, end: Math.max(cur.slot.end, entry.slot.end) },
        };
        continue;
      }
      merged.push(cur);
      cur = { course: entry.course, slot: { ...entry.slot } };
    }
    merged.push(cur);
  }

  return merged.sort((a, b) => a.slot.day - b.slot.day || a.slot.start - b.slot.start);
}


export function entriesForDay(courses: Course[], day: number, week: number): DayEntry[] {
  const out: DayEntry[] = [];
  for (const course of courses) {
    for (const slot of course.slots) {
      if (slot.day === day && slot.weeks.includes(week)) out.push({ course, slot });
    }
  }
  return mergeEntries(out);
}

export function entriesForWeek(courses: Course[], week: number): DayEntry[] {
  return mergeEntries(
    courses.flatMap((course) =>
      course.slots.filter((s) => s.weeks.includes(week)).map((slot) => ({ course, slot })),
    ),
  );
}

export type NowStatus =
  | { kind: 'class'; entry: DayEntry; leftMinutes: number; progress: number }
  | { kind: 'break'; next: DayEntry; startInMinutes: number }
  | { kind: 'done' }
  | { kind: 'empty' };

export function statusNow(entries: DayEntry[], minutes: number): NowStatus {
  const current = entries.find((e) => {
    const s = periodStart(e.slot.start);
    const t = periodEnd(e.slot.end);
    return minutes >= s && minutes < t;
  });
  if (current) {
    const s = periodStart(current.slot.start);
    const t = periodEnd(current.slot.end);
    return {
      kind: 'class',
      entry: current,
      leftMinutes: Math.max(1, t - minutes),
      progress: Math.min(1, Math.max(0, (minutes - s) / (t - s))),
    };
  }
  const next = entries.find((e) => periodStart(e.slot.start) > minutes);
  if (next) {
    return { kind: 'break', next, startInMinutes: periodStart(next.slot.start) - minutes };
  }
  return entries.length ? { kind: 'done' } : { kind: 'empty' };
}

/** 节次块在课表中的行跨度（1-based） */
export function slotSpan(start: number, end: number) {
  const s = Math.min(Math.max(start, 1), PERIOD_COUNT);
  const e = Math.min(Math.max(end, s), PERIOD_COUNT);
  return { top: s - 1, span: e - s + 1 };
}

export function courseStats(courses: Course[], week: number) {
  const entries = entriesForWeek(courses, week);
  return { count: entries.length, days: new Set(entries.map((e) => e.slot.day)).size };
}

export function minutesOfDay(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}
