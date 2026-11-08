/**
 * 极简 HTML 工具：不做完整 DOM 解析，只够把教务系统（正方 ASP 系）的课表表格拆开。
 *
 * 注意：这套老 ASP 页面**经常不闭合 `</td>` / `</tr>` / `</table>`**（实测一页里
 * 3 个 `<table>` 只有 1 个 `</table>`），所以这里全部按「开标签切段」处理，不依赖闭标签。
 * 纯函数、无依赖，方便在 Node 里直接跑测试。
 */

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)));
}

/** 把 HTML 片段转成纯文本：块级标签换成换行，其余标签删掉 */
export function htmlToLines(fragment: string): string[] {
  const withBreaks = fragment
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(td|th|tr|div|p|li|h\d)>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(withBreaks)
    .split('\n')
    .map((line) => line.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

export function stripTags(fragment: string): string {
  return htmlToLines(fragment).join(' ');
}

export type HtmlCell = {
  /** 单元格里的纯文本行（已经按 <br> 拆好） */
  lines: string[];
  text: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
};

/** 按开标签切段，返回页面上每一层表格的「内容段」（不含 <table> 标签本身） */
export function extractTables(html: string): string[] {
  const parts = html.split(/<table\b[^>]*>/i).slice(1);
  return parts.map((part) => {
    const nested = part.search(/<table\b/i);
    return nested >= 0 ? part.slice(0, nested) : part;
  });
}

function attrNumber(attrs: string, name: string): number {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*["']?(\\d+)`, 'i'));
  return m ? Math.max(1, Number(m[1])) : 1;
}

/** 解析单个表格（传入 extractTables 的一段），处理 rowspan / colspan */
export function parseTable(tableHtml: string): HtmlCell[][] {
  const scope = tableHtml.replace(/<\/?table\b[^>]*>/gi, '');
  const rowsHtml = scope.split(/<tr\b[^>]*>/i).slice(1);

  const grid: (HtmlCell | null)[][] = [];

  rowsHtml.forEach((rowHtml, rowIndex) => {
    if (!grid[rowIndex]) grid[rowIndex] = [];
    const row = rowHtml.split(/<table\b/i)[0];
    const tagRe = /<(td|th)\b([^>]*)>/gi;
    const marks: { end: number; attrs: string }[] = [];
    let tm: RegExpExecArray | null;
    while ((tm = tagRe.exec(row))) marks.push({ end: tm.index + tm[0].length, attrs: tm[2] ?? '' });

    let col = 0;
    marks.forEach((mark, i) => {
      const rest = row.slice(mark.end);
      const nextOffset = rest.search(/<(td|th)\b/i);
      const cellHtml = nextOffset >= 0 ? rest.slice(0, nextOffset) : rest;
      void i;
      while (grid[rowIndex][col]) col += 1;
      const rowSpan = attrNumber(mark.attrs, 'rowspan');
      const colSpan = attrNumber(mark.attrs, 'colspan');
      const lines = htmlToLines(cellHtml);
      const cell: HtmlCell = {
        lines,
        text: lines.join(' '),
        row: rowIndex,
        col,
        rowSpan,
        colSpan,
      };
      for (let r = rowIndex; r < rowIndex + rowSpan; r += 1) {
        if (!grid[r]) grid[r] = [];
        for (let c = col; c < col + colSpan; c += 1) grid[r][c] = cell;
      }
      col += colSpan;
    });
  });

  const height = grid.length;
  const width = grid.reduce((max, row) => Math.max(max, row.length), 0);
  const result: HtmlCell[][] = [];
  for (let r = 0; r < height; r += 1) {
    const line: HtmlCell[] = [];
    for (let c = 0; c < width; c += 1) {
      line.push(
        grid[r]?.[c] ?? { lines: [], text: '', row: r, col: c, rowSpan: 1, colSpan: 1 },
      );
    }
    result.push(line);
  }
  return result;
}

export function extractLinks(html: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.push({ href: m[1], text: stripTags(m[2]) });
  }
  return out;
}
