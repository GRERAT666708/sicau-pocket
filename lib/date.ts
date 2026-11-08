const DAY = 24 * 60 * 60 * 1000;
export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
export const WEEKDAY_FULL = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** 周一为一周起始 */
export function mondayOf(d: Date): Date {
  const x = startOfDay(d);
  const wd = (x.getDay() + 6) % 7; // 周一=0
  return addDays(x, -wd);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
}

export function weekNumber(termStart: string, date: Date): number {
  const start = mondayOf(parseISO(termStart));
  return Math.floor(daysBetween(start, mondayOf(date)) / 7) + 1;
}

export function weekDates(termStart: string, week: number): Date[] {
  const start = addDays(mondayOf(parseISO(termStart)), (week - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function formatMD(d: Date): string {
  return `${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

export function formatCN(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function weekdayCN(d: Date): string {
  return WEEKDAY_FULL[(d.getDay() + 6) % 7];
}

export function isSameDay(a: Date, b: Date): boolean {
  return isoDate(a) === isoDate(b);
}

export function nowMinutes(d = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} 小时` : `${h} 小时 ${r} 分`;
}

export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${`${m}`.padStart(2, '0')}:${`${r}`.padStart(2, '0')}`;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

/** 本周第几天（1-7，周一为 1） */
export function dayIndex(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1;
}

export function parseWeeks(text: string): number[] {
  // 支持 "1-16"、"1,3,5"、"1-8,10-16"、"1-16(单)"、"1-16(双)"
  const result = new Set<number>();
  const odd = /单/.test(text);
  const even = /双/.test(text);
  const cleaned = text.replace(/[单双周()（）]/g, '');
  for (const part of cleaned.split(/[,，;；\s]+/)) {
    if (!part) continue;
    const m = part.match(/^(\d+)\s*[-~至]\s*(\d+)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) result.add(i);
    } else if (/^\d+$/.test(part)) {
      result.add(Number(part));
    }
  }
  let arr = [...result].sort((a, b) => a - b);
  if (odd) arr = arr.filter((n) => n % 2 === 1);
  if (even) arr = arr.filter((n) => n % 2 === 0);
  return arr;
}

export function weeksToText(weeks: number[]): string {
  if (!weeks.length) return '';
  const sorted = [...weeks].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = cur;
    prev = cur;
  }
  return parts.join(',');
}

export function fmtHM(min: number): string {
  const h = Math.floor(min / 60) % 24;
  return `${`${h}`.padStart(2, '0')}:${`${min % 60}`.padStart(2, '0')}`;
}

export function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
}
