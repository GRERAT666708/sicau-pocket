#!/usr/bin/env node
// 用 GitHub REST（Git Data API）把仓库推上去：本机 git 命令不可用，只能走 API。
// 用法：GH_TOKEN=xxx node scripts/push-github.mjs [--tag v0.10.9] [--apk ../sicau-pocket-v0.10.9-arm64.apk]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

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

const SKIP_DIRS = new Set([
  'node_modules', 'android', 'dist', '.expo', '.home', '.gradle-home', '.git',
  'backups', '__pycache__', '.dsh', 'build',
]);
const SKIP_FILE = /\.(apk|zip|aab|keystore|jks)$/i;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      walk(full, out);
    } else {
      if (SKIP_FILE.test(name)) continue;
      out.push(full);
    }
  }
  return out;
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

const TEXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.txt', '.yml', '.yaml', '.sh', '.css', '.html', '.xml', '.gradle', '.properties', '.pro', '.svg']);

const files = walk(ROOT);
console.log(`待推送 ${files.length} 个文件`);

const ref = await api(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
const headSha = ref.object.sha;
const head = await api(`/repos/${REPO}/git/commits/${headSha}`);
console.log(`当前 HEAD ${headSha.slice(0, 7)}`);

const tree = [];
for (const full of files) {
  const rel = relative(ROOT, full).split('\\').join('/');
  if (rel === 'scripts/push-github.mjs') { /* 也一起推 */ }
  const buf = readFileSync(full);
  const isText = TEXT.has(extname(full).toLowerCase());
  const blob = await api(`/repos/${REPO}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify(
      isText
        ? { content: buf.toString('utf8'), encoding: 'utf-8' }
        : { content: buf.toString('base64'), encoding: 'base64' },
    ),
  });
  tree.push({ path: rel, mode: '100644', type: 'blob', sha: blob.sha });
  process.stdout.write('.');
}
console.log('\nblobs 上传完成');

const newTree = await api(`/repos/${REPO}/git/trees`, {
  method: 'POST',
  body: JSON.stringify({ base_tree: head.tree.sha, tree }),
});

const version = JSON.parse(readFileSync('app.json', 'utf8')).expo.version;
const commit = await api(`/repos/${REPO}/git/commits`, {
  method: 'POST',
  body: JSON.stringify({
    message: `release: v${version}\n\n- 课表连堂合并、非本周占位、分组列\n- 2×2 小组件显示多门课，深浅色兜底\n- 电费 · 一卡通合并入口，主页显示电费余额\n- 宿舍房间记忆 + 重新选宿舍\n- 空闲教室教务真实数据、成绩查询、官方校历\n- 路线图更新：桌面小组件已实现`,
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
      name: `川农口袋 v${version}`,
      body: `## v${version}\n\n- 课表：同一课程相邻节次合并成一块，非本周灰虚线占位\n- 小组件：4×2 与 2×2 两种，2×2 最多显示 3 门课\n- 校园卡：电费 · 一卡通合并入口，主页显示宿舍电费余额\n- 电费房间记忆，选错可「重新选宿舍」\n- 空闲教室接入教务处真实课表（211 间）\n- 成绩查询（导入式）、官方校历图\n- 路线图：桌面小组件已勾选\n\n安装：下载下方 APK（arm64，Android 7.0+）。`,
      draft: false,
      prerelease: false,
    }),
  });
  console.log(`Release: ${release.html_url}`);

  if (APK) {
    const data = readFileSync(APK);
    const res = await fetch(`https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(APK.split('/').pop())}`, {
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
