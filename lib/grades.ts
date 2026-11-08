import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { extractTables, parseTable, type HtmlCell } from './html';

/**
 * 成绩单解析 + 本地缓存。
 *
 * 教务系统有好几套（老版正方 xscjcx.asp、新版教务管理系统…），表格列的顺序和标题都不一样，
 * 所以这里不写死列号：先找「表头行」（含 成绩 + 课程），再按表头文字定位每一列。
 */

export const GRADES_KEY = '@sicau-pocket/grades/v1';

export type GradeItem = {
  id: string;
  course: string;
  score: string;
  credit?: number;
  gpa?: number;
  term?: string;
  nature?: string;
  kind?: string;
  /** 百分制数字成绩，用于算加权平均；非数字（优/良/通过）为 null */
  numeric: number | null;
};

export type GradeSnapshot = {
  items: GradeItem[];
  at: number | null;
};

const HEADER_HINTS = ['课程', '成绩'];

/** 表头里可能出现的同义列名，按优先级 */
const COLS = {
  course: ['课程名称', '课程名', '科目名称', '科目', '课程'],
  score: ['成绩', '总成绩', '综合成绩', '最终成绩'],
  credit: ['学分'],
  gpa: ['绩点', '平均绩点', '课程绩点'],
  term: ['学期', '学年学期', '开课学期'],
  nature: ['课程性质', '性质', '课程属性'],
  kind: ['考核方式', '考试性质', '修读方式', '课程类别'],
};

function pickHeaderIndex(header: HtmlCell[], names: string[]): number {
  for (const name of names) {
    const idx = header.findIndex((c) => c.text.replace(/\s/g, '').includes(name));
    if (idx >= 0) return idx;
  }
  return -1;
}

function toNumber(input: string): number | null {
  const m = input.replace(/\s/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** 一行是不是表头：至少同时出现「课程」和「成绩」两个词 */
function isHeaderRow(row: HtmlCell[]): boolean {
  const text = row.map((c) => c.text).join('|');
  return HEADER_HINTS.every((hint) => text.includes(hint));
}

export type ParseGradesResult =
  | { ok: true; items: GradeItem[]; tableIndex: number }
  | { ok: false; message: string; tables: number };

export function parseGrades(html: string): ParseGradesResult {
  const tables = extractTables(html);
  for (let t = 0; t < tables.length; t += 1) {
    const grid = parseTable(tables[t]);
    const headerRowIndex = grid.findIndex(isHeaderRow);
    if (headerRowIndex < 0) continue;

    const header = grid[headerRowIndex];
    const colCourse = pickHeaderIndex(header, COLS.course);
    const colScore = pickHeaderIndex(header, COLS.score);
    if (colCourse < 0 || colScore < 0) continue;

    const colCredit = pickHeaderIndex(header, COLS.credit);
    const colGpa = pickHeaderIndex(header, COLS.gpa);
    const colTerm = pickHeaderIndex(header, COLS.term);
    const colNature = pickHeaderIndex(header, COLS.nature);
    const colKind = pickHeaderIndex(header, COLS.kind);

    const items: GradeItem[] = [];
    for (let r = headerRowIndex + 1; r < grid.length; r += 1) {
      const row = grid[r];
      const course = (row[colCourse]?.text ?? '').trim();
      const score = (row[colScore]?.text ?? '').trim();
      if (!course || !score) continue;
      // 跨行合并的单元格会重复出现同一门课，去重
      if (items.some((it) => it.course === course && it.score === score)) continue;
      const creditText = colCredit >= 0 ? (row[colCredit]?.text ?? '') : '';
      const gpaText = colGpa >= 0 ? (row[colGpa]?.text ?? '') : '';
      items.push({
        id: `${course}-${score}-${r}`,
        course,
        score,
        credit: toNumber(creditText) ?? undefined,
        gpa: toNumber(gpaText) ?? undefined,
        term: colTerm >= 0 ? (row[colTerm]?.text ?? '').trim() || undefined : undefined,
        nature: colNature >= 0 ? (row[colNature]?.text ?? '').trim() || undefined : undefined,
        kind: colKind >= 0 ? (row[colKind]?.text ?? '').trim() || undefined : undefined,
        numeric: toNumber(score),
      });
    }

    if (items.length > 0) return { ok: true, items, tableIndex: t };
  }

  return {
    ok: false,
    message:
      tables.length === 0
        ? '这个页面里没有表格，应该不是成绩页'
        : '页面里有表格，但没找到「课程 + 成绩」这类表头——确认你停在成绩查询页，并且成绩已经加载出来',
    tables: tables.length,
  };
}

export function gradeSummary(items: GradeItem[]) {
  const scored = items.filter((it) => it.numeric !== null);
  const totalCredit = items.reduce((sum, it) => sum + (it.credit ?? 0), 0);
  const weighted = scored.reduce((sum, it) => sum + (it.numeric ?? 0) * (it.credit ?? 0), 0);
  const creditWithScore = scored.reduce((sum, it) => sum + (it.credit ?? 0), 0);
  const gpas = items.filter((it) => typeof it.gpa === 'number');
  const creditWithGpa = gpas.reduce((sum, it) => sum + (it.credit ?? 0), 0);
  const gpaWeighted = gpas.reduce((sum, it) => sum + (it.gpa ?? 0) * (it.credit ?? 0), 0);
  const failed = scored.filter((it) => (it.numeric ?? 100) < 60).length;
  return {
    count: items.length,
    totalCredit: Math.round(totalCredit * 10) / 10,
    average: creditWithScore > 0 ? Math.round((weighted / creditWithScore) * 100) / 100 : null,
    gpa: creditWithGpa > 0 ? Math.round((gpaWeighted / creditWithGpa) * 100) / 100 : null,
    failed,
  };
}

// ---- 本地缓存 + 订阅 ----

let snapshot: GradeSnapshot = { items: [], at: null };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function setSnapshot(next: GradeSnapshot) {
  snapshot = next;
  emit();
}

export function subscribeGrades(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getGrades(): GradeSnapshot {
  return snapshot;
}

export function useGrades(): GradeSnapshot {
  return useSyncExternalStore(subscribeGrades, getGrades, getGrades);
}

export async function hydrateGrades(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(GRADES_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as GradeSnapshot;
    if (Array.isArray(parsed.items)) setSnapshot({ items: parsed.items, at: parsed.at ?? null });
  } catch {
    // 坏数据直接忽略，保持空状态
  }
}

export async function saveGrades(items: GradeItem[], at = Date.now()): Promise<void> {
  setSnapshot({ items, at });
  await AsyncStorage.setItem(GRADES_KEY, JSON.stringify({ items, at }));
}

export async function clearGrades(): Promise<void> {
  setSnapshot({ items: [], at: null });
  await AsyncStorage.removeItem(GRADES_KEY);
}
