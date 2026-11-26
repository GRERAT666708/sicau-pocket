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

/** 单双周标记：(单)、(双)、单周、双周（课程名里的「单片机」不算） */
function weekMarkersOf(lines: string[]): string {
  let out = '';
  for (const line of lines) {
    const t = line.replace(/\s/g, '');
    const m = t.match(/^[（(【](单|双)[）)】]$/);
    if (m) {
      out += m[1];
      continue;
    }
    if (/^(单|双)周$/.test(t)) out += t[0];
  }
  return out;
}

/** 同一时段排了不同周次的课时，正方会在一个格子里上下堆两门课，这里按结构切块 */
function splitCourseBlocks(lines: string[]): string[][] {
  const blocks: string[][] = [];
  let cur: string[] = [];
  let sawWeeks = false;
  for (const raw of lines) {
    const line = raw.replace(/\u00a0/g, ' ').trim();
    if (!line) continue;
    if (cur.length && sawWeeks && startsNewCourseLine(line)) {
      blocks.push(cur);
      cur = [];
      sawWeeks = false;
    }
    cur.push(line);
    // 教室号「2-607」也能被 looksLikeWeeks 认成周次范围，这里要排除
    if (looksLikeWeeks(stripMetaTokens(line)) && !(looksLikeRoom(line) && !/周/.test(line))) {
      sawWeeks = true;
    }
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

/** 判断一行是不是「另一门课」的开头（周次之后出现的课程名） */
function startsNewCourseLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^(任课教师|教师|老师|上课教室|教室|地点|校区)\s*[:：]/.test(t)) return false;
  if (looksLikeWeeks(t)) return false;
  if (/^[（(]\s*(单|双|单双|全)\s*[）)]$/.test(t)) return false;
  if (/^\d+\s*人$/.test(t)) return false;
  if (/^[（(]\s*\d+\s*学时\s*[）)]$/.test(t)) return false;
  if (/^[\d,，\-\s周单双]+$/.test(t)) return false;
  const cjk = t.match(/[\u4e00-\u9fa5]/g)?.length ?? 0;
  const hasCode = /[\d_]{8,}/.test(t);
  if (cjk < 2 && !hasCode) return false;
  // 「科技园B区 C402」这种教室（有区/楼/室 + 门牌号）不是课程名
  if (looksLikeRoom(t) && /[A-Za-z]?\d{2,4}/.test(t) && !/(实验|理论|概论|原理|设计)$/.test(t)) {
    return false;
  }
  return true;
}

/** 解析一个「课程块」（一门课的信息；一个格子里可能有多块） */
function parseCourseBlock(lines: string[]): CellInfo | null {
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
    .replace(/[（(]\s*\d+\s*[）)]$/, '')
    .replace(/[（(]\s*(单|双)\s*[）)]$/, '');
  const codeMatch = name.match(/^(.*?)([\d_]{8,})$/);
  if (codeMatch) name = codeMatch[1].replace(/\s+/g, '');
  if (!name || name.length < 2) return null;
  if (/^\d{1,2}([-－]\d{1,2})?\s*节?$/.test(name)) return null; // 「34节」这种节次标签

  const weeksLineIndex = merged.findIndex(
    (l, i) =>
      (i > 0 || Boolean(colonSplit)) &&
      // 「2-607」这种是教室号，不是周次（周次一般带「周」字，纯数字范围也至少得是 1-16 这种）
      !(looksLikeRoom(l) && !/周/.test(l)) &&
      looksLikeWeeks(stripMetaTokens(l)),
  );
  // 单双周可能单独占一行「(单)」，也可能跟在课程名后面，统一并到周次串里
  const weeksSource =
    (weeksLineIndex >= 0 ? stripMetaTokens(merged[weeksLineIndex]) : '') + weekMarkersOf(merged);
  const weeks = weeksSource ? parseWeeksText(weeksSource) : [];

  const rest = merged.filter((_, i) => i !== 0 && i !== weeksLineIndex);
  let teacher: string | undefined = colonSplit?.[2] ? colonSplit[2].replace(/\s+/g, '') : undefined;
  let room: string | undefined;
  for (const rawLine of rest) {
    const line = stripMetaTokens(rawLine);
    if (!line) continue;
    if (/^[（(]\s*(单|双)\s*[）)]$/.test(line)) continue; // 单双周标记已经并进周次
    // 纯周次残渣（「1-16」「3,5,7」）跳过；但「2-607」「4-608」这种门牌号是教室，不能丢
    if (/^[\d,，\-\s周单双]+$/.test(line) && !/[A-Za-z]?\d{1,2}[-－][A-Za-z]?\d{3,4}/.test(line)) continue;
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

/**
 * 解析一个格子的多门课：同一时段不同周次在正方里会叠在一个 `<td>` 里，
 * 只认第一门会漏课（用户反馈：周四 3-4 的毛概、周五晚的动物解剖学实验都丢了）。
 */
export function parseCourseCellBlocks(lines: string[]): CellInfo[] {
  const cleaned = lines
    .map((l) => l.replace(/\u00a0/g, ' ').trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^\d+\s*人$/.test(l))
    .filter((l) => !COURSE_KIND.test(l) || l.length > 8);
  if (!cleaned.length) return [];
  const out: CellInfo[] = [];
  for (const block of splitCourseBlocks(cleaned)) {
    const info = parseCourseBlock(block);
    if (info) out.push(info);
  }
  return out;
}

/** 解析一个课表格子的多行文本（多门课时只取第一门，兼容旧调用） */
export function parseCourseCell(lines: string[]): CellInfo | null {
  return parseCourseCellBlocks(lines)[0] ?? null;
}

/** 页面标题里常带教室名，如「四川农业大学课程表(4-A103)」；学生课表里括号是姓名，不能当教室 */
function pageRoomHint(html: string): string | undefined {
  const matched = html.match(/课程表\s*[（(]([^）)]{2,20})[）)]/);
  const value = matched?.[1]?.trim();
  if (!value) return undefined;
  return /[-－]\s*[A-Za-z]?\d|\d{3}|教|楼/.test(value) ? value : undefined;
}

type GridLayout = { grid: HtmlCell[][]; headerRow: number; dayCols: Record<number, number> };

/** 在一张表格里找「星期」表头；找不到但传了上一张的列位置时，按「分页续表」处理 */
function findGridLayout(grid: HtmlCell[][], previous?: Record<number, number>): GridLayout | null {
  for (let r = 0; r < Math.min(grid.length, 6); r += 1) {
    const map: Record<number, number> = {};
    grid[r].forEach((cell, c) => {
      const text = cell.text.replace(/\s/g, '');
      const idx = DAY_KEYS.findIndex((k) => text === k || text.startsWith(k));
      const idx2 = idx >= 0 ? idx : DAY_KEYS_SHORT.findIndex((k) => text === k || text.startsWith(k));
      if (idx2 >= 0) map[idx2 + 1] = c;
    });
    if (Object.keys(map).length >= 5) return { grid, headerRow: r, dayCols: map };

    // 表头只写「一 二 三 …」的版本：一行里至少有 5 个单字周几，且列号递增
    const singleMap: Record<number, number> = {};
    grid[r].forEach((cell, c) => {
      const idx = DAY_KEYS_SINGLE.indexOf(cell.text.replace(/\s/g, ''));
      if (idx >= 0) singleMap[idx + 1] = c;
    });
    const singleCols = Object.entries(singleMap).map(([day, col]) => ({ day: Number(day), col }));
    const ascending = singleCols.every((item, i) => i === 0 || item.col > singleCols[i - 1].col);
    if (singleCols.length >= 5 && ascending) return { grid, headerRow: r, dayCols: singleMap };
  }
  // 打印课表跨页时，第二张表常常不再重复表头，直接沿用上一张的星期列
  if (previous && Object.keys(previous).length >= 5 && grid.length >= 2) {
    const width = grid.reduce((max, row) => Math.max(max, row.length), 0);
    const hasPeriodLabel = grid.some((row) => row.some((cell) => /节/.test(cell.text)));
    // 至少 7 个星期列 + 1 个节次列；有的分页表不带「上午/下午」分组列，宽度会少一列
    const wideEnough = width >= Object.keys(previous).length + 1;
    if (hasPeriodLabel && wideEnough) {
      // 列数和上一张一样就直接沿用；不一样时按「7 个星期列在最右边」右对齐推列号
      const prevWidth = Math.max(...Object.values(previous)) + 1;
      if (width === prevWidth) return { grid, headerRow: -1, dayCols: previous };
      const labelCols = width - DAY_KEYS.length;
      const shifted: Record<number, number> = {};
      for (let day = 1; day <= DAY_KEYS.length; day += 1) shifted[day] = labelCols + day - 1;
      return { grid, headerRow: -1, dayCols: shifted };
    }
  }
  return null;
}

function parseLayoutRows(layout: GridLayout, roomHint?: string): ParsedSlot[] {
  const { grid, headerRow, dayCols } = layout;
  const slots: ParsedSlot[] = [];
  const firstDayCol = Math.min(...Object.values(dayCols));
  let carried: { start: number; end: number } | null = null;
  for (let r = headerRow + 1; r < grid.length; r += 1) {
    const row = grid[r];
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
      // 一个格子里可能塞了不同周次的两门课，要全取
      for (const info of parseCourseCellBlocks(cell.lines)) {
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
  }
  return slots;
}

/** 从整页 HTML 里找出课表，解析成扁平的 slot 列表 */
export function parseTimetableHtml(html: string): ParsedSlot[] {
  const roomHint = pageRoomHint(html);
  const grids = extractTables(html)
    .map((t) => parseTable(t))
    // 分页后的第二张表可能只剩 2 行（晚上 9-10 节），不能按「> 2 行」过滤掉
    .filter((grid) => grid.length >= 2)
    .sort((a, b) => scoreTable(b) - scoreTable(a));

  // 以前只取分数最高的那一张表；教务系统打印课表分页时，晚上那半截在另一张表里，
  // 于是「课表底部几门课」整段丢失。现在把每张像课表的都解析一遍，按内容去重合并。
  const slots: ParsedSlot[] = [];
  const seen = new Set<string>();
  let prevCols: Record<number, number> | undefined;
  for (const grid of grids) {
    const layout = findGridLayout(grid, prevCols);
    if (!layout) continue;
    prevCols = layout.dayCols;
    for (const slot of parseLayoutRows(layout, roomHint)) {
      const key = `${slot.name}|${slot.teacher ?? ''}|${slot.day}|${slot.start}|${slot.end}|${slot.weeks.join(
        ',',
      )}|${slot.room ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      slots.push(slot);
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
