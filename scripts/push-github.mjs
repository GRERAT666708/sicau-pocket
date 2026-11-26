#!/usr/bin/env node
// 用 GitHub REST（Git Data API）把仓库推上去：本机 git push 连不上 github.com，只能走 API。
// 只上传 blob 真的变了的文件（用本地 git 算 sha 跟远端树比对），并删掉远端已不存在的文件。
// 用法：GH_TOKEN=xxx node scripts/push-github.mjs [--tag v0.10.9] [--apk ../sicau-pocket-v0.10.9-arm64.apk]
//   可选环境变量 GH_MESSAGE：覆盖提交说明（不发版、只同步代码时用）
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TOKEN = process.env.GH_TOKEN;
const REPO = process.env.GH_REPO || 'GRERAT666708/sicau-pocket';
const BRANCH = process.env.GH_BRANCH || 'main';
const ROOT = process.cwd();
const argv = process.argv.slice(2);
const tagArg = argv.indexOf('--tag');
const apkArg = argv.indexOf('--apk');
const TAG = tagArg >= 0 ? argv[tagArg + 1] : null;
const APK = apkArg >= 0 ? argv[apkArg + 1] : null;

if (!TOKEN) {
  console.error('缺少 GH_TOKEN');
  process.exit(1);
}

async function api(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'sicau-pocket-push',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** git ls-files：只推被 git 跟踪的文件（自动尊重 .gitignore，不会把 node_modules / Pods 推上去） */
const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

const ref = await api(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
const headSha = ref.object.sha;
const head = await api(`/repos/${REPO}/git/commits/${headSha}`);
console.log(`当前 HEAD ${headSha.slice(0, 7)}`);
console.log(`本地 ${files.length} 个文件，和远端树比对…`);

/** 资产名与部署脚本约定一致：sicau-pocket-v<version>-arm64.apk */
function assetName() {
  return `sicau-pocket-v${version}-arm64.apk`;
}

const remoteTree = await api(`/repos/${REPO}/git/trees/${head.tree.sha}?recursive=1`);
const remote = new Map();
for (const entry of remoteTree.tree ?? []) if (entry.type === 'blob') remote.set(entry.path, entry.sha);

/** 与 `git hash-object` 一样的 blob sha：sha1("blob <len>\0" + content) */
function gitBlobSha(buf) {
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

const tree = [];
const localPaths = new Set(files);
for (const rel of files) {
  // 安装包/压缩包走 Release 资产（git 树里那份是历史遗留，API 单 blob 有大小上限，重新上传会 422）
  if (/\.(apk|aab|zip|ipa)$/i.test(rel)) continue;
  // token 没有 workflow scope 时写 .github/workflows 会被 GitHub 报 404，先跳过
  if (rel.startsWith('.github/workflows/')) continue;
  const buf = readFileSync(join(ROOT, rel));
  if (remote.get(rel) === gitBlobSha(buf)) continue; // 没变：base_tree 里已经带着
  const blob = await api(`/repos/${REPO}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({ content: buf.toString('base64'), encoding: 'base64' }),
  }).catch((err) => {
    throw new Error(`${rel}（${(buf.length / 1024 / 1024).toFixed(1)}MB）上传失败：${err.message}`);
  });
  tree.push({ path: rel, mode: '100644', type: 'blob', sha: blob.sha });
  process.stdout.write('.');
}

// 远端有、本地已经没有的（删文件也同步过去）
for (const path of remote.keys()) {
  if (!localPaths.has(path)) tree.push({ path, mode: '100644', type: 'blob', sha: null });
}

console.log(`\n需要更新的条目 ${tree.length} 个`);
if (tree.length === 0) {
  console.log('远端已是最新，无需提交');
  process.exit(0);
}

const newTree = await api(`/repos/${REPO}/git/trees`, {
  method: 'POST',
  body: JSON.stringify({ base_tree: head.tree.sha, tree }),
});

/** 提交说明直接取版本清单里的 notes，避免每次手改；GH_MESSAGE 可覆盖（例如只修代码、不发版） */
function commitMessage(version) {
  if (process.env.GH_MESSAGE && process.env.GH_MESSAGE.trim()) return process.env.GH_MESSAGE;
  let notes = [];
  try {
    const manifest = JSON.parse(readFileSync('site/app/version.json', 'utf8'));
    if (Array.isArray(manifest.notes)) notes = manifest.notes.filter((n) => typeof n === 'string' && n.trim());
  } catch {
    /* 没有清单就只写版本号 */
  }
  return [`release: v${version}`, '', ...notes.map((n) => `- ${n}`)].join('\n');
}

/** Release 说明也取版本清单 notes，跟站点「更新记录」保持一致 */
function releaseBody() {
  let notes = [];
  try {
    const manifest = JSON.parse(readFileSync('site/app/version.json', 'utf8'));
    if (Array.isArray(manifest.notes)) notes = manifest.notes.filter((n) => typeof n === 'string' && n.trim());
  } catch {
    /* 没有清单就只写版本号 */
  }
  const lines = notes.length ? notes.map((n) => `- ${n}`) : ['- 见站点更新记录'];
  return [`## v${version}`, '', ...lines, '', '安装：下载下方 APK（arm64，Android 8.0+）；iOS 走 TestFlight。'].join('\n');
}

const version = JSON.parse(readFileSync('app.json', 'utf8')).expo.version;
const commit = await api(`/repos/${REPO}/git/commits`, {
  method: 'POST',
  body: JSON.stringify({
    message: commitMessage(version),
    tree: newTree.sha,
    parents: [headSha],
  }),
});

await api(`/repos/${REPO}/git/refs/heads/${BRANCH}`, {
  method: 'PATCH',
  body: JSON.stringify({ sha: commit.sha, force: false }),
});
console.log(`已推送 commit ${commit.sha.slice(0, 7)}`);

if (TAG) {
  const tagObj = await api(`/repos/${REPO}/git/tags`, {
    method: 'POST',
    body: JSON.stringify({ tag: TAG, message: `四川农业大学 口袋 v${version}`, object: commit.sha, type: 'commit' }),
  });
  await api(`/repos/${REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/tags/${TAG}`, sha: tagObj.sha }),
  });
  console.log(`已打 tag ${TAG}`);

  const release = await api(`/repos/${REPO}/releases`, {
    method: 'POST',
    body: JSON.stringify({
      tag_name: TAG,
      name: `口袋课表 v${version}`,
      body: releaseBody(),
      draft: false,
      prerelease: false,
    }),
  });
  console.log(`Release: ${release.html_url}`);

  if (APK) {
    const data = readFileSync(APK);
    const res = await fetch(`https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(assetName())}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/vnd.android.package-archive',
        'User-Agent': 'sicau-pocket-push',
      },
      body: data,
    });
    if (!res.ok) throw new Error(`上传 APK 失败 ${res.status} ${(await res.text()).slice(0, 200)}`);
    console.log('APK 已上传');
  }
}
