#!/usr/bin/env node
/**
 * 生成官网的版本清单 site/app/version.json
 *
 *   node scripts/gen-version-json.mjs ../sicau-pocket-v0.10.16-arm64.apk
 *
 * 可选：--notes notes.txt（每行一条更新说明），--min 26（最低支持 versionCode）
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
const version = app.expo?.version;
const versionCode = app.expo?.android?.versionCode;

const args = process.argv.slice(2);
const apkArg = args.find((a) => a.endsWith('.apk'));
const notesIdx = args.indexOf('--notes');
const minIdx = args.indexOf('--min');

if (!version || !versionCode) {
  console.error('✗ app.json 里缺 expo.version 或 expo.android.versionCode');
  process.exit(1);
}
if (!apkArg) {
  console.error('用法: node scripts/gen-version-json.mjs <apk 路径> [--notes 文件] [--min versionCode]');
  process.exit(1);
}

const apkPath = resolve(process.cwd(), apkArg);
if (!existsSync(apkPath)) {
  console.error(`✗ 找不到 APK：${apkPath}`);
  process.exit(1);
}

const buf = readFileSync(apkPath);
const sha256 = createHash('sha256').update(buf).digest('hex');
const size = statSync(apkPath).size;

let notes = [
  `v${version} 更新`,
];
if (notesIdx >= 0 && args[notesIdx + 1]) {
  const file = resolve(process.cwd(), args[notesIdx + 1]);
  if (existsSync(file)) {
    notes = readFileSync(file, 'utf8')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

const manifest = {
  version,
  versionCode,
  apkUrl: `https://sicau-pocket.com/apk/sicau-pocket-${version}.apk`,
  fallbackUrl: 'https://sicau-pocket.com/download.html',
  size,
  sha256,
  releasedAt: new Date().toISOString().slice(0, 10),
  minimumVersionCode: minIdx >= 0 ? Number(args[minIdx + 1]) : 1,
  notes,
};

const out = join(root, 'site', 'app', 'version.json');
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`✓ 写入 ${out}`);
console.log(`  version=${manifest.version} (${manifest.versionCode}) size=${(size / 1024 / 1024).toFixed(1)}MB`);
console.log(`  sha256=${sha256.slice(0, 16)}…`);
