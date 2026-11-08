import { addDays, isoDate } from './date';
import type { Campus, ClassroomRow, EcardSnapshot, ElectricitySnapshot, SeatArea } from './types';

/** 稳定伪随机，保证同一天的数据不跳变 */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let x = h;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoElectricity(dorm = '十舍 412'): ElectricitySnapshot {
  const rand = rng(dorm + isoDate(new Date()));
  const dailyUsage = Array.from({ length: 14 }).map((_, i) => {
    const d = addDays(new Date(), i - 13);
    const base = 1.6 + rand() * 2.6;
    return { date: isoDate(d), kwh: Math.round(base * 10) / 10 };
  });
  return {
    dorm,
    balance: Math.round((18 + rand() * 60) * 100) / 100,
    dailyUsage,
    updatedAt: Date.now(),
  };
}

export function demoEcard(): EcardSnapshot {
  const rand = rng('ecard' + isoDate(new Date()));
  const places = ['学生一食堂', '学生二食堂', '梧桐苑餐厅', '校园超市', '开水房', '校医院'];
  const now = Date.now();
  const transactions = Array.from({ length: 6 }).map((_, i) => ({
    id: `tx${i}`,
    time: now - i * (3 * 3600 * 1000 + Math.floor(rand() * 2400000)),
    place: places[Math.floor(rand() * places.length)],
    amount: -Math.round((4 + rand() * 22) * 100) / 100,
  }));
  const todaySpent = Math.round(-transactions.slice(0, 3).reduce((s, x) => s + x.amount, 0) * 100) / 100;
  return {
    balance: Math.round((40 + rand() * 160) * 100) / 100,
    todaySpent,
    monthSpent: Math.round((todaySpent + 380 + rand() * 300) * 100) / 100,
    transactions,
    updatedAt: now,
  };
}

/** 各校区的教学楼（房间号按楼的字母区生成，标注为演示数据） */
export const CAMPUS_BUILDINGS: Record<Campus, string[]> = {
  成都: ['4教A区', '4教B区', '4教C区', '5教', '6教', '科技园B区'],
  雅安: ['第一教学楼', '第二教学楼', '逸夫楼', '工学楼'],
  都江堰: ['一教', '二教', '实训楼'],
};

/** 兼容旧引用：默认展示雅安的楼 */
export const BUILDINGS = CAMPUS_BUILDINGS['雅安'];

function lettersOf(building: string): string[] {
  const m = building.match(/[A-D]区/);
  return m ? [m[0][0]] : ['A', 'B'];
}

export function demoClassrooms(
  campus: Campus,
  building: string,
  day: number,
  start: number,
  end: number,
): ClassroomRow[] {
  const rows: ClassroomRow[] = [];
  for (const letter of lettersOf(building)) {
    for (let n = 1; n <= 8; n++) {
      const room = `${letter}${n}0${n % 3 === 0 ? 2 : 1}`;
      const rand = rng(`${campus}-${building}-${room}-${day}`);
      const busy: number[] = [];
      // n % 3 === 0 的房间留空，保证任何时候都能看到几间空闲的（演示数据不至于变成 0 间）
      const alwaysFree = n % 3 === 0;
      for (let p = 1; p <= 12; p++) {
        if (!alwaysFree && rand() < 0.38) busy.push(p);
      }
      rows.push({
        room,
        building,
        capacity: 40 + Math.floor(rand() * 80),
        busy,
      });
    }
  }
  return rows.map((r) => ({ ...r, busy: r.busy.filter((p) => p >= start && p <= end) }));
}

export function demoSeats(campus: Campus = '雅安'): SeatArea[] {
  const areas = [
    { area: `${campus}校区 图书馆 2F 自习区`, total: 320 },
    { area: `${campus}校区 图书馆 3F 阅览室`, total: 180 },
    { area: `${campus}校区 图书馆 4F 考研专区`, total: 240 },
    { area: `${campus}校区 教学楼自习室`, total: 120 },
  ];
  return areas.map((a) => {
    const rand = rng(a.area + new Date().getHours());
    return { ...a, free: Math.floor(a.total * (0.15 + rand() * 0.5)) };
  });
}
