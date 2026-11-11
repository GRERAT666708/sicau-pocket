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

3. 改这三处版本号/更新说明：
   - `index.html`：`pill` 里的版本号、`meta-line` 里的 `v0.10.16`
   - `download.html`：顶部版本行 + 「更新说明」表格加一行
   - `privacy.html` / `terms.html` 若规则有变动，更新"生效日期"
4. 上传：

   ```bash
   ossutil sync ./site/ oss://sicau-pocket-site/ --delete
   ossutil set-meta oss://sicau-pocket-site/apk/sicau-pocket-latest.apk \
     Content-Type:application/vnd.android.package-archive
   ```

5. 在 CDN 控制台**刷新**：`/`、`/download.html`、`/apk/sicau-pocket-latest.apk`（URL 刷新）

> 想要"固定版本号可回溯"的话，可以同时保留 `/apk/sicau-pocket-v0.10.16-arm64.apk`，让 `latest` 指向新文件。

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
