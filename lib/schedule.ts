import { PERIOD_COUNT, periodEnd, periodStart } from './periods';
import type { Course, CourseSlot } from './types';

export type DayEntry = { course: Course; slot: CourseSlot };

export function entriesForDay(courses: Course[], day: number, week: number): DayEntry[] {
  const out: DayEntry[] = [];
  for (const course of courses) {
    for (const slot of course.slots) {
      if (slot.day === day && slot.weeks.includes(week)) out.push({ course, slot });
    }
  }
  return out.sort((a, b) => a.slot.start - b.slot.start);
}

export function entriesForWeek(courses: Course[], week: number): DayEntry[] {
  return courses
    .flatMap((course) =>
      course.slots.filter((s) => s.weeks.includes(week)).map((slot) => ({ course, slot })),
    )
    .sort((a, b) => a.slot.day - b.slot.day || a.slot.start - b.slot.start);
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
