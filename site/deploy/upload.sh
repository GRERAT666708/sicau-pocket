#!/usr/bin/env bash
# 川农口袋官网 —— 一键把 site/ 同步到阿里云 ECS（可选顺带装 nginx 配置）
#
# 用法（在仓库 sicau-pocket/ 目录下执行）：
#   HOST=root@1.2.3.4 bash site/deploy/upload.sh                          # 只同步文件
#   HOST=root@1.2.3.4 DOMAIN=sicau-pocket.com bash site/deploy/upload.sh  # 同步 + 装 nginx 站点配置
#   HOST=root@1.2.3.4 SKIP_APK=1 bash site/deploy/upload.sh               # 只改页面、不动 34MB 的 APK
#
# 依赖：本地有 rsync / ssh；服务器已装 nginx（没装就先跑 site/deploy/bootstrap-ecs.sh）。

set -euo pipefail

HOST="${HOST:?请指定 HOST，例如 HOST=root@1.2.3.4}"
DIR="${DIR:-/var/www/sicau-pocket}"
DOMAIN="${DOMAIN:-}"
SKIP_APK="${SKIP_APK:-0}"
SITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IP="${HOST#*@}"

echo "→ 源目录：$SITE_DIR"
echo "→ 目标：$HOST:$DIR"

if [[ ! -f "$SITE_DIR/index.html" ]]; then
  echo "✗ 没找到 index.html，确认脚本放在 site/deploy/ 下" >&2
  exit 1
fi

if [[ "$SKIP_APK" == "1" ]]; then
  RSYNC_FILTER=(--exclude=/apk/)
else
  RSYNC_FILTER=()
  if [[ ! -f "$SITE_DIR/apk/sicau-pocket-latest.apk" ]]; then
    echo "! site/apk/ 里没有安装包，先执行：" >&2
    echo "  cp ../sicau-pocket-vX.Y.Z-arm64.apk site/apk/sicau-pocket-latest.apk" >&2
    exit 1
  fi
fi

echo "→ 1/3 同步文件…"
rsync -avz --delete "${RSYNC_FILTER[@]+"${RSYNC_FILTER[@]}"}" "$SITE_DIR/" "$HOST:$DIR/"

echo "→ 2/3 服务器端整理（权限 / nginx 配置 / 重载）…"
if [[ -n "$DOMAIN" ]]; then
  echo "  · 上传站点配置（DOMAIN=$DOMAIN）"
  scp -q "$SITE_DIR/deploy/nginx-sicau-pocket.conf" "$HOST:/root/nginx-sicau-pocket.conf"
fi

ssh "$HOST" bash -s <<EOF
set -euo pipefail
DIR="$DIR"
DOMAIN="$DOMAIN"

chown -R www-data:www-data "\$DIR"
find "\$DIR" -type d -exec chmod 755 {} \;
find "\$DIR" -type f -exec chmod 644 {} \;

if [ -n "\$DOMAIN" ] && [ -f /root/nginx-sicau-pocket.conf ]; then
  CONF="/etc/nginx/sites-available/\$DOMAIN"
  sed -e "s/sicau-pocket\.com/\$DOMAIN/g" /root/nginx-sicau-pocket.conf > "\$CONF"
  ln -sf "\$CONF" "/etc/nginx/sites-enabled/\$DOMAIN"
  [ -e /etc/nginx/sites-enabled/default ] && rm -f /etc/nginx/sites-enabled/default || true
  echo "  · 已写入 \$CONF"
fi

nginx -t
systemctl reload nginx
echo "  ✓ nginx 已重载"

if [ -f "\$DIR/apk/sicau-pocket-latest.apk" ]; then
  echo "  · APK: \$(du -h "\$DIR/apk/sicau-pocket-latest.apk" | cut -f1)"
fi
EOF

echo "→ 3/3 自检"
curl -sI "http://$IP/" | head -1 || true
if [[ -n "$DOMAIN" ]]; then
  curl -sI "http://$DOMAIN/" | head -1 || echo "  （域名还没解析到这台机器，属正常）"
fi

echo "✓ 完成。浏览器强制刷新（Cmd+Shift+R）即可看到新版本。"
