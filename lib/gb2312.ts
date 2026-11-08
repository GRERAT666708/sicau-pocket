import { GB2312_TABLE } from './gb2312-table';

/**
 * GB2312 解码（老教务系统全是 GB2312）。
 *
 * Hermes 上 `new TextDecoder('gb2312')` 不一定可用，实测在 Android 模拟器里
 * 直接拿到的是一串乱码，所以这里自带一张 94×94 的映射表，纯 JS 解。
 */

const TABLE = GB2312_TABLE;

function pairIndex(lead: number, trail: number): number {
  const row = lead - 0xa1;
  const col = trail - 0xa1;
  if (row < 0 || row > 93 || col < 0 || col > 93) return -1;
  return row * 94 + col;
}

export function decodeGb2312(input: Uint8Array | ArrayBuffer): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const byte = bytes[i];
    if (byte < 0x80) {
      out += String.fromCharCode(byte);
      i += 1;
      continue;
    }
    if (byte === 0xa3 || byte === 0xa1 || byte === 0xa2) {
      // 全角符号区
      const next = bytes[i + 1];
      const idx = pairIndex(byte, next ?? 0);
      if (idx >= 0) {
        const ch = TABLE.charAt(idx);
        out += ch === '\u0000' ? '?' : ch;
        i += 2;
        continue;
      }
    }
    const next = bytes[i + 1];
    const idx = pairIndex(byte, next ?? 0);
    if (idx >= 0) {
      const ch = TABLE.charAt(idx);
      out += ch === '\u0000' ? '?' : ch;
      i += 2;
    } else {
      out += String.fromCharCode(byte);
      i += 1;
    }
  }
  return out;
}

/** 把常见字符集声明也处理掉：GB2312/GBK/GB18030 都按这张表解（GBK 扩展区会退化成 ?） */
export function looksLikeGb2312(contentType: string | null, html: string): boolean {
  if (contentType && /gb2312|gbk|gb18030/i.test(contentType)) return true;
  return /charset\s*=\s*["']?(gb2312|gbk|gb18030)/i.test(html.slice(0, 4000));
}

let reverse: Map<number, number> | null = null;

function reverseTable(): Map<number, number> {
  if (reverse) return reverse;
  const map = new Map<number, number>();
  for (let i = 0; i < TABLE.length; i += 1) {
    const ch = TABLE.charAt(i);
    if (!ch || ch === '\u0000' || map.has(ch.charCodeAt(0))) continue;
    const lead = 0xa1 + Math.floor(i / 94);
    const trail = 0xa1 + (i % 94);
    map.set(ch.charCodeAt(0), (lead << 8) | trail);
  }
  reverse = map;
  return map;
}

/** 编码成 GB2312 字节；表里没有的字符退化成 '?'（0x3f） */
export function encodeGb2312(text: string): Uint8Array {
  const map = reverseTable();
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 0x80) {
      bytes.push(code);
      continue;
    }
    const pair = map.get(code);
    if (pair === undefined) {
      bytes.push(0x3f);
    } else {
      bytes.push((pair >> 8) & 0xff, pair & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

/**
 * 按 GB2312 拼 x-www-form-urlencoded。
 * 老 ASP 站点默认代码页是 GB2312：中文（比如全角「！」）按 UTF-8 发过去会被解码成乱码，
 * 服务端就会回「登录类别错误」这种莫名其妙的提示。实测必须用 GB2312 编码。
 */
export function encodeGb2312Form(fields: Record<string, string>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    const bytes = encodeGb2312(value);
    let encoded = '';
    for (const byte of bytes) {
      const ch = String.fromCharCode(byte);
      if (/[A-Za-z0-9\-_.!~*'()]/.test(ch)) {
        encoded += ch;
      } else {
        encoded += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
      }
    }
    parts.push(`${encodeURIComponent(key)}=${encoded}`);
  }
  return parts.join('&');
}
