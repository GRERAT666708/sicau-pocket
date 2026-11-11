#!/usr/bin/env bash
# 川农口袋官网 —— 一键把 site/ 同步到阿里云 ECS
#
# 用法（在仓库 sicau-pocket/ 目录下执行）：
#   HOST=root@1.2.3.4                 bash site/deploy/upload.sh
#   HOST=root@1.2.3.4 DIR=/var/www/x   bash site/deploy/upload.sh
#   HOST=root@1.2.3.4 SKIP_APK=1      bash site/deploy/upload.sh   # 只改页面、不动 34MB 的 APK
#
# 依赖：本地有 rsync / ssh；服务器已按 DEPLOY-ECS.md 装好 nginx。

set -euo pipefail

HOST="${HOST:?请指定 HOST，例如 HOST=root@1.2.3.4}"
DIR="${DIR:-/var/www/sicau-pocket}"
SKIP_APK="${SKIP_APK:-0}"
SITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "→ 源目录：$SITE_DIR"
echo "→ 目标：$HOST:$DIR"

if [[ ! -f "$SITE_DIR/index.html" ]]; then
  echo "✗ 没找到 index.html，确认脚本放在 site/deploy/ 下" >&2
  exit 1
fi

if [[ "$SKIP_APK" == "1" ]]; then
  RSYNC_FILTER="--exclude=/apk/"
else
  RSYNC_FILTER=""
  if [[ ! -f "$SITE_DIR/apk/sicau-pocket-latest.apk" ]]; then
    echo "! site/apk/ 里没有安装包，先执行：" >&2
    echo "  cp ../sicau-pocket-vX.Y.Z-arm64.apk site/apk/sicau-pocket-latest.apk" >&2
    exit 1
  fi
fi

echo "→ 同步文件…"
# shellcheck disable=SC2086
rsync -avz --delete $RSYNC_FILTER \
  "$SITE_DIR/" "$HOST:$DIR/"

echo "→ 修权限与 APK MIME…"
ssh "$HOST" bash -s <<EOF
set -euo pipefail
chown -R www-data:www-data "$DIR"
find "$DIR" -type d -exec chmod 755 {} \;
find "$DIR" -type f -exec chmod 644 {} \;
if [ -f "$DIR/apk/sicau-pocket-latest.apk" ]; then
  ls -lh "$DIR/apk/sicau-pocket-latest.apk"
fi
nginx -t
systemctl reload nginx
echo "✓ nginx 已重载"
EOF

echo "→ 线上自检："
curl -sI "http://${HOST#*@}/" | head -3 || true

echo "✓ 完成。浏览器强制刷新（Cmd+Shift+R）即可看到新版本。"
