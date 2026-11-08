#!/bin/bash
# 一条命令进入调试：开模拟器 → 等开机 → 开 Metro → 端口反代 → 打开「川农口袋」
#
# 用法:
#   ./scripts/dev.sh              # 带窗口的模拟器（默认）
#   ./scripts/dev.sh --headless   # 无窗口
#   ./scripts/dev.sh --no-metro   # Metro 已经在跑时用，只起模拟器并打开 App
#   ./scripts/dev.sh --clear      # 清 Metro 缓存重启（改过依赖/配置后用）
#
# 关掉: ./scripts/stop-dev.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WS="$(cd "$ROOT/.." && pwd)"
SDK="$WS/android-sdk"
NODE_DIR="/Users/grerat/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin"
PNPM="/Users/grerat/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.cjs"
AVD_NAME="${AVD_NAME:-sicau}"
PORT="${EXPO_PORT:-8081}"

WINDOW=1
START_METRO=1
CLEAR=0
for arg in "$@"; do
  case "$arg" in
    --headless) WINDOW=0 ;;
    --no-metro) START_METRO=0 ;;
    --clear) CLEAR=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "未知参数: ${arg}（用 --help 看用法）"; exit 1 ;;
  esac
done

# 受限环境：adb / emulator 都要能写 ~/.android，统一把 HOME 指到工作区里
export HOME="$WS/android-user"
export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"
export ANDROID_USER_HOME="$HOME"
export ANDROID_AVD_HOME="$HOME/avd"
mkdir -p "$ANDROID_AVD_HOME" "$HOME/.android"
ADB="$SDK/platform-tools/adb"

if [ ! -x "$ADB" ]; then
  echo "找不到 adb：$ADB"
  echo "先按 docs/android-setup.md 装好 Android SDK。"
  exit 1
fi

# 1) 模拟器
if "$ADB" devices | grep -q "emulator-[0-9]*[[:space:]]*device"; then
  echo "✓ 模拟器已经在运行"
else
  ARGS=(-avd "$AVD_NAME" -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect -no-metrics)
  [ "$WINDOW" = "1" ] || ARGS+=(-no-window)
  echo "→ 启动模拟器 ${AVD_NAME}（日志：$WS/.dev-emulator.log）"
  nohup "$SDK/emulator/emulator" "${ARGS[@]}" >"$WS/.dev-emulator.log" 2>&1 &
  echo $! >"$WS/.dev-emulator.pid"
fi

echo -n "→ 等待开机"
for i in $(seq 1 90); do
  if [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
    echo " ✓"
    break
  fi
  [ "$i" = "90" ] && { echo; echo "模拟器 3 分钟没起来，看日志：$WS/.dev-emulator.log"; exit 1; }
  echo -n "."
  sleep 2
done

# 2) Metro
if [ "$START_METRO" = "1" ]; then
  if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/status"; then
    echo "✓ Metro 已经在 $PORT 上跑着"
  else
    LOG="$WS/.dev-metro.log"
    echo "→ 启动 Metro（日志：${LOG}）"
    cd "$ROOT"
    METRO_ARGS=(exec expo start --port "$PORT")
    [ "$CLEAR" = "1" ] && METRO_ARGS+=("--clear")
    HOME="$ROOT/.home" PATH="$NODE_DIR:$PATH" \
      nohup node "$PNPM" "${METRO_ARGS[@]}" >"$LOG" 2>&1 &
    echo $! >"$WS/.dev-metro.pid"
    echo -n "→ 等 Metro 起来"
    for i in $(seq 1 60); do
      if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/status"; then echo " ✓"; break; fi
      [ "$i" = "60" ] && { echo; echo "Metro 没起来，看日志：$LOG"; exit 1; }
      echo -n "."
      sleep 2
    done
  fi
fi

# 3) 端口反代 + 打开 App（冷启动时 Expo Go 偶尔会抢跑，报 runtime not ready，自动重开一次）
"$ADB" reverse "tcp:$PORT" "tcp:$PORT" >/dev/null
open_app() {
  "$ADB" shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:$PORT" >/dev/null 2>&1 || true
}
"$ADB" logcat -c >/dev/null 2>&1 || true
open_app
echo -n "→ 等 App 加载"
sleep 15
if "$ADB" logcat -d 2>/dev/null | grep -q "runtime not ready"; then
  echo " (冷启动抢跑，重开一次)"
  "$ADB" shell am force-stop host.exp.exponent >/dev/null 2>&1 || true
  sleep 2
  "$ADB" reverse "tcp:$PORT" "tcp:$PORT" >/dev/null
  open_app
  sleep 15
else
  echo " ✓"
fi

cat <<EOF

✅ 准备好了
   App 正在模拟器里加载（首次可能要十几秒）

   常用操作
     改代码后自动热更新，不用重启
     重新打开 App:  ./scripts/open-in-emulator.sh
     看截图:        export HOME="$WS/android-user"; $ADB exec-out screencap -p > /tmp/shot.png
     看 Metro 日志: tail -f $WS/.dev-metro.log
     全部关掉:      ./scripts/stop-dev.sh

   手机上看（不用模拟器）
     node $PNPM exec expo start   # 然后用 Expo Go 扫二维码

EOF
