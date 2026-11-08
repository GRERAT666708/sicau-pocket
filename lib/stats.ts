import { addDays, isoDate, startOfDay } from './date';
import type { FocusSession } from './types';

export function minutesOnDay(sessions: FocusSession[], date: Date): number {
  const key = isoDate(date);
  return sessions
    .filter((s) => isoDate(new Date(s.endedAt)) === key)
    .reduce((sum, s) => sum + s.minutes, 0);
}

export function focusSummary(sessions: FocusSession[]) {
  const today = new Date();
  const todayMinutes = minutesOnDay(sessions, today);
  const weekStart = addDays(startOfDay(today), -((today.getDay() + 6) % 7));
  const weekMinutes = sessions
    .filter((s) => s.endedAt >= weekStart.getTime())
    .reduce((sum, s) => sum + s.minutes, 0);
  const totalMinutes = sessions.reduce((sum, s) => sum + s.minutes, 0);

  const days = new Set(sessions.map((s) => isoDate(new Date(s.endedAt))));
  let streak = 0;
  let cursor = startOfDay(today);
  if (!days.has(isoDate(cursor))) cursor = addDays(cursor, -1);
  while (days.has(isoDate(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return { todayMinutes, weekMinutes, totalMinutes, streak };
}

export type HeatCell = { date: Date; minutes: number; level: 0 | 1 | 2 | 3 | 4 };

export function heatmap(sessions: FocusSession[], weeks = 17): HeatCell[] {
  const today = startOfDay(new Date());
  const end = addDays(today, 6 - ((today.getDay() + 6) % 7)); // 本周周日
  const start = addDays(end, -(weeks * 7 - 1));
  const perDay = new Map<string, number>();
  for (const s of sessions) {
    const k = isoDate(new Date(s.endedAt));
    perDay.set(k, (perDay.get(k) ?? 0) + s.minutes);
  }
  const cells: HeatCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    const m = perDay.get(isoDate(d)) ?? 0;
    const level: HeatCell['level'] = m === 0 ? 0 : m < 25 ? 1 : m < 60 ? 2 : m < 120 ? 3 : 4;
    cells.push({ date: d, minutes: m, level });
  }
  return cells;
}

export function todaySessions(sessions: FocusSession[]): FocusSession[] {
  const key = isoDate(new Date());
  return sessions
    .filter((s) => isoDate(new Date(s.endedAt)) === key)
    .sort((a, b) => b.endedAt - a.endedAt);
}
