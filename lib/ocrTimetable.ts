import type { ParsedCourse } from './timetable';
import { parseCourseCell } from './timetable';
import type { OcrLine } from '../modules/mlkit-ocr';

/**
 * 截图 OCR → 课程。
 *
 * 两步走：
 *  1) 整图识别一次，用表头「星期一…星期日」定出 7 列中心，用左栏「12节 / 34节 / 56节 / 78节 / 晚910节」
 *     定出各节次的 y 位置；
 *  2) 按列把图切开逐列再识别 —— 不切的话 ML Kit 会把左右相邻两个单元格的文字连成一句
 *     （实测「动物生理学:马细胞生物学(动):」就是两列粘一起）。
 *
 * 每列的每个文字块按 y 归到节次、按 x 缩进区分「课名 / 老师」，按内容区分「教室 / 周次」。
 */

const DAY_CN = ['一', '二', '三', '四', '五', '六', '日'];

/** OCR 常见错字统一修一下 */
function normalize(text: string): string {
  return text
    .replace(/([呈是早量])期/g, '星期')
    .replace(/咸都/g, '成都')
    .replace(/(校|核|学|按|桉|案)[区匹]/g, '校区')
    .replace(/[：]/g, ':')
    .replace(/[|丨]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dayOf(text: string): number | null {
  const m = /(?:星期|周)\s*([一二三四五六日天])/.exec(text);
  if (!m) return null;
  const ch = m[1] === '天' ? '日' : m[1];
  const idx = DAY_CN.indexOf(ch);
  return idx >= 0 ? idx + 1 : null;
}

/** 12节 / 34 / 晚910节 → 起止节次 */
function periodsOf(text: string): { start: number; end: number } | null {
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return null;
  if (digits.length === 1) return { start: Number(digits), end: Number(digits) };
  if (digits.length === 2) return { start: Number(digits[0]), end: Number(digits[1]) };
  if (digits.length === 3) return { start: Number(digits[0]), end: Number(digits.slice(1)) };
  return null;
}

export type OcrBand = { y: number; top: number; bottom: number; start: number; end: number };
export type OcrLayout = {
  /** 列中心（原图 x），下标 1..7 对应周一..周日 */
  centers: number[];
  bands: OcrBand[];
  headerBottom: number;
  warnings: string[];
};

type Box = OcrLine & { text: string; cx: number; cy: number };

function toBoxes(lines: OcrLine[]): Box[] {
  const out: Box[] = [];
  for (const l of lines ?? []) {
    if (!l || typeof l.text !== 'string') continue;
    if (!(l.w > 0) || !(l.h > 0)) continue;
    const text = normalize(l.text);
    if (!text) continue;
    out.push({ ...l, text, cx: l.x + l.w / 2, cy: l.y + l.h / 2 });
  }
  return out;
}

/** 第一步：整图识别结果 → 列中心 + 节次带 */
export function detectLayout(raw: OcrLine[]): OcrLayout {
  const warnings: string[] = [];
  const boxes = toBoxes(raw);
  if (!boxes.length) return { centers: [], bands: [], headerBottom: 0, warnings: ['这张图里没识别出文字'] };

  const dayHits: { day: number; b: Box }[] = [];
  for (const b of boxes) {
    const day = dayOf(b.text);
    if (day) dayHits.push({ day, b });
  }

  const centers = new Array<number>(8).fill(0);
  for (const { day, b } of dayHits) {
    const cur = centers[day];
    if (!cur || b.y < centers[0]) centers[day] = b.cx;
  }
  const labelTop = dayHits.length ? Math.min(...dayHits.map((d) => d.b.y)) : 0;
  const labelBottom = dayHits.length ? Math.max(...dayHits.map((d) => d.b.y + d.b.h)) : 0;
  const headerBottom = labelBottom ? labelBottom + 6 : 0;

  const known = [1, 2, 3, 4, 5, 6, 7].filter((d) => centers[d] > 0);
  if (known.length < 3) {
    return {
      centers,
      bands: [],
      headerBottom,
      warnings: ['没找到「星期一…星期日」这一行；截图别把表头裁掉'],
    };
  }

  let gap = 0;
  for (let i = 1; i < known.length; i++) gap += (centers[known[i]] - centers[known[i - 1]]) / (known[i] - known[i - 1]);
  gap = gap / (known.length - 1) || 150;

  for (let d = 1; d <= 7; d++) {
    if (centers[d] > 0) continue;
    let left = d - 1;
    while (left >= 1 && !centers[left]) left--;
    let right = d + 1;
    while (right <= 7 && !centers[right]) right++;
    if (left >= 1 && right <= 7) {
      centers[d] = centers[left] + ((d - left) * (centers[right] - centers[left])) / (right - left);
    } else if (left >= 1) {
      centers[d] = centers[left] + (d - left) * gap;
    } else if (right <= 7) {
      centers[d] = centers[right] - (right - d) * gap;
    } else {
      centers[d] = gap * d;
    }
  }

  const leftLimit = centers[1] - gap * 0.45;
  const bands: OcrBand[] = [];
  for (const b of boxes.filter((x) => x.x < leftLimit).sort((a, b) => a.y - b.y)) {
    const p = periodsOf(b.text);
    if (!p) continue;
    const last = bands[bands.length - 1];
    if (last && p.start <= last.start) continue;
    bands.push({ y: b.y + b.h / 2, top: 0, bottom: 0, start: p.start, end: p.end });
  }
  // 左侧标签常被 OCR 成「12 节」「晚 910」这种碎片，认出的个数不足时统一按五段处理
  if (bands.length < 3 || bands.length > 6) {
    bands.length = 0;
    const top = headerBottom + 24;
    const bottom = Math.max(...boxes.map((b) => b.y + b.h));
    const h = (bottom - top) / 5;
    for (let i = 0; i < 5; i++) {
      bands.push({ y: Math.round(top + i * h), top: 0, bottom: 0, start: i * 2 + 1, end: i * 2 + 2 });
    }
    warnings.push('没识别出左侧节次，按五段估算，导入前请核对');
  }

  for (let d = 1; d <= 7; d++) if (!dayHits.some((h) => h.day === d)) warnings.push(`${['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'][d]} 的表头没认出来，这一列可能漏课`);

  return { centers, bands, headerBottom, warnings };
}

/** 每列的横向裁切范围（半径取列距一半，首列左边多留一点） */
export function columnBounds(layout: OcrLayout, width: number): { day: number; left: number; right: number }[] {
  const { centers } = layout;
  const gap = centers[2] - centers[1] || 150;
  const out: { day: number; left: number; right: number }[] = [];
  for (let d = 1; d <= 7; d++) {
    out.push({
      day: d,
      left: Math.max(0, Math.round(centers[d] - gap / 2)),
      right: Math.min(width, Math.round(centers[d] + gap / 2)),
    });
  }
  return out;
}

/**
 * 左侧「12节/34节」标签的高度和真实单元格对不上（这张图里 78 节标签比 7-8 节单元格低了 100 多像素），
 * 所以不用标签的 y 当分界，而是把所有列的正文行按 y 聚类，再按标签个数均分成 5 段。
 */
export function assignBands(labels: OcrBand[], columnLines: OcrLine[][]): OcrBand[] {
  const ys: number[] = [];
  for (const lines of columnLines) for (const l of lines ?? []) ys.push(l.y + l.h / 2);
  if (!labels.length || ys.length < labels.length * 2) return labels;

  ys.sort((a, b) => a - b);
  const k = labels.length;
  let centers: number[] = [];
  for (let i = 0; i < k; i++) centers.push(ys[Math.floor(((i + 0.5) / k) * ys.length)]);
  let assignment: number[] = new Array(ys.length).fill(0);
  for (let iter = 0; iter < 30; iter++) {
    let moved = false;
    for (let i = 0; i < ys.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = Math.abs(ys[i] - centers[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assignment[i] !== best) {
        assignment[i] = best;
        moved = true;
      }
    }
    const sums = new Array(k).fill(0);
    const counts = new Array(k).fill(0);
    for (let i = 0; i < ys.length; i++) {
      sums[assignment[i]] += ys[i];
      counts[assignment[i]] += 1;
    }
    for (let c = 0; c < k; c++) if (counts[c]) centers[c] = sums[c] / counts[c];
    if (!moved) break;
  }
  centers = centers.slice().sort((a, b) => a - b);

  const out: OcrBand[] = [];
  for (let i = 0; i < k; i++) {
    const top = i === 0 ? -Infinity : (centers[i - 1] + centers[i]) / 2;
    const bottom = i === k - 1 ? Infinity : (centers[i] + centers[i + 1]) / 2;
    const label = labels[Math.min(i, labels.length - 1)];
    out.push({ y: centers[i], top, bottom, start: label.start, end: label.end });
  }
  return out;
}

const isWeeksLine = (t: string) => /周/.test(t) && /\d/.test(t);
const isRoomLine = (t: string) =>
  /校区|校[区匹]|室|楼|馆|操场|场$|中心/.test(t) || /[A-Za-z]?\d{1,2}\s*[-－]\s*[A-Za-z]?\d{2,4}/.test(t);

/** 把同一行（y 接近）的文字块按 x 拼成一句，还原单元格里的「视觉行」 */
function rowsOf(lines: OcrLine[]): { y: number; x: number; text: string }[] {
  const boxes = toBoxes(lines).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: { y: number; x: number; text: string }[] = [];
  let cur: Box[] = [];
  const flush = () => {
    if (!cur.length) return;
    const sorted = [...cur].sort((a, b) => a.x - b.x);
    let text = '';
    let prevRight = 0;
    for (const b of sorted) {
      if (text && b.x - prevRight > 14) text += ' ';
      text += b.text;
      prevRight = b.x + b.w;
    }
    rows.push({ y: sorted[0].y, x: sorted[0].x, text: text.trim() });
    cur = [];
  };
  for (const b of boxes) {
    const last = cur[cur.length - 1];
    if (last && b.y - last.y > 22) flush();
    cur.push(b);
  }
  flush();
  return rows.filter((r) => r.text);
}

/** 第二步：单列识别结果 + 节次带 → 课程 */
export function parseColumn(day: number, bands: OcrBand[], lines: OcrLine[]): ParsedCourse[] {
  const rows = rowsOf(lines);
  if (!rows.length || !bands.length) return [];

  // 按节次段严格归属；折行后的最后一行常压在下界外一二十像素，
  // 这类「周次/教室碎片」在下面会被并回上一格，所以这里不做容差。
  const bandIndexOf = (y: number) => {
    for (let i = 0; i < bands.length; i++) {
      if (y >= bands[i].top && y < bands[i].bottom) return i;
    }
    return bands.length - 1;
  };

  const cells = new Map<number, { y: number; x: number; text: string }[]>();
  rows.forEach((r) => {
    const i = bandIndexOf(r.y);
    const arr = cells.get(i) ?? [];
    arr.push(r);
    cells.set(i, arr);
  });

  // 每格首行的「周次 / 教室」碎片其实是上一格折下来的尾巴，并回去，
  // 否则会出现「专业概论与新生 0 周」这种。
  const indices = [...cells.keys()].sort((a, b) => a - b);
  for (const i of indices) {
    const list = cells.get(i);
    if (!list) continue;
    const prevIdx = indices[indices.indexOf(i) - 1];
    const prev = prevIdx != null ? cells.get(prevIdx) : undefined;
    if (!prev) continue;
    const sorted = [...list].sort((a, b) => a.y - b.y);
    const moved: typeof sorted = [];
    while (sorted.length && (isWeeksLine(sorted[0].text) || isRoomLine(sorted[0].text))) {
      moved.push(sorted.shift()!);
    }
    if (moved.length) {
      prev.push(...moved);
      cells.set(i, sorted);
    }
  }

  const out: ParsedCourse[] = [];
  let lastInDay: ParsedCourse | null = null;
  for (const [i, list] of cells) {
    const band = bands[i];
    const sorted = [...list].sort((a, b) => a.y - b.y);
    const cellLeft = Math.min(...sorted.map((r) => r.x));

    // 一个格子里可能塞了两门课（例：周二 1-2 动物生物化学实验 + 细胞生物学(动)），
    // 判据：已经出现过周次行，又出现「从格子左边开始、像课名」的新行。
    const blocks: string[][] = [];
    let cur: string[] = [];
    let seenWeeks = false;
    for (const r of sorted) {
      const looksNewCourse =
        seenWeeks &&
        !isWeeksLine(r.text) &&
        !isRoomLine(r.text) &&
        r.x - cellLeft < 30 &&
        (/:|：/.test(r.text) || r.text.replace(/\s/g, '').length >= 4);
      if (looksNewCourse) {
        if (cur.length) blocks.push(cur);
        cur = [r.text];
        seenWeeks = false;
        continue;
      }
      if (isWeeksLine(r.text)) seenWeeks = true;
      cur.push(r.text);
    }
    if (cur.length) blocks.push(cur);

    for (const raw of blocks) {
      const fixed = mergeWrappedLines(trimLeadingFragments(raw)).map(fixWeekStart);
      const hint = teacherHint(fixed);
      const block = hint ? fixed.filter((x) => x !== hint.line) : fixed;
      const info = parseCourseCell(block.map(stripHoursNote));
      if (!info) continue;
      if (isJunkName(info.name)) {
        // 「时)」「(实验)」这类上一格折下来的碎片：既可能补周次，也可能本身就是
        // 同一门课的下一个节次（例：动物组织与胚胎学实验 周四 1-2 和 3-4）。
        const prev = lastInDay;
        if (prev) {
          const jroom = fixRoom(info.room);
          const extra = block.map(stripHoursNote).filter(Boolean);
          const re = extra.length ? parseCourseCell(extra) : null;
          const weeks = info.weeks.length ? info.weeks : (re?.weeks ?? []);
          const room2 = jroom ?? (re ? fixRoom(re.room) : undefined);
          const hasSlot = prev.slots.some((x) => x.day === day && x.start === band.start);
          if ((room2 || weeks.length) && !hasSlot) {
            prev.slots.push({
              day,
              start: band.start,
              end: band.end,
              weeks: weeks.length ? weeks : prev.slots[0].weeks,
              room: room2 ?? prev.slots[0].room,
            });
          } else if (weeks.length) {
            prev.slots[0].weeks = weeks;
            if (room2) prev.slots[0].room = room2;
          }
        }
        continue;
      }
      const room = fixRoom(info.room);
      if (!room && !info.weeks.length) continue;
      const course: ParsedCourse = {
        name: fixCourseName(info.name),
        teacher: fixTeacher(info.teacher) ?? fixTeacher(hint?.teacher),
        room,
        slots: [{ day, start: band.start, end: band.end, weeks: info.weeks, room }],
      };
      out.push(course);
      lastInDay = course;
    }
  }
  return out;
}

/**
 * 单元格里的折行替我们拼回去：
 *  - 「动物生物化学实」+「验:唐自钟」→ 一行
 *  - 「动物解剖学:陈」+「正礼」→ 一行
 */
function mergeWrappedLines(lines: string[]): string[] {
  const out: string[] = [];
  const cn = /^[\u4e00-\u9fa5]{1,3}$/;
  for (const line of lines) {
    const prev = out[out.length - 1];
    const plain = line.replace(/\s+/g, '');
    if (prev) {
      const prevPlain = prev.replace(/\s+/g, '');
      const isMeta = (t: string) =>
        /周/.test(t) || /(校区|楼|馆|操场)/.test(t) || /(室|楼|馆)$/.test(t);
      // 周次行被折成「3-9,14-16周(2学」+「时)」
      if (/周/.test(prevPlain) && /^[学时)）\]】\s]{1,4}$/.test(plain)) {
        out[out.length - 1] = prevPlain + plain;
        continue;
      }
      if (!isMeta(prevPlain) && !isMeta(plain)) {
        // 课名被折成「…实」+「验:唐自钟」
        const shortHead = /^[\u4e00-\u9fa5]{1,2}[:：].*$/.test(plain);
        if (shortHead && prevPlain.length >= 4 && !/[:：]$/.test(prevPlain)) {
          out[out.length - 1] = prevPlain + plain;
          continue;
        }
        // 老师被折成「…:陈」+「正礼」
        if (cn.test(plain) && /[:：][\u4e00-\u9fa5]{1,2}$/.test(prevPlain)) {
          out[out.length - 1] = prevPlain + plain;
          continue;
        }
        // 课名整体折两行（「动物组织与胚胎」+「学实验:贾兰兰」）
        if (
          prevPlain.length >= 4 &&
          /^[\u4e00-\u9fa5]{1,4}[A-Za-z]{0,3}[:：]/.test(plain) &&
          !/[:：]$/.test(prevPlain)
        ) {
          out[out.length - 1] = prevPlain + plain;
          continue;
        }
        // 长课名折两行（「毛泽东思想和中」+「国特色社会主义理论体系概论」）
        const pureCn = /^[\u4e00-\u9fa5]{5,}$/.test(plain);
        if (pureCn && prevPlain.length >= 4 && !/[:：]$/.test(prevPlain)) {
          out[out.length - 1] = prevPlain + plain;
          continue;
        }
      }
    }
    out.push(line);
  }
  return out;
}

/** 「10周(连堂4学时)」「B602室」「A405室」这类碎片不是课名 */
function isJunkName(name: string): boolean {
  const t = name.replace(/\s/g, '');
  if (t.length < 2) return true;
  if (/^[时學学)）\]】\s]+$/.test(t)) return true;
  if (/^(实验|连堂)[)）]?$/.test(t)) return true;
  if (/^\d+\s*[-–]?\s*\d*\s*周/.test(t)) return true;
  if (/周$/.test(t) && !/[\u4e00-\u9fa5]{2,}/.test(t.replace(/周/g, ''))) return true;
  if (/(校区|室$|楼$|馆$)/.test(t)) return true;
  if (/^[A-Za-z]?\d+[-－]?\d*[A-Za-z]?$/.test(t)) return true;
  return false;
}

/**
 * 「10-15周(连堂4学时)」这类括号注释会被折行截断（缺右括号），
 * 里面的「4学时」会被 parseCourseCell 当成第 4 周，所以先整段删掉。
 */
function stripHoursNote(line: string): string {
  return line.replace(/[（(][^（()）]*(?:学时|连堂)[^（()）]*[)）]?/g, '').trim();
}

/** 「S-16周」S 是 1；「S-8周」S 是 5 —— 用跨度判断 */
function fixWeekStart(text: string): string {
  return text.replace(/^[SＳ][-－–—]\s*(\d+)/, (_m, end: string) => {
    const n = Number(end);
    return `${n >= 10 ? 1 : 5}-${end}`;
  });
}

/** 「AI: 刘勇」这种课程代码 + 老师同一行，parseCourseCell 不认，单独兜一层 */
function teacherHint(lines: string[]): { line: string; teacher: string } | undefined {
  for (const line of lines) {
    const m = line.match(/[)）][:：]\s*([\u4e00-\u9fa5]{2,4})\s*$/);
    if (m) return { line, teacher: m[1] };
  }
  for (const line of lines) {
    const m = line.match(/^[A-Za-z]{1,4}\s*[:：]\s*([\u4e00-\u9fa5]{2,4})$/);
    if (m) return { line, teacher: m[1] };
  }
  return undefined;
}

/** 教室里的 OCR 形近字：0↔O、1↔I/l、5↔S */
export function fixRoom(room?: string): string | undefined {
  if (!room) return undefined;
  let t = room
    .replace(/\s+/g, '')
    .replace(/[OoОο]/g, '0')
    .replace(/[Il丨|]/g, '1')
    .replace(/[（(].*?[)）]/g, '');
  // 「BS08」→「B508」：字母后面的 S 其实是 5
  t = t.replace(/^([A-Za-z])[Ss](?=\d)/, '$15');
  // 「B5O8」已在上面 O→0 处理；「BI05」→「B105」已在 I→1 处理
  // 「园B区B602室」「园二期B区301室」实际是「科技园…」，「科技」那两个字常被前面的校区行吞掉
  if (/^园(?!区)/.test(t)) t = `科技${t}`;
  // 「2-805」补上「室」
  if (/^\d+-\d+$/.test(t)) t = `${t}室`;
  return t;
}

function fixTeacher(teacher?: string): string | undefined {
  if (!teacher) return undefined;
  const cleaned = teacher
    .replace(/[成都咸]{0,2}[都郡]{0,1}.*?(校区|校[区匹]).*$/, '')
    .replace(/B[Ss]08/g, 'B508')
    .replace(/[（(].*?[)）]/g, '')
    .replace(/[\d:：]/g, '')
    .replace(/黄/g, '黄')
    .replace(/景渡/g, '景波')
    .replace(/黃/g, '黄')
    .replace(/王妍蟆/g, '王妍媸')
    .replace(/^\|/, '')
    // OCR 漏字：「宋三」实际是「宋三多」
    .replace(/^宋三$/, '宋三多')
    .trim();
  if (!cleaned || cleaned.length < 2 || cleaned.length > 6) return undefined;
  if (/(校区|实验|楼|室|馆|学院|大学)/.test(cleaned)) return undefined;
  return cleaned;
}

/** OCR 常见错字修正（课程名层面的） */
function fixCourseName(name: string): string {
  return name
    .replace(/[（(]动[）)]?/g, '(动)')
    .replace(/川=|川$/, 'Ⅲ')
    .replace(/黃/g, '黄')
    .replace(/蟆/g, '嫫')
    .replace(/研过/g, '研讨')
    .replace(/杜会/g, '社会')
    .replace(/休系/g, '体系')
    .replace(/駅业/g, '职业')
    .replace(/[（(]$/, '')
    .replace(/^形势与政策[!！]?$/, '形势与政策Ⅲ')
    .replace(/^大学体育川[=＝]?$/, '大学体育Ⅲ')
    .replace(/^大学体育$/, '大学体育Ⅲ')
    .replace(/景渡/g, '景波')
    .replace(/B[Ss]08/g, 'B508')
    .replace(/BI05/g, 'B105')
    .replace(/实验Al/g, '实验AI')
    .replace(/实验 A[lI]/g, '实验AI')
    .replace(/王妍蟆/g, '王妍媸')
    .replace(/兽医实验室生物$/, '兽医实验室生物安全')
    // OCR 只认出前半截（后半截落在「(大学生职业生涯规划)」那行）
    .replace(/^大学生心理健康$/, '大学生心理健康与职业发展Ⅲ')
    .trim();
}

/** 按「课名 + 老师」合并成课程，每个时段保留自己的教室 */
export function mergeOcrCourses(perColumn: ParsedCourse[]): ParsedCourse[] {
  const map = new Map<string, ParsedCourse>();
  for (const c of perColumn) {
    const key = `${c.name}|${c.teacher ?? ''}`;
    const hit = map.get(key);
    if (hit) {
      for (const s of c.slots) {
        const dup = hit.slots.some(
          (x) => x.day === s.day && x.start === s.start && x.end === s.end && (x.room ?? '') === (s.room ?? ''),
        );
        if (!dup) hit.slots.push(s);
      }
      hit.room ??= c.room;
    } else {
      map.set(key, { ...c, slots: [...c.slots] });
    }
  }
  return [...map.values()];
}

/** 上一格折下来的「时)」之类碎片，若跑到块首就丢掉 */
function trimLeadingFragments(lines: string[]): string[] {
  const out = [...lines];
  while (out.length && /^[时學学]?\s*[)）]$/.test(out[0].replace(/\s+/g, ''))) out.shift();
  return out;
}

/** 一维 k-means，返回升序的中心点 */
function kmeans1d(values: number[], k: number): number[] {
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const n = Math.min(k, sorted.length);
  let centers = Array.from({ length: n }, (_, i) =>
    sorted[Math.min(sorted.length - 1, Math.round(((i + 0.5) * sorted.length) / n))],
  );
  for (let iter = 0; iter < 30; iter++) {
    const buckets: number[][] = Array.from({ length: n }, () => []);
    for (const v of sorted) {
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < n; i++) {
        const d = Math.abs(v - centers[i]);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      buckets[bi].push(v);
    }
    const next = buckets.map((b, i) =>
      b.length ? b.reduce((x, y) => x + y, 0) / b.length : centers[i],
    );
    const moved = next.some((c, i) => Math.abs(c - centers[i]) > 0.5);
    centers = next;
    if (!moved) break;
  }
  return centers.sort((a, b) => a - b);
}
