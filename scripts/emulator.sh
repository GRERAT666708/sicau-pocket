#!/bin/bash
# 启动安卓模拟器（带窗口）。首次使用前先跑一次 scripts/android-setup.md 里的步骤。
# 用法:
#   ./scripts/emulator.sh            # 带窗口启动
#   ./scripts/emulator.sh --headless # 无窗口（CI/截图用）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_SDK_ROOT:-$ROOT/../android-sdk}"
AVD_NAME="${AVD_NAME:-sicau}"

# 沙箱 / 受限环境下 HOME 不可写时，adb 和 emulator 都会崩，这里统一重定向
export HOME="${ANDROID_EMU_HOME:-$ROOT/../android-user}"
export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"
export ANDROID_AVD_HOME="$HOME/avd"
mkdir -p "$ANDROID_AVD_HOME"

ARGS=(-avd "$AVD_NAME" -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect -no-metrics)
if [ "${1:-}" = "--headless" ]; then
  ARGS+=(-no-window)
fi

exec "$SDK/emulator/emulator" "${ARGS[@]}"
