import type { Campus } from './types';
/**
 * 教务系统课表解析（川农现在这套：老版正方 ASP 界面，GB2312 编码）。
 *
 * 抓到的课表网格长这样：
 *   |    |      | 星期一 | 星期二 | ... |
 *   | 上午(rowspan=2) | 12 节 | 思想道德与法治405202609010202<br>唐刚(2)<br>5-14 周<br>174人<br>通识必修 | ... |
 *
 * 一个格子里第 1 行是「课程名 + 课程号」粘在一起，后面依次是教师、周次、人数、课程性质。
 * 本文件只做纯文本/HTML → 结构化数据，不碰网络，方便单独测试。
 */

import { extractTables, parseTable, stripTags, type HtmlCell } from './html';
import type { Course, CourseSlot } from './types';

export type ParsedSlot = {
  name: string;
  teacher?: string;
  room?: string;
  day: number; // 1=周一
  start: number; // 第几节开始
  end: number;
  weeks: number[];
  /** 教室借用/活动登记（没有课程号、备注里写「借用教室」），不是自己的课 */
  booking?: boolean;
};

export type ParsedCourse = {
  name: string;
  teacher?: string;
  room?: string;
  booking?: boolean;
  /** 同一门课不同星期/节次可能在不同教室，所以每个时段各存一份 */
  slots: { day: number; start: number; end: number; weeks: number[]; room?: string }[];
};

const DAY_KEYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
const DAY_KEYS_SHORT = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
/** 有些课表表头只写「一 二 三 四 五 六 日」 */
const DAY_KEYS_SINGLE = ['一', '二', '三', '四', '五', '六', '日'];
const COURSE_KIND = /(通识必修|通识选修|专业必修|专业选修|专业方向课|公共必修|公共选修|实践教学|必修|选修|限选|任选|军训|实习)$/;
const PERIOD_GROUP = [
  { label: '上午', from: 1, to: 4 },
  { label: '下午', from: 5, to: 8 },
  { label: '晚上', from: 9, to: 12 },
];

/** 从「1-16周」「5-14」「1-8,10-12周」「第1-16周(单)」这类文本里解析出具体周次 */
export function parseWeeksText(input: string): number[] {
  const text = input
    .replace(/[（(]\s*([单双])\s*[）)]/g, '$1')
    .replace(/第|周|星期|节/g, '')
    .replace(/[，、]/g, ',')
    .trim();
  const oddOnly = /单/.test(text);
  const evenOnly = /双/.test(text);
  const weeks = new Set<number>();
  const rangeRe = /(\d{1,2})\s*(?:[-–~至]\s*(\d{1,2}))?/g;
  let m: RegExpExecArray | null;
  while ((m = rangeRe.exec(text))) {
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (!Number.isFinite(from)) continue;
    for (let w = from; w <= Math.min(to, 30); w += 1) {
      if (w < 1) continue;
      if (oddOnly && w % 2 === 0) continue;
      if (evenOnly && w % 2 === 1) continue;
      weeks.add(w);
    }
  }
  return [...weeks].sort((a, b) => a - b);
}

function looksLikeWeeks(line: string): boolean {
  return /^(第)?\s*\d{1,2}\s*(-{1,2}|–|~|至)?\s*\d{0,2}\s*(周|$)/.test(line) && /\d/.test(line)
    ? true
    : /^[\d,\-\s周单双()（）]+$/.test(line) && /\d/.test(line);
}

function periodGroupOf(rowText: string, fallback: number): { from: number; to: number } {
  const found = PERIOD_GROUP.find((g) => rowText.includes(g.label));
  if (found) return { from: found.from, to: found.to };
  // 没有「上午/下午/晚上」分组列时不要缩到一格，否则「1-2节」会被压成第 1 节
  return { from: 1, to: 12 };
}

/** 把「12 节」「34 节」「910 节」「1112 节」解析成起止节次 */
function periodRangeOf(periodText: string, group: { from: number; to: number }): { start: number; end: number } {
  const digits = periodText.replace(/[^\d]/g, '');
  const inRange = (n: number) => n >= group.from && n <= group.to;
  if (!digits) return { start: group.from, end: Math.min(group.from + 1, group.to) };
  if (digits.length === 1) {
    const n = Number(digits);
    return { start: inRange(n) ? n : group.from, end: inRange(n) ? n : group.from };
  }
  // 两位：12 / 34 / 56 / 78 这种「连排两节」
  if (digits.length === 2) {
    const d0 = Number(digits[0]);
    const d1 = Number(digits[1]);
    if (inRange(d0) && inRange(d1) && d1 === d0 + 1) return { start: d0, end: d1 };
    const n = Number(digits);
    if (inRange(n)) return { start: n, end: n };
    return { start: group.from, end: Math.min(group.from + 1, group.to) };
  }
  // 三位（910）与四位（1112）
  const cut = digits.length - 2;
  const a = Number(digits.slice(0, cut));
  const b = Number(digits.slice(cut));
  if (inRange(a) && inRange(b) && b > a) return { start: a, end: b };
  return { start: group.from, end: Math.min(group.from + 1, group.to) };
}

type CellInfo = {
  name: string;
  teacher?: string;
  room?: string;
  weeks: number[];
  hasCode: boolean;
};

/** 去掉「[2学时]」「(4学时)」「[实验]」这类元信息，避免干扰周次解析 */
function stripMetaTokens(line: string): string {
  return line
    .replace(/\[[^\]]*\]|\([^)]*\)|（[^）]*）|［[^］]*］/g, (m) =>
      /学时|实验|上机|理论|讲授|实践/.test(m) ? '' : m,
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/** 像教室的串：4-B608 / 2-407 / 科B区C402 / 4-A208 / A103 / 3教 401 */
function looksLikeRoom(line: string): boolean {
  return (
    /[A-Za-z]?\d{1,2}\s*[-－]\s*[A-Za-z]?\d{2,4}/.test(line) ||
    /[A-Za-z]?区[A-Za-z]?\d{2,4}/.test(line) ||
    /(教|楼|室|馆|场|中心|操场|球场|体育馆|田径|运动场)\s*[A-Za-z]?\d{0,4}/.test(line) ||
    /[A-Za-z]{1,2}[-－]?\d{3,4}/.test(line)
  );
}

function looksLikeTeacher(line: string): boolean {
  const plain = line.replace(/[（(]\s*\d+\s*[）)]/g, '').trim();
  return /^[\u4e00-\u9fa5]{2,4}$/.test(plain) && !/(校区|教学|实验|楼|室|馆|中心|学院|大学)/.test(plain);
}

function looksLikeBooking(text: string): boolean {
  return /借用教室|借用|继教院|培训班|讲座|会议|开会|考试安排/.test(text);
}

/** 解析一个课表格子的多行文本 */
export function parseCourseCell(lines: string[]): CellInfo | null {
  const cleaned = lines
    .map((l) => l.replace(/\u00a0/g, ' ').trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^\d+\s*人$/.test(l))
    .filter((l) => !COURSE_KIND.test(l) || l.length > 8);
  if (!cleaned.length) return null;

  const merged: string[] = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const line = cleaned[i];
    if (looksLikeWeeks(line) && cleaned[i + 1] === '周') {
      merged.push(line + '周');
      i += 1;
      continue;
    }
    merged.push(line);
  }

  // 有的版式把课程名单独一行、冒号在行尾，教师另起一行
  const headRaw = merged[0] ?? '';
  const headNoMeta = stripMetaTokens(headRaw);
  const colonSplit = headNoMeta.match(/^([^:：]+)[:：]\s*(.*)$/);
  let name = (colonSplit ? colonSplit[1] : headNoMeta)
    .replace(/\s+/g, '')
    .replace(/[:：]$/, '')
    .replace(/[（(]\s*\d+\s*[）)]$/, '');
  const codeMatch = name.match(/^(.*?)([\d_]{8,})$/);
  if (codeMatch) name = codeMatch[1].replace(/\s+/g, '');
  if (!name || name.length < 2) return null;
  if (/^\d{1,2}([-－]\d{1,2})?\s*节?$/.test(name)) return null; // 「34节」这种节次标签

  const weeksLineIndex = merged.findIndex((l, i) => i > 0 || colonSplit ? looksLikeWeeks(stripMetaTokens(l)) : false);
  const weeksSource = weeksLineIndex >= 0 ? stripMetaTokens(merged[weeksLineIndex]) : '';
  const weeks = weeksSource ? parseWeeksText(weeksSource) : [];

  const rest = merged.filter((_, i) => i !== 0 && i !== weeksLineIndex);
  let teacher: string | undefined = colonSplit?.[2] ? colonSplit[2].replace(/\s+/g, '') : undefined;
  let room: string | undefined;
  for (const rawLine of rest) {
    const line = stripMetaTokens(rawLine);
    if (!line) continue;
    if (/^[\d,，\-\s周单双]+$/.test(line)) continue; // 纯周次残渣
    // 「成都校区: 4-B608」这类：冒号后面是教室
    const roomSplit = line.match(/^(.*?)[:：]\s*(.+)$/);
    if (roomSplit && looksLikeRoom(roomSplit[2])) {
      room ??= roomSplit[2].replace(/\s+/g, '');
      continue;
    }
    if (looksLikeRoom(line)) {
      room ??= line.replace(/^.*?[:：]\s*/, '').replace(/\s+/g, '');
      continue;
    }
    // 「杨沛明(2) 成都校区:」这种：教师和校区挤在一行，取第一个空格前的片段
    const firstToken = line.split(/\s+/)[0];
    if (!teacher && firstToken !== line && looksLikeTeacher(firstToken)) {
      teacher = firstToken.trim();
      continue;
    }
    if (!teacher && looksLikeTeacher(line)) {
      teacher = line.replace(/[（(]\s*\d+\s*[）)]/g, '').trim();
    }
  }
  if (teacher) teacher = teacher.replace(/[（(]\s*\d+\s*[）)]/g, '') || undefined;

  return { name, teacher, room, weeks, hasCode: Boolean(codeMatch) || /[:：]/.test(headRaw) };
}

/** 页面标题里常带教室名，如「四川农业大学课程表(4-A103)」；学生课表里括号是姓名，不能当教室 */
function pageRoomHint(html: string): string | undefined {
  const matched = html.match(/课程表\s*[（(]([^）)]{2,20})[）)]/);
  const value = matched?.[1]?.trim();
  if (!value) return undefined;
  return /[-－]\s*[A-Za-z]?\d|\d{3}|教|楼/.test(value) ? value : undefined;
}

/** 从整页 HTML 里找出课表，解析成扁平的 slot 列表 */
export function parseTimetableHtml(html: string): ParsedSlot[] {
  const tables = extractTables(html);
  const best = tables
    .map((t) => parseTable(t))
    .filter((grid) => grid.length > 2)
    .sort((a, b) => scoreTable(b) - scoreTable(a))[0];
  if (!best) return [];
  const roomHint = pageRoomHint(html);

  // 找到含「星期一」的表头行，确定每一列是周几
  let headerRowIndex = -1;
  let dayCols: Record<number, number> = {};
  for (let r = 0; r < Math.min(best.length, 6); r += 1) {
    const map: Record<number, number> = {};
    best[r].forEach((cell, c) => {
      const text = cell.text.replace(/\s/g, '');
      const idx = DAY_KEYS.findIndex((k) => text === k || text.startsWith(k));
      const idx2 = idx >= 0 ? idx : DAY_KEYS_SHORT.findIndex((k) => text === k || text.startsWith(k));
      if (idx2 >= 0) map[idx2 + 1] = c;
    });
    if (Object.keys(map).length >= 5) {
      headerRowIndex = r;
      dayCols = map;
      break;
    }
    // 表头只写「一 二 三 …」的版本：一行里至少有 5 个单字周几，且列号递增
    const singleMap: Record<number, number> = {};
    best[r].forEach((cell, c) => {
      const idx = DAY_KEYS_SINGLE.indexOf(cell.text.replace(/\s/g, ''));
      if (idx >= 0) singleMap[idx + 1] = c;
    });
    const singleCols = Object.entries(singleMap).map(([day, col]) => ({ day: Number(day), col }));
    const ascending = singleCols.every((item, i) => i === 0 || item.col > singleCols[i - 1].col);
    if (singleCols.length >= 5 && ascending) {
      headerRowIndex = r;
      dayCols = singleMap;
      break;
    }
  }
  if (headerRowIndex < 0) return [];

  const slots: ParsedSlot[] = [];
  const firstDayCol = Math.min(...Object.values(dayCols));
  let carried: { start: number; end: number } | null = null;
  for (let r = headerRowIndex + 1; r < best.length; r += 1) {
    const row = best[r];
    const rowText = row.map((c) => c.text).join(' ');
    const group = periodGroupOf(rowText, 1);

    // 节次标签可能在第一列、也可能在第二列（前面还有「上午/下午」分组列）；
    // 行跨越多行时只有第一行带标签，后面的行沿用上一次的节次。
    const labelCells = row.filter((c, i) => i < firstDayCol && c.row === r && c.text.trim());
    const label = labelCells.find((c) => /节/.test(c.text)) ?? labelCells[labelCells.length - 1];
    let period: { start: number; end: number } | null = null;
    if (label && /\d/.test(label.text)) {
      period = periodRangeOf(label.text, group);
      carried = period;
    }
    const { start, end } = period ?? carried ?? { start: group.from, end: group.from + 1 };

    for (const [dayKey, col] of Object.entries(dayCols)) {
      const cell = row[Number(col)];
      if (!cell || !cell.lines.length) continue;
      // 课程格子跨多行时，只在它出现的第一行记录
      if (cell.row !== r) continue;
      const info = parseCourseCell(cell.lines);
      if (!info) continue;
      const booking = looksLikeBooking(cell.text) || /学院$|中心$|办公室$|培训班$/.test(info.name);
      slots.push({
        name: info.name,
        teacher: info.teacher,
        room: info.room ?? roomHint,
        day: Number(dayKey),
        start,
        end: Math.max(end, start + Math.max(1, cell.rowSpan) - 1),
        weeks: info.weeks,
        booking,
      });
    }
  }
  return slots;
}

function scoreTable(grid: HtmlCell[][]): number {
  let score = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (DAY_KEYS.some((k) => cell.text.includes(k))) score += 5;
      if (/周/.test(cell.text) && /\d/.test(cell.text)) score += 2;
    }
  }
  return score;
}

/** 解析失败时给用户看的诊断信息（表格几个、星期列几列） */
export function timetableDiagnostics(html: string): string {
  const tables = extractTables(html);
  const grids = tables.map((t) => parseTable(t)).filter((grid) => grid.length > 2);
  let maxDayCols = 0;
  for (const grid of grids) {
    for (const row of grid.slice(0, 6)) {
      const count = row.filter((cell) => {
        const text = cell.text.replace(/\s/g, '');
        return DAY_KEYS.some((k) => text.startsWith(k)) || DAY_KEYS_SINGLE.includes(text);
      }).length;
      maxDayCols = Math.max(maxDayCols, count);
    }
  }
  const frames = (html.match(/<!--frame-->/g) ?? []).length;
  return `表格 ${tables.length} 个、课表网格 ${grids.length} 个、最多星期列 ${maxDayCols} 列${
    frames ? `、内嵌框架 ${frames} 个` : ''
  }`;
}

/** 把 flat slot 合并成课程（同名 + 同学期视为同一门） */
export function groupParsedSlots(slots: ParsedSlot[]): ParsedCourse[] {
  const map = new Map<string, ParsedCourse>();
  for (const slot of slots) {
    const key = `${slot.name}|${slot.teacher ?? ''}`;
    const existing = map.get(key);
    const item = {
      day: slot.day,
      start: slot.start,
      end: slot.end,
      weeks: slot.weeks,
      room: slot.room,
    };
    if (existing) {
      existing.slots.push(item);
      existing.room ??= slot.room;
      existing.booking = Boolean(existing.booking) || Boolean(slot.booking);
    } else {
      map.set(key, {
        name: slot.name,
        teacher: slot.teacher,
        room: slot.room,
        booking: Boolean(slot.booking),
        slots: [item],
      });
    }
  }
  return [...map.values()];
}

/** 转成 App 内部的 Course 结构（id 由调用方提供） */
export function toCourses(parsed: ParsedCourse[], makeId: (index: number) => string): Course[] {
  return parsed.map((p, index) => {
    const slots: CourseSlot[] = p.slots.map((s, si) => ({
      id: `${makeId(index)}-${si}`,
      day: s.day,
      start: s.start,
      end: s.end,
      weeks: s.weeks.length ? s.weeks : Array.from({ length: 16 }, (_, i) => i + 1),
      // 优先用这个时段自己的教室；没有才回落到整门课的教室
      room: s.room ?? p.room,
    }));
    return {
      id: makeId(index),
      name: p.name,
      teacher: p.teacher,
      room: p.room,
      colorIndex: index % 7,
      slots,
    };
  });
}

/**
 * 从课表页面里认出校区（单元格里常写「成都校区：4-B608」）。
 * 三个校区名各数一次，取出现最多的；都没出现返回 null。
 */
export function detectCampus(text: string): Campus | null {
  if (!text) return null;
  const campuses: Campus[] = ['雅安', '成都', '都江堰'];
  let best: Campus | null = null;
  let bestCount = 0;
  for (const campus of campuses) {
    const count = text.split(`${campus}校区`).length - 1;
    if (count > bestCount) {
      best = campus;
      bestCount = count;
    }
  }
  return best;
}

/**
 * 先按表格解析，不行再按「列表式文本」兜底。
 * 有的页面（或代理改写后）课表不在 <table> 里，而是一行一门课的纯文本。
 */
export function parseTimetableAny(html: string): ParsedSlot[] {
  const fromTable = parseTimetableHtml(html);
  if (fromTable.length) return fromTable;
  let fromText: ParsedCourse[] = [];
  try {
    fromText = parseTimetableText(stripTags(html));
  } catch {
    fromText = [];
  }
  return fromText.flatMap((course) =>
    course.slots.map((slot) => ({
      name: course.name,
      teacher: course.teacher,
      room: slot.room ?? course.room,
      day: slot.day,
      start: slot.start,
      end: slot.end,
      weeks: slot.weeks,
      booking: false,
    })),
  );
}

/**
 * 纯文本课表解析：教务系统里另有一种「列表式」课表，一行一门课，
 * 形如：高等数学 张三 1-16周 星期一 第1-2节 1-101
 */
export function parseTimetableText(text: string): ParsedCourse[] {
  const out: ParsedCourse[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const dayMatch = line.match(/(?:星期|周)([一二三四五六日天])/);
    if (!dayMatch) continue;
    const day = '一二三四五六日天'.indexOf(dayMatch[1]) + 1;
    const periodMatch = line.match(/第?\s*(\d{1,2})\s*[-–~至]\s*(\d{1,2})\s*节/);
    const start = periodMatch ? Number(periodMatch[1]) : 1;
    const end = periodMatch ? Number(periodMatch[2]) : start;
    const weeksMatch = line.match(/([\d,\-–~至单双]+)\s*周/);
    const weeks = weeksMatch ? parseWeeksText(weeksMatch[1]) : [];
    const name = line.split(/[\s\t]/)[0].replace(/[（(].*?[）)]$/, '');
    const roomMatch = line.match(/([\u4e00-\u9fa5A-Za-z0-9]{1,10}(?:教|楼|室|馆)[\u4e00-\u9fa5A-Za-z0-9\-]*|\d+[-－]\d{2,4})/);
    if (!name || name.length < 2) continue;
    out.push({ name, room: roomMatch?.[1], slots: [{ day, start, end, weeks }] });
  }
  return mergeParsed(out);
}

function mergeParsed(list: ParsedCourse[]): ParsedCourse[] {
  const map = new Map<string, ParsedCourse>();
  for (const item of list) {
    const existing = map.get(item.name);
    if (existing) existing.slots.push(...item.slots);
    else map.set(item.name, { ...item, slots: [...item.slots] });
  }
  return [...map.values()];
}
