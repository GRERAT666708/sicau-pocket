#!/usr/bin/env bash
# 一键出 APK（EAS 云构建）。需要 Node + 网络，不需要 Android Studio。
#
#   ./scripts/build-apk.sh            # preview（APK，可直装）
#   ./scripts/build-apk.sh --local    # 本机构建（需 Android SDK + JDK 17）
#   ./scripts/build-apk.sh --ios      # iOS（需 Apple 开发者账号）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 优先用工作区里装好的 Node（tools/node），这样不依赖系统 PATH
if [[ -x "$ROOT/../tools/node/bin/node" ]]; then
  export PATH="$ROOT/../tools/node/bin:$PATH"
fi

PROFILE="preview"
PLATFORM="android"
EXTRA=()

for arg in "$@"; do
  case "$arg" in
    --local) EXTRA+=("--local") ;;
    --ios) PLATFORM="ios" ;;
    --production) PROFILE="production" ;;
    *) echo "未知参数: $arg"; exit 1 ;;
  esac
done

# 包名/版本自检
PKG=$(node -e "console.log(require('./app.json').expo.android.package)")
BID=$(node -e "console.log(require('./app.json').expo.ios.bundleIdentifier)")
VER=$(node -e "console.log(require('./app.json').expo.version)")
echo "应用版本 : $VER"
echo "Android  : $PKG"
echo "iOS      : $BID"
echo "profile  : $PROFILE"
echo

if [[ "$PKG" == *"sicau.edu"* || "$PKG" == "com.sicau.pocket" ]]; then
  echo "⚠️  包名还带着学校域名，上架/分发有风险，建议改成 io.github.<你的用户名>.xxx"
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "需要 Node.js（含 npx）。装好 Node 后再跑一次。"
  exit 1
fi

# 没登录就先登录（会要求浏览器授权 / 输入用户名密码）
if ! npx --yes eas-cli@latest whoami >/dev/null 2>&1; then
  echo "还没登录 Expo，先执行：npx eas-cli@latest login"
  npx --yes eas-cli@latest login
fi

npx --yes eas-cli@latest build \
  -p "$PLATFORM" \
  --profile "$PROFILE" \
  "${EXTRA[@]+"${EXTRA[@]}"}"

echo
echo "构建结束后，终端里会给出下载链接；手机打开链接安装 APK 即可。"
echo "构建列表：https://expo.dev/accounts/\$(npx --yes eas-cli@latest whoami)/projects/sicau-pocket/builds"
