#!/usr/bin/env bash
# 服务器端一键拉取并部署（不需要本地传文件，适合只在 Workbench 里操作的情况）
#
#   bash pull-and-deploy.sh sicau-pocket.com
#
# 做的事：
#   1. 从 GitHub 拉最新 main 分支的 site/ 目录
#   2. 同步到 /var/www/sicau-pocket
#   3. 按 version.json 里的版本号，从 GitHub Release 下载对应 APK
#   4. 安装 nginx 配置（把域名替换成参数）并 reload
#   5. 自检
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
curl -fsSL "https://codeload.github.com/${REPO}/tar.gz/refs/heads/main" -o "$TMP/repo.tar.gz"
tar -xzf "$TMP/repo.tar.gz" -C "$TMP"
SRC="$(find "$TMP" -maxdepth 1 -type d -name 'sicau-pocket-*' | head -1)"
[[ -d "$SRC/site" ]] || { echo "✗ 压缩包里没有 site/ 目录" >&2; exit 1; }
echo "  ✓ $SRC/site"

echo "== 2/5 同步到 $DIR =="
mkdir -p "$DIR"
rsync -a --delete --exclude='/apk/' "$SRC/site/" "$DIR/"

echo "== 3/5 下载安装包 =="
VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$DIR/app/version.json" | head -1)"
if [[ -z "$VERSION" ]]; then
  echo "  ! 读不到 version.json 里的版本号，跳过 APK" >&2
else
  APK_URL="https://github.com/${REPO}/releases/download/v${VERSION}/sicau-pocket-v${VERSION}-arm64.apk"
  mkdir -p "$DIR/apk"
  echo "  · v$VERSION ← $APK_URL"
  if curl -fL --retry 2 -o "$DIR/apk/sicau-pocket-latest.apk" "$APK_URL"; then
    cp "$DIR/apk/sicau-pocket-latest.apk" "$DIR/apk/sicau-pocket-${VERSION}.apk"
    echo "  ✓ APK $(du -h "$DIR/apk/sicau-pocket-latest.apk" | cut -f1)"
  else
    echo "  ! APK 下载失败（Release 里可能没有这个版本），下载页会 404" >&2
  fi
fi

echo "== 4/5 安装 nginx 配置 =="
sed -e "s/sicau-pocket\.com/${DOMAIN}/g" "$DIR/deploy/nginx-sicau-pocket.conf" > "$CONF"
ln -sf "$CONF" "/etc/nginx/sites-enabled/${DOMAIN}"
[[ -e /etc/nginx/sites-enabled/default ]] && rm -f /etc/nginx/sites-enabled/default || true

chown -R www-data:www-data "$DIR"
find "$DIR" -type d -exec chmod 755 {} \;
find "$DIR" -type f -exec chmod 644 {} \;

nginx -t
systemctl reload nginx
echo "  ✓ $CONF 已启用"

echo "== 5/5 自检 =="
systemctl is-active --quiet nginx && echo "  ✓ nginx running"
curl -sI http://127.0.0.1/ | head -1
curl -sI http://127.0.0.1/apk/sicau-pocket-latest.apk | grep -i content-type || true
echo
echo "公网 IP：$(curl -s --max-time 5 https://api.ipify.org || echo '取不到')"
echo "下一步：浏览器开 http://<公网IP>/ 验收 → 解析域名 → 备案 → certbot 上 HTTPS"
