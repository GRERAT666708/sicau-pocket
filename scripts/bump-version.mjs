#!/usr/bin/env node
/**
 * 一键改版本号，避免「app.json / lib/version.ts / 站点文案」三处漏改。
 *
 *   node scripts/bump-version.mjs patch     # 0.10.19 → 0.10.20，versionCode +1
 *   node scripts/bump-version.mjs minor     # 0.10.19 → 0.11.0
 *   node scripts/bump-version.mjs 0.12.3    # 指定版本号
 *   node scripts/bump-version.mjs patch --code 42   # 指定 versionCode
 *
 * 会改：app.json（expo.version / expo.android.versionCode）
 *       lib/version.ts（APP_VERSION / APP_BUILD）
 *       site/index.html、site/download.html 里的 vX.Y.Z（只替换「当前版本」，历史记录不动）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const codeIdx = args.indexOf('--code');

if (!target) {
  console.error('用法: node scripts/bump-version.mjs <patch|minor|major|X.Y.Z> [--code N]');
  process.exit(1);
}

const pkgPath = join(root, 'app.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const before = pkg.expo.version;
const beforeCode = pkg.expo.android.versionCode;
if (!before || typeof beforeCode !== 'number') {
  console.error('✗ app.json 里缺 expo.version 或 expo.android.versionCode');
  process.exit(1);
}

function next(cur, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [a, b, c] = cur.split('.').map(Number);
  if (kind === 'major') return `${a + 1}.0.0`;
  if (kind === 'minor') return `${a}.${b + 1}.0`;
  if (kind === 'patch') return `${a}.${b}.${c + 1}`;
  throw new Error(`不认识的版本参数：${kind}`);
}

const after = next(before, target);
const afterCode = codeIdx >= 0 ? Number(args[codeIdx + 1]) : beforeCode + 1;
if (!Number.isInteger(afterCode) || afterCode <= beforeCode) {
  console.error(`✗ versionCode 必须比 ${beforeCode} 大`);
  process.exit(1);
}

// 1) app.json
pkg.expo.version = after;
pkg.expo.android.versionCode = afterCode;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// 2) lib/version.ts
const verPath = join(root, 'lib', 'version.ts');
let ver = readFileSync(verPath, 'utf8');
ver = ver.replace(/export const APP_VERSION = '[^']*';/, `export const APP_VERSION = '${after}';`);
ver = ver.replace(/export const APP_BUILD = \d+;/, `export const APP_BUILD = ${afterCode};`);
writeFileSync(verPath, ver);

// 3) 站点里「当前版本」的字样（历史更新记录里出现过的旧版本号不动）
const siteFiles = ['site/index.html', 'site/download.html'];
let touched = 0;
for (const rel of siteFiles) {
  const p = join(root, rel);
  let html;
  try {
    html = readFileSync(p, 'utf8');
  } catch {
    continue;
  }
  // 只改「当前版本」的位置：含 <td>v 的历史记录行整行跳过
  const nextHtml = html
    .split('\n')
    .map((line) => (line.includes('<td>v') ? line : line.split(`v${before}`).join(`v${after}`)))
    .join('\n');
  if (nextHtml !== html) {
    writeFileSync(p, nextHtml);
    touched += 1;
  }
}

console.log(`✓ 版本：${before} (${beforeCode}) → ${after} (${afterCode})`);
console.log(`  app.json、lib/version.ts${touched ? `、${touched} 个站点页` : ''} 已更新`);
console.log('');
console.log('下一步：');
console.log(`  1. 改 site/download.html 的「更新记录」，加一条 v${after}`);
console.log('  2. bash scripts/build-apk-local.sh --arm64');
console.log(`  3. node scripts/gen-version-json.mjs sicau-pocket.apk --notes /tmp/notes.txt --min ${beforeCode}`);
