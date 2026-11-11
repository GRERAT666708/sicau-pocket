# 用阿里云 ECS（云服务器）托管本站

适合你这种情况：想自己拿一台服务器，顺便把 **ICP 备案服务号** 也拿到手（备案要求有一台包年包月的阿里云服务器）。

> 只用 OSS+CDN 的话更便宜、免运维，见 `DEPLOY.md`；这台 ECS 还能顺手做两件事：
> ① 提供备案资质；② 以后放 `/app/version.json` 做版本检查、放 TestFlight 邀请页等。

---

## 0. 买什么、花多少钱

| 方案 | 配置 | 价格量级 | 说明 |
| --- | --- | --- | --- |
| **轻量应用服务器**（推荐） | 2 核 2G / 40GB SSD / 3–5M 带宽 | 约 ¥60–100/月，新用户常有 ¥99/年 | 控制台更简单，自带「宝塔/Nginx 应用镜像」，备案可用 |
| ECS 经济型 e 实例 | 2 核 2G / 40GB ESSD | 约 ¥80–120/月（活动价更低） | 更灵活，按量/包年包月都行 |
| ECS 突发性能 t6 | 2 核 1G | 约 ¥50/月起 | 跑纯静态站够用，但备案要求包年包月 ≥3 个月 |

纯静态站的流量极小（1 万次访问 ≈ 1GB 流量），**带宽 3M 就够**。真正吃资源的是备案流程要买满 3 个月，不是机器性能。

地域建议 **华东1（杭州）** 或 **西南1（成都）**——后者离川农成都校区近。

---

## 1. 创建与初始化

1. [ECS 控制台](https://ecs.console.aliyun.com/) → 创建实例
   - 镜像：**Ubuntu 22.04 LTS 64 位**
   - 系统盘：40GB ESSD 即可
   - 公网 IP：分配
   - 登录凭证：自定义密码（或 SSH 密钥，更安全）
2. **安全组**（入方向）放行：

| 端口 | 协议 | 来源 | 用途 |
| --- | --- | --- | --- |
| 22 | TCP | 你的公网 IP（别用 0.0.0.0/0） | SSH |
| 80 | TCP | 0.0.0.0/0 | HTTP（证书签发 + 跳转） |
| 443 | TCP | 0.0.0.0/0 | HTTPS |

3. 登录：

```bash
ssh root@<你的公网IP>
```

---

## 2. 装 Nginx 与证书工具

```bash
apt update && apt -y upgrade
apt -y install nginx rsync certbot python3-certbot-nginx

systemctl enable --now nginx
nginx -v           # 确认装好
```

打开 `http://<公网IP>/` 应该能看到 "Welcome to nginx"。

---

## 3. 建目录、传文件

服务器上：

```bash
mkdir -p /var/www/sicau-pocket
```

本地（你的 Mac）在仓库的 `sicau-pocket/` 目录下执行：

```bash
# 先确认 site/apk/sicau-pocket-latest.apk 是最新的构建产物
rsync -avz --delete \
  site/ root@<公网IP>:/var/www/sicau-pocket/
```

> 传完在服务器上核对一下：
> `ls -lh /var/www/sicau-pocket` 应有 `index.html download.html privacy.html terms.html faq.html 404.html assets apk`；
> `du -sh /var/www/sicau-pocket` 约 35MB（含 APK）。

---

## 4. Nginx 配置

```bash
cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak
nano /etc/nginx/sites-available/default
```

把内容整体替换为仓库里的 `site/deploy/nginx-sicau-pocket.conf`（先把 `sicau-pocket.com` 换成你的域名、`/var/www/sicau-pocket` 保持不变）。

关键点（配置里都已写好）：

- `root /var/www/sicau-pocket;` + `index index.html;`
- `try_files $uri $uri/ =404;` + `error_page 404 /404.html;`
- **APK 的 MIME 必须显式声明**，否则安卓点开会当文本打开：
  `types { application/vnd.android.package-archive apk; }`
- `gzip on;` 压缩 html/css/js
- 缓存：`*.html` `no-cache`；`/assets/` 7 天；`/apk/` 1 天
- `client_max_body_size 100m;`（传 APK 用）

检查并重载：

```bash
nginx -t && systemctl reload nginx
```

此时用 `http://<公网IP>/` 就能看到网站了。

---

## 5. 域名解析

阿里云 → 云解析 DNS → 你的域名 `sicau-pocket.com`：

| 记录类型 | 主机记录 | 记录值 | TTL |
| --- | --- | --- | --- |
| A | `@` | 服务器公网 IP | 600 |
| A | `www` | 服务器公网 IP | 600 |

等 10 分钟，`ping sicau-pocket.com` 能回你的 IP 就生效了。

---

## 6. ICP 备案（国内服务器必须）

服务器在**中国大陆**，用域名访问 80/443 前必须备案，否则会被阿里云拦截（提示"域名未备案"）。

流程：

1. 阿里云 → **ICP 代备案系统** → 新增备案
2. 备案服务号：在那台 ECS/轻量实例的「备案」入口申请（包年包月 ≥3 个月才能申请）
3. 主体信息（身份证、手机号、人脸核验）+ 网站信息（网站名称建议 `川农口袋`，服务内容选"其他/教育类-其他"，**不要选需要前置审批的新闻/出版/教育机构**）
4. 阿里云初审 1–2 天 → 工信部短信核验 → 管局审核 7–20 个工作日
5. 通过后拿到 `蜀ICP备XXXXXXXX号-1`，**把它填进页脚**：

```bash
# 在本地 site/ 目录里替换后再上传
grep -rl "2026xxxxxx" . | xargs sed -i '' 's/蜀 ICP 备 2026xxxxxx 号/蜀ICP备2026xxxxxx号-1/'
rsync -avz site/ root@<IP>:/var/www/sicau-pocket/
```

备案通过前，可以用 IP 直接访问（不影响你自己测试），但别把 IP 链接发出去——IP 一旦被举报或抽查，可能被要求关停。

> App Store 审核时如果备案还没下来，先把隐私政策挂到 GitHub Pages / Cloudflare Pages 的临时地址（见 `DEPLOY.md` 第 0 节），审核通过后再换。

---

## 7. HTTPS（免费证书 + 自动续期）

备案通过、域名解析生效后：

```bash
certbot --nginx -d sicau-pocket.com -d www.sicau-pocket.com
```

按提示选：

- 输入邮箱（接收到期提醒）
- 同意协议
- **选择 2（Redirect）**：把 HTTP 全部 301 到 HTTPS

验证自动续期（Let's Encrypt 证书 90 天）：

```bash
systemctl list-timers | grep certbot     # 应有 certbot.timer
certbot renew --dry-run                  # 演练一次
```

> 也可以用阿里云免费 DV 证书（控制台申请 → 下载 nginx 格式 → 上传到 `/etc/nginx/ssl/`），配置里 `ssl_certificate` 两行指向那两个文件即可。

---

## 8. 上线验收

```bash
# 1) 首页是 HTML，不是下载
curl -sI https://sicau-pocket.com/ | grep -iE "HTTP/|content-type"
# 期望：HTTP/2 200 + content-type: text/html; charset=utf-8

# 2) 隐私政策可访问（App Store 要填）
curl -sI https://sicau-pocket.com/privacy.html | head -3

# 3) APK 类型与体积正确
curl -sI https://sicau-pocket.com/apk/sicau-pocket-latest.apk | grep -iE "content-type|content-length"
# 期望：application/vnd.android.package-archive + 约 35318273 字节

# 4) HTTP 自动跳 HTTPS
curl -sI http://sicau-pocket.com/ | grep -i location
# 期望：301 → https://sicau-pocket.com/

# 5) 404 走自定义页
curl -s -o /dev/null -w "%{http_code}\n" https://sicau-pocket.com/not-exist
# 期望：404
```

手机上再点一遍：首页截图横滑、点「下载 APK」能装上、深色模式文字可读。

---

## 9. 以后更新版本

仓库里已经放了脚本 `site/deploy/upload.sh`，本地执行：

```bash
cd sicau-pocket
HOST=root@<公网IP> bash site/deploy/upload.sh
```

它做三件事：同步 `site/` → 服务器、修 APK 的 MIME、把 `nginx -t` 跑一遍。

发新版本的完整顺序：

1. `bash scripts/build-apk-local.sh --arm64`
2. `cp ../sicau-pocket-vX.Y.Z-arm64.apk site/apk/sicau-pocket-latest.apk`
3. 改 `index.html` / `download.html` 里的版本号与更新说明
4. `HOST=... bash site/deploy/upload.sh`

---

## 10. ECS vs OSS+CDN 怎么选

| | ECS + Nginx | OSS + CDN |
| --- | --- | --- |
| 月成本 | ¥50–100（含备案资质） | 几毛钱（流量计费） |
| 备案 | 必须有（也正好能拿备案服务号） | 绑自定义域名同样必须备案 |
| 运维 | 要管系统、证书、nginx | 几乎不用管 |
| 抗压/速度 | 3M 带宽 ≈ 10 个并发下载 APK 就会慢 | CDN 全国节点，下载快 |
| 扩展 | 可跑动态功能（版本检查、TestFlight 页） | 只能静态 |

现实建议：**ECS 拿到备案号之后，把站点仍放 OSS+CDN，ECS 只留一个空的 nginx 首页**用于备案检查；或者两套都放（`www` 指 ECS、`dl.sicau-pocket.com` 指 CDN 专门下载 APK）。纯静态站用 ECS 有点浪费，但作为备案与后续动态能力的基础设施是合理的。
