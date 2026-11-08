#!/bin/bash
# 把本机 Metro（默认 8081）映射进模拟器，并用 Expo Go 打开本项目。
# 需要先跑起来：node $PNPM exec expo start --port 8081
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_SDK_ROOT:-$ROOT/../android-sdk}"
PORT="${PORT:-8081}"

export HOME="${ANDROID_EMU_HOME:-$ROOT/../android-user}"
ADB="$SDK/platform-tools/adb"

"$ADB" reverse "tcp:$PORT" "tcp:$PORT" >/dev/null
"$ADB" shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:$PORT" >/dev/null
echo "已在模拟器里打开 exp://127.0.0.1:$PORT"
echo "截图: $ADB exec-out screencap -p > shot.png"
