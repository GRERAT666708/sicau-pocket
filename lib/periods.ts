/**
 * 四川农业大学作息时间（雅安 / 成都 / 都江堰三校区通用版）
 * 若学校调整作息，只需改这一张表；课表网格、今日时间轴、上课状态都会自动跟着变。
 */
export type Period = {
  index: number;
  start: string; // HH:mm
  end: string;
};

const raw: [string, string][] = [
  // 来源：教务处《四川农业大学 2026-2027 学年校历》作息时间表（第一讲～第五讲，共 10 节）
  ['08:10', '08:55'],
  ['09:05', '09:50'],
  ['10:10', '10:55'],
  ['11:05', '11:50'],
  ['14:20', '15:05'],
  ['15:15', '16:00'],
  ['16:20', '17:05'],
  ['17:15', '18:00'],
  ['19:30', '20:15'],
  ['20:25', '21:10'],
];

export const PERIODS: Period[] = raw.map(([start, end], i) => ({
  index: i + 1,
  start,
  end,
}));

export const PERIOD_COUNT = PERIODS.length;

/** 大节分组：上午 1-4（第一、二讲），下午 5-8（第三、四讲），晚上 9-10（第五讲） */
export const PERIOD_GROUPS = [
  { label: '上午', from: 1, to: 4 },
  { label: '下午', from: 5, to: 8 },
  { label: '晚上', from: 9, to: 10 },
];

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function periodStart(index: number): number {
  const p = PERIODS[Math.min(Math.max(index, 1), PERIOD_COUNT) - 1];
  return toMinutes(p.start);
}

export function periodEnd(index: number): number {
  const p = PERIODS[Math.min(Math.max(index, 1), PERIOD_COUNT) - 1];
  return toMinutes(p.end);
}

export function periodRangeText(start: number, end: number): string {
  const a = PERIODS[Math.min(Math.max(start, 1), PERIOD_COUNT) - 1];
  const b = PERIODS[Math.min(Math.max(end, 1), PERIOD_COUNT) - 1];
  return `${a.start}-${b.end}`;
}

/** 第 n 节课在当天的分钟区间，例如 1-2 节 => [480, 580] */
export function slotMinutes(start: number, end: number): [number, number] {
  return [periodStart(start), periodEnd(end)];
}
