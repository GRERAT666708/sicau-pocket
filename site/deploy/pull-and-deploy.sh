#!/usr/bin/env bash
# 服务器端一键拉取并部署（不需要本地传文件，适合只在 Workbench 里操作的情况）
#
#   bash pull-and-deploy.sh sicau-pocket.com
#   SKIP_APK=1 bash pull-and-deploy.sh sicau-pocket.com     # 先不上 APK，站点先跑起来
#
# 顺序刻意是「先让网站能打开，再补 APK」：
#   1. 拉仓库 → 2. 同步 → 3. 装 nginx 配置并 reload → 4. 下载 APK → 5. 自检
# GitHub release 下载在国内经常卡住，所以 APK 会依次试几个镜像，超时就跳下一个，
# 下载失败也不影响网站已经能打开。
#
# 幂等，可反复执行；以后发版只要在服务器上再跑一次。

set -euo pipefail

DOMAIN="${1:-sicau-pocket.com}"
REPO="GRERAT666708/sicau-pocket"
DIR="/var/www/sicau-pocket"
CONF="/etc/nginx/sites-available/${DOMAIN}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [[ "$(id -u)" != "0" ]]; then
  echo "请用 root 运行：sudo bash $0 $DOMAIN" >&2
  exit 1
fi

echo "== 1/5 拉取仓库 =="
curl -fsSL --max-time 60 "https://codeload.github.com/${REPO}/tar.gz/refs/heads/main" -o "$TMP/repo.tar.gz"
tar -xzf "$TMP/repo.tar.gz" -C "$TMP"
SRC="$(find "$TMP" -maxdepth 1 -type d -name 'sicau-pocket-*' | head -1)"
[[ -d "$SRC/site" ]] || { echo "✗ 压缩包里没有 site/ 目录" >&2; exit 1; }
echo "  ✓ $SRC/site"

echo "== 2/5 同步到 $DIR =="
mkdir -p "$DIR"
rsync -a --delete --exclude='/apk/' "$SRC/site/" "$DIR/"

echo "== 3/5 安装 nginx 配置 =="
sed -e "s/sicau-pocket\.com/${DOMAIN}/g" "$DIR/deploy/nginx-sicau-pocket.conf" > "$CONF"
ln -sf "$CONF" "/etc/nginx/sites-enabled/${DOMAIN}"
[[ -e /etc/nginx/sites-enabled/default ]] && rm -f /etc/nginx/sites-enabled/default || true

chown -R www-data:www-data "$DIR"
find "$DIR" -type d -exec chmod 755 {} \;
find "$DIR" -type f -exec chmod 644 {} \;

nginx -t
systemctl reload nginx
echo "  ✓ $CONF 已启用（这一步之后 http://<IP>/ 就能打开官网了）"

echo "== 4/5 下载安装包 =="
VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$DIR/app/version.json" | head -1)"
APK="$DIR/apk/sicau-pocket-latest.apk"

if [[ "${SKIP_APK:-0}" == "1" ]]; then
  echo "  · SKIP_APK=1，跳过"
elif [[ -z "$VERSION" ]]; then
  echo "  ! 读不到 version.json 里的版本号，跳过 APK"
elif [[ -s "$APK" ]] && [[ "$(stat -c%s "$APK")" -gt 5000000 ]]; then
  echo "  · 已有 $(du -h "$APK" | cut -f1) 的安装包，跳过（要重下先删 $APK）"
else
  mkdir -p "$DIR/apk"
  ASSET="https://github.com/${REPO}/releases/download/v${VERSION}/sicau-pocket-v${VERSION}-arm64.apk"
  echo "  · v$VERSION"
  ok=0
  for prefix in "https://ghfast.top/" "https://gh-proxy.com/" ""; do
    url="${prefix}${ASSET}"
    echo "    试 ${prefix:-直连} ..."
    if curl -fL --max-time 120 --retry 1 -o "$APK.part" "$url" && [[ "$(stat -c%s "$APK.part" 2>/dev/null || echo 0)" -gt 5000000 ]]; then
      mv "$APK.part" "$APK"
      cp "$APK" "$DIR/apk/sicau-pocket-${VERSION}.apk"
      ok=1
      break
    fi
    rm -f "$APK.part"
  done
  if [[ "$ok" == "1" ]]; then
    echo "  ✓ APK $(du -h "$APK" | cut -f1)"
  else
    echo "  ! APK 没下下来（下载页会 404，其它页面正常）" >&2
    echo "    可以稍后在本机执行：scp 本地包 root@<IP>:$DIR/apk/sicau-pocket-latest.apk" >&2
  fi
fi

echo "== 5/5 自检 =="
systemctl is-active --quiet nginx && echo "  ✓ nginx running"
echo -n "  首页："; curl -sI --max-time 5 http://127.0.0.1/ | head -1
echo -n "  私有："; curl -sI --max-time 5 http://127.0.0.1/privacy.html | head -1
if [[ -s "$APK" ]]; then
  echo -n "  APK："; curl -sI --max-time 5 http://127.0.0.1/apk/sicau-pocket-latest.apk | grep -i content-type || true
fi
echo
echo "下一步：浏览器开 http://<公网IP>/ 验收 → 解析域名（A 记录 @ 和 www）→ 备案 → certbot 上 HTTPS"
