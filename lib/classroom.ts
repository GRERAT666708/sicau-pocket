import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { fetchJiaowuPage } from './jiaowu';
import { parseTimetableAny } from './timetable';
import type { Campus } from './types';

/** 教务系统的教室总表（公开页面，不需要登录） */
const CATALOG_URL = 'https://jiaowu.sicau.edu.cn/web/web/js_kb_cha/jshi_yk_1.asp';
const ROOM_URL = (bianhao: string) => `https://jiaowu.sicau.edu.cn/web/web/js_kb_cha/kbjshi.asp?bianhao=${bianhao}`;
const STORAGE_KEY = '@sicau-pocket/classroom/v1';

/** 一周内被认为还新鲜的毫秒数（用户要求「每周同步一次」） */
export const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

export type ClassroomInfo = {
  campus: Campus;
  room: string;
  capacity: number;
  kind: string;
  bianhao: string;
};

export type RoomSlot = { day: number; start: number; end: number; weeks: number[] };

export type RoomTimetable = { slots: RoomSlot[]; at: number };

export type ClassroomStore = {
  catalogAt: number;
  rooms: ClassroomInfo[];
  roomData: Record<string, RoomTimetable>;
};

const EMPTY: ClassroomStore = { catalogAt: 0, rooms: [], roomData: {} };

let store: ClassroomStore = EMPTY;
const listeners = new Set<() => void>();
let snapshot = EMPTY;

function emit() {
  snapshot = { ...store };
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getClassroomStore() {
  return snapshot;
}

export function useClassroomStore(): ClassroomStore {
  return useSyncExternalStore(subscribe, getClassroomStore, getClassroomStore);
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* 存储失败不影响本次使用 */
  }
}

export async function hydrateClassrooms() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<ClassroomStore>;
      store = {
        catalogAt: data.catalogAt ?? 0,
        rooms: data.rooms ?? [],
        roomData: data.roomData ?? {},
      };
      emit();
    }
  } catch {
    /* 读不到就当空 */
  }
}

/** 从教室总表 HTML 里抠出「校区 / 教室 / 容量 / 类型 / bianhao」 */
export function parseClassroomCatalog(html: string): ClassroomInfo[] {
  const rows: ClassroomInfo[] = [];
  const re =
    /<TD><div align="center">(\d+)<\/div><\/TD>\s*<TD><div align="center">([^<]*)<\/div><\/TD>\s*<TD><div align="center">([^<]*)<\/div><\/TD>\s*<TD><div align="center">([^<]*)<\/div><\/TD>\s*<TD><div align="center">([^<]*)<\/div><\/TD>[\s\S]{0,200}?bianhao=(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const campusText = m[2].trim();
    const campus = (['雅安', '成都', '都江堰'] as Campus[]).find((c) => campusText.startsWith(c));
    if (!campus) continue;
    const capacity = Number.parseInt(m[4].replace(/[^\d]/g, ''), 10);
    rows.push({
      campus,
      room: m[3].trim(),
      capacity: Number.isFinite(capacity) ? capacity : 0,
      kind: m[5].trim(),
      bianhao: m[6],
    });
  }
  return rows;
}

/** 「4-A103」→「4教」，「10-203」→「10教」，「2A101」→「2A」，「科技园B区B502」→「科技园」 */
export function buildingOf(room: string): string {
  const dash = /^(\d+)\s*[-－]/.exec(room);
  if (dash) return `${dash[1]}教`;
  if (/^科技园/.test(room)) return '科技园';
  if (/^艺术楼/.test(room)) return '艺术楼';
  if (/^逸夫楼/.test(room)) return '逸夫楼';
  if (/^机电实训/.test(room)) return '机电实训中心';
  const alpha = /^(\d+[A-Z])/i.exec(room);
  if (alpha) return alpha[1].toUpperCase();
  const digits = /^(\d{2,4})/.exec(room);
  if (digits) return `${digits[1]}号楼`;
  return '其他';
}

export function catalogFor(store: ClassroomStore, campus: Campus) {
  return store.rooms.filter((r) => r.campus === campus);
}

export function buildingsOf(store: ClassroomStore, campus: Campus): string[] {
  const set = new Map<string, number>();
  for (const r of catalogFor(store, campus)) {
    const b = buildingOf(r.room);
    set.set(b, (set.get(b) ?? 0) + 1);
  }
  return [...set.entries()]
    .sort((a, b) => {
      const na = Number.parseInt(a[0], 10);
      const nb = Number.parseInt(b[0], 10);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      if (Number.isFinite(na)) return -1;
      if (Number.isFinite(nb)) return 1;
      return a[0].localeCompare(b[0], 'zh');
    })
    .map(([b]) => b);
}

export function roomsOf(store: ClassroomStore, campus: Campus, building: string) {
  return catalogFor(store, campus)
    .filter((r) => buildingOf(r.room) === building)
    .sort((a, b) => a.room.localeCompare(b.room, 'zh', { numeric: true }));
}

export function isFresh(at: number, now = Date.now()) {
  return at > 0 && now - at < CACHE_TTL;
}

/** 拉教室总表（几百 KB，几秒），成功后写入缓存 */
export async function syncCatalog(force = false): Promise<{ ok: boolean; message: string; count: number }> {
  if (!force && isFresh(store.catalogAt) && store.rooms.length) {
    return { ok: true, message: '教室列表已是最新', count: store.rooms.length };
  }
  const page = await fetchJiaowuPage(CATALOG_URL);
  if (!page.ok) {
    return {
      ok: false,
      message: `教室列表抓取失败（HTTP ${page.status}${page.error ? ` · ${page.error}` : ''}）`,
      count: 0,
    };
  }
  const rooms = parseClassroomCatalog(page.text);
  if (!rooms.length) {
    return { ok: false, message: '教室列表解析失败，教务可能改版了', count: 0 };
  }
  store = { ...store, rooms, catalogAt: Date.now() };
  emit();
  await persist();
  return { ok: true, message: `已同步 ${rooms.length} 间教室`, count: rooms.length };
}

function slotsFromHtml(html: string): RoomSlot[] {
  return parseTimetableAny(html)
    .filter((s) => s.day >= 1 && s.day <= 7 && s.start >= 1)
    .map((s) => ({ day: s.day, start: s.start, end: Math.max(s.start, s.end), weeks: s.weeks }));
}

/** 抓一间教室的整学期课表（一页约 30KB） */
export async function syncRoom(bianhao: string): Promise<boolean> {
  const page = await fetchJiaowuPage(ROOM_URL(bianhao));
  if (!page.ok) return false;
  const slots = slotsFromHtml(page.text);
  store = {
    ...store,
    roomData: { ...store.roomData, [bianhao]: { slots, at: Date.now() } },
  };
  return true;
}

export async function saveRooms() {
  emit();
  await persist();
}

/** 按教学楼批量同步，onProgress 用来显示「已同步 12 / 67」 */
export async function syncBuilding(
  campus: Campus,
  building: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ done: number; total: number; failed: number }> {
  const all = roomsOf(store, campus, building);
  const pending = all.filter((r) => !isFresh(store.roomData[r.bianhao]?.at ?? 0));
  let done = 0;
  let failed = 0;
  const total = pending.length;
  const CONCURRENCY = 4;
  let cursor = 0;

  async function worker() {
    while (cursor < pending.length) {
      const item = pending[cursor++];
      const ok = await syncRoom(item.bianhao);
      if (!ok) failed += 1;
      done += 1;
      onProgress?.(done, total);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total || 1) }, worker));
  await saveRooms();
  return { done, total, failed };
}

/** 这节课有没有课（按周次判断，支持单双周） */
export function busyAt(tt: RoomTimetable | undefined, day: number, start: number, end: number, week: number) {
  if (!tt) return null;
  const hit = tt.slots.some(
    (s) =>
      s.day === day &&
      s.start <= end &&
      s.end >= start &&
      (s.weeks.length === 0 || s.weeks.includes(week)),
  );
  return hit;
}

/**
 * 前台自动补齐：打开 App / 从后台回到前台时调用。
 * iOS 的后台调度不保证准时，所以这里不依赖后台任务，改成「用的时候就补」：
 *   - 教室列表超过 7 天：静默拉一次（130KB，几秒）
 *   - 当前校区当前楼的教室课表超过 7 天：也补，但只补用户正在看的那一栋，避免流量爆炸
 */
export async function autoSyncIfStale(campus?: Campus, building?: string): Promise<string | null> {
  const notes: string[] = [];
  if (!isFresh(store.catalogAt)) {
    const res = await syncCatalog(true);
    if (res.ok) notes.push(`教室列表 ${res.count} 间`);
  }
  if (campus && building) {
    const rooms = roomsOf(store, campus, building);
    const stale = rooms.filter((r) => !isFresh(store.roomData[r.bianhao]?.at ?? 0));
    if (rooms.length && stale.length === rooms.length) {
      const res = await syncBuilding(campus, building);
      if (res.done) notes.push(`${building} ${res.done} 间教室课表`);
    }
  }
  return notes.length ? `已自动同步：${notes.join('、')}` : null;
}

export function periodsOfGroup(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
