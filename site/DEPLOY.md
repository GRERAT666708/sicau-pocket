# 部署到阿里云 OSS + CDN（国内节点）

网站是**纯静态**的：没有后端、没有数据库、没有构建步骤，把 `site/` 里的文件原样传上去就能用。

```
site/
├── index.html          首页（功能 / 截图 / 隐私摘要 / FAQ 摘要）
├── download.html       下载页（APK + 安装步骤 + 更新说明）
├── privacy.html        隐私政策 ← App Store 审核要填这个链接
├── terms.html          用户协议
├── faq.html            常见问题
├── 404.html            错误页
├── robots.txt / sitemap.xml
├── assets/css, js      样式与脚本（无第三方依赖）
├── assets/img          图标与截图
└── apk/                安装包放这里（site/apk/sicau-pocket-latest.apk）
```

> 域名：`sicau-pocket.com`　联系邮箱：`wcy77416160@outlook.com`
> 部署前先把页面里所有 `sicau-pocket.com` 与页脚 `蜀 ICP 备 2026xxxxxx 号` 换成你真实的备案号。

---

## 0. 先说清楚：国内节点必须备案

阿里云 OSS / CDN 的**中国大陆节点**，绑定自定义域名前必须完成 **ICP 备案**（在阿里云备案系统提交，需要一台包年包月的 ECS 或 OSS 的"备案服务号"，审核通常 7–20 个工作日）。备案通过前：

- 用 OSS 的**默认域名**（`xxx.oss-cn-hangzhou.aliyuncs.com`）访问是正常的，但浏览器会强制下载而不是渲染网页；
- 绑定自定义域名会被拦截。

**不影响 App Store 提交**的临时方案：审核期间先把站点放到 GitHub Pages / Cloudflare Pages（免备案、自带 HTTPS），把 `https://xxx.github.io/sicau-pocket/` 填进 App Store 的隐私政策 URL；备案下来后再切到 `https://sicau-pocket.com/`，App Store 里随时可以改这个链接。

---

## 1. 建 Bucket

1. 登录 [OSS 控制台](https://oss.console.aliyun.com/) → 创建 Bucket
2. 参数建议：
   - **地域**：华东1（杭州）——离学校和你在的地方都近
   - **Bucket 名称**：`sicau-pocket-site`
   - **读写权限**：**公共读**
   - **版本控制**：按需（静态站可以不开）
3. 进入 Bucket → **数据管理 → 静态页面**：
   - 默认首页：`index.html`
   - 默认 404 页：`404.html`
   - 子目录首页：不开（本站没有子目录首页）

## 2. 上传文件

用 `ossutil`（推荐，支持增量）或控制台上传。

```bash
# 安装 ossutil 后先配置（AccessKey 建议用只授权该 Bucket 的 RAM 子账号）
ossutil config

# 同步整个站点（--delete 会删掉 OSS 上多余的对象，第一次可先不加）
ossutil sync ./site/ oss://sicau-pocket-site/ --delete
```

**必须单独设置的 MIME**（否则 APK 点开可能是乱码或被当文本）：

```bash
ossutil set-meta oss://sicau-pocket-site/apk/sicau-pocket-latest.apk \
  Content-Type:application/vnd.android.package-archive \
  Content-Disposition:'attachment; filename="sicau-pocket-latest.apk"'
```

其余类型正常即可：`.html` → `text/html; charset=utf-8`、`.css` → `text/css`、`.js` → `application/javascript`、`.png` → `image/png`、`.xml` → `application/xml`。

**缓存策略**（Bucket → 数据管理 → 缓存配置 或 CDN 侧设置）：

| 路径 | Cache-Control |
| --- | --- |
| `*.html` | `no-cache`（保证改完立刻生效） |
| `/assets/*` | `public, max-age=604800`（有改动就换文件名或刷 CDN） |
| `/apk/*` | `public, max-age=86400` |
| `robots.txt` / `sitemap.xml` | `public, max-age=3600` |

## 3. 绑定域名 + HTTPS

域名是在阿里云买的就直接在同一账号下操作：

1. **CDN 控制台 → 域名管理 → 添加域名**
   - 加速域名：`sicau-pocket.com`（再加一个 `www.sicau-pocket.com`）
   - 源站类型：**OSS 域名** → 选 `sicau-pocket-site.oss-cn-hangzhou.aliyuncs.com`
   - 业务类型：图片小文件
   - 加速区域：**仅中国内地**（需要备案）
   - 端口：443（HTTPS）
2. 按提示去**云解析 DNS** 添加 CNAME 记录（`@` 与 `www` 指向 CDN 给出的域名）
3. **HTTPS 证书**：CDN → 证书管理 → 申请免费 DV 证书（或上传已有证书）→ 域名绑定证书 → 开启 "强制 HTTPS 跳转"
4. 回源协议选 HTTPS（OSS 支持）

> 备案未通过前，CDN 添加 `sicau-pocket.com` 会要求先完成备案；此时可以先只用 OSS 默认域名测试，但记得它不会渲染 HTML。

## 4. 验证清单

上线后一条条过：

```bash
# 首页 200 且是 HTML
curl -sI https://sicau-pocket.com/ | grep -i content-type

# 隐私政策可访问（App Store 要填这个）
curl -sI https://sicau-pocket.com/privacy.html | head -3

# APK 类型正确、体积对得上（约 34 MB）
curl -sI https://sicau-pocket.com/apk/sicau-pocket-latest.apk | grep -iE "content-type|content-length"

# HTTPS 与跳转
curl -sI http://sicau-pocket.com/ | grep -i location
```

手动检查：

- [ ] 手机浏览器打开首页，7 列截图能滑、暗色模式下文字可读
- [ ] 点「下载 APK」能真的下下来，装完能启动
- [ ] `https://sicau-pocket.com/404.html` 与不存在的路径都显示自定义 404
- [ ] 微信里分享首页，卡片有标题、描述和图标（OG 标签已写在 `index.html`）
- [ ] 页脚备案号已经换成真实号码并链到 `beian.miit.gov.cn`

## 5. 发新版本时

1. 构建：`cd sicau-pocket && bash scripts/build-apk-local.sh --arm64`
2. 覆盖安装包：

   ```bash
   cp ../sicau-pocket-v0.10.16-arm64.apk site/apk/sicau-pocket-latest.apk
   ```

3. 改版本号与更新说明：
   - 版本号不用手改：`node scripts/bump-version.mjs patch` 会同步 `app.json`、`lib/version.ts`、`index.html` / `download.html` 的版本文案
   - `download.html` 的「更新说明」表格加一行（`lib/changelog.ts` 也加一段，App 内「更新完成」小窗用它）
   - `privacy.html` / `terms.html` 若规则有变动，更新"生效日期"
4. 上传：

   ```bash
   ossutil sync ./site/ oss://sicau-pocket-site/ --delete
   ossutil set-meta oss://sicau-pocket-site/apk/sicau-pocket-latest.apk \
     Content-Type:application/vnd.android.package-archive
   ```

5. 在 CDN 控制台**刷新**：`/`、`/download.html`、`/apk/sicau-pocket-latest.apk`（URL 刷新）

> 下载页的按钮会在页面加载后把链接改成 `/apk/sicau-pocket-<版本>.apk`（`assets/js/main.js` 读 `app/version.json`），
> 所以带版本号的文件必须一起传上去；`latest` 只是兜底，nginx 对 `latest` 强制 `no-cache`，带版本号的文件才长缓存。
>
> **不用 OSS、直接用 ECS + nginx 的情况**：跑 `bash /root/pull.sh sicau-pocket.com`
> （= `site/deploy/pull-and-deploy.sh`），它会按 `version.json` 的 md5 校验 `apk/sicau-pocket-latest.apk`，
> 对不上就强制重下，并在自检里打印「站点包 vs version.json」的 md5 对比。

## 5.1 网站包与 GitHub 对齐自检

发完版在服务器上跑一遍，三行都应输出**同一个 md5**：

```bash
# 站点清单里写的 md5
sed -n 's/.*"md5": *"\([0-9a-f]\{32\}\).*/\1/p' /var/www/sicau-pocket/app/version.json
# 站点上 latest 的 md5
md5sum /var/www/sicau-pocket/apk/sicau-pocket-latest.apk | cut -d' ' -f1
# GitHub Release 上那个包的 md5（先下到/tmp）
curl -fL -o /tmp/gh.apk https://github.com/GRERAT666708/sicau-pocket/releases/download/vX.Y.Z/sicau-pocket-vX.Y.Z-arm64.apk
md5sum /tmp/gh.apk | cut -d' ' -f1
```

对不上时按顺序排查：

1. `app/version.json` 是不是最新（`bash /root/pull.sh` 有没有真的拉到新 commit）
2. `/var/www/sicau-pocket/apk/.apk-version` 与实际文件是否一致（老脚本只看这个标记，会误跳过下载；新脚本会校验 md5）
3. 浏览器是不是缓存了 `latest`（新版 nginx 已对 `latest` 设 `no-cache`，下载页也已改用带版本号的文件名）
4. 服务器上是不是留着多个版本文件（新脚本只保留最近两个）

## 6. 给 App Store 用的三个链接

| 用途 | URL |
| --- | --- |
| 隐私政策 URL（必填） | `https://sicau-pocket.com/privacy.html` |
| 技术支持 URL（必填） | `https://sicau-pocket.com/faq.html`（或 `mailto:` 邮箱） |
| 营销 URL（选填） | `https://sicau-pocket.com/` |

App Store Connect 里「App 隐私」部分按实际情况勾选：本站与 App 都不收集数据（No data collected），因为没有任何分析 SDK、也不上传任何内容。

## 7. 可选：自动化（GitHub Actions → OSS）

`.github/workflows/deploy-site.yml` 示例（在仓库 secrets 里配 `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET`，只给该 Bucket 的 RAM 权限）：

```yaml
name: deploy-site
on:
  push:
    paths: ['site/**']
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: manyuanrong/setup-ossutil@v3
        with:
          endpoint: oss-cn-hangzhou.aliyuncs.com
          access-key-id: ${{ secrets.OSS_ACCESS_KEY_ID }}
          access-key-secret: ${{ secrets.OSS_ACCESS_KEY_SECRET }}
      - run: ossutil sync ./site/ oss://sicau-pocket-site/ --delete
```

## 8. 常见问题

**Q：打开域名变成下载文件 / 显示 XML？**
A：Bucket 的「静态页面」没开，或者没有绑定自定义域名（OSS 默认域名强制下载）。

**Q：改了页面但浏览器还是旧的？**
A：HTML 设 `no-cache`，并在 CDN 上刷 URL；`assets/` 里的文件建议改名（如 `style.css?v=2`）再上传。

**Q：APK 下载到一半失败？**
A：34 MB 建议走 CDN（已有），Android 浏览器断点续传支持不好，弱网下重试即可；也可以把 APK 同时放一份到 GitHub Release，页面里的「历史版本」已经指向那里。

**Q：备案号写什么？**
A：备案通过后在阿里云备案控制台能看到「蜀ICP备XXXXXXXX号-1」，页脚格式一般是 `蜀ICP备2026xxxxxx号-1`。


---

## 发版流程（含 App 内「检查更新」）

App 启动会拉 `https://sicau-pocket.com/app/version.json`（另有 jsdelivr / GitHub raw 两个备用源），
比较 `versionCode` 后决定是否在「我的」页顶部提示更新。

```bash
# 1) 改版本号（一条命令同步 app.json / lib/version.ts / 站点文案）
node scripts/bump-version.mjs patch              # 或 minor / X.Y.Z；--code N 指定 versionCode
bash scripts/build-apk-local.sh --arm64          # 每次都会清旧 bundle 与 Metro 缓存，再校验两处版本号一致

# 2) 拷安装包（latest 给下载页，带版本号的给 version.json 里的 apkUrl）
cp ../sicau-pocket-vX.Y.Z-arm64.apk site/apk/sicau-pocket-latest.apk
cp ../sicau-pocket-vX.Y.Z-arm64.apk site/apk/sicau-pocket-X.Y.Z.apk

# 3) 生成版本清单（自动读 app.json、算 sha256 + md5 与体积）
#    客户端会用 md5 校验下载到的安装包，对不上就删掉并回退浏览器下载
node scripts/gen-version-json.mjs ../sicau-pocket-vX.Y.Z-arm64.apk --notes notes.txt --min <上一版 versionCode>

# 4) 部署
ossutil sync ./site/ oss://sicau-pocket-site/ --delete
ossutil set-meta oss://sicau-pocket-site/apk/sicau-pocket-latest.apk \
  Content-Type:application/vnd.android.package-archive
ossutil set-meta oss://sicau-pocket-site/apk/sicau-pocket-X.Y.Z.apk \
  Content-Type:application/vnd.android.package-archive
```

`version.json` 里 `apkUrl` 指向带版本号的文件，这样 CDN 可以放心长缓存；
`size` / `sha256` 用于客户端显示体积、也方便用户自己核对安装包。
