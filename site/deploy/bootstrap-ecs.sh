#!/usr/bin/env bash
# 服务器端一键初始化（在 ECS 上以 root 执行）
#
#   curl -fsSL https://raw.githubusercontent.com/GRERAT666708/sicau-pocket/main/site/deploy/bootstrap-ecs.sh | bash -s -- sicau-pocket.com
#
#   或者本地传上去再跑：
#   scp site/deploy/bootstrap-ecs.sh root@IP:/root/ && ssh root@IP 'bash /root/bootstrap-ecs.sh sicau-pocket.com'
#
# 做的事：装 nginx/rsync/certbot → 建站点目录 → 建一个占位首页 → 装站点配置 → 自检。
# 幂等，可以重复执行。

set -euo pipefail

DOMAIN="${1:-sicau-pocket.com}"
WWW="www.${DOMAIN}"
DIR="/var/www/sicau-pocket"
CONF="/etc/nginx/sites-available/${DOMAIN}"

if [[ "$(id -u)" != "0" ]]; then
  echo "请用 root 运行：sudo bash $0 $DOMAIN" >&2
  exit 1
fi

echo "== 1/6 安装依赖 =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx rsync certbot python3-certbot-nginx curl ca-certificates

echo "== 2/6 建目录 =="
mkdir -p "$DIR"
if [[ ! -f "$DIR/index.html" ]]; then
  cat > "$DIR/index.html" <<HTML
<!doctype html><meta charset="utf-8"><title>${DOMAIN}</title>
<body style="font-family:-apple-system,system-ui,sans-serif;padding:40px;line-height:1.8">
<h1>川农口袋</h1>
<p>站点正在部署中。如果看到这个页面，说明 nginx 已经正常工作。</p>
<p>域名：${DOMAIN}</p>
</body>
HTML
  echo "  ✓ 写入占位首页"
fi

echo "== 3/6 安装 nginx 站点配置 =="
if [[ -f /root/nginx-sicau-pocket.conf ]]; then
  sed -e "s/sicau-pocket\.com/${DOMAIN}/g" /root/nginx-sicau-pocket.conf > "$CONF"
  ln -sf "$CONF" "/etc/nginx/sites-enabled/${DOMAIN}"
  [[ -e /etc/nginx/sites-enabled/default ]] && rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
  echo "  ✓ 已安装 $CONF"
else
  echo "  ! 没找到 /root/nginx-sicau-pocket.conf，先用默认站点跑起来"
  echo "    本地执行 HOST=root@本机IP bash site/deploy/upload.sh 会自动安装配置"
fi

echo "== 4/6 防火墙（如启用了 ufw） =="
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp
  ufw allow 443/tcp
  echo "  ✓ ufw 已放行 80/443"
else
  echo "  · ufw 未启用，记得在阿里云【安全组】放行 80/443"
fi

echo "== 5/6 自检 =="
systemctl is-active --quiet nginx && echo "  ✓ nginx running" || echo "  ✗ nginx 没起来"
curl -sI "http://127.0.0.1/" | head -1 || true
echo "  公网 IP：$(curl -s --max-time 5 https://api.ipify.org || echo '取不到')"

echo "== 6/6 下一步 =="
cat <<NEXT

  1) 本地把文件传上来（在仓库 sicau-pocket/ 目录）：
       HOST=root@<公网IP> DOMAIN=${DOMAIN} bash site/deploy/upload.sh

  2) 域名 A 记录：@ 和 www 都指向上面这个公网 IP

  3) 备案通过后再上 HTTPS：
       certbot --nginx -d ${DOMAIN} -d ${WWW}
     （提示里选 2 = Redirect，HTTP 全部跳 HTTPS）

NEXT
