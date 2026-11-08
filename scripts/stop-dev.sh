#!/bin/bash
# 关掉 scripts/dev.sh 起的东西：模拟器 + Metro
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WS="$(cd "$ROOT/.." && pwd)"
SDK="$WS/android-sdk"
export HOME="$WS/android-user"
ADB="$SDK/platform-tools/adb"

if [ -x "$ADB" ] && "$ADB" devices | grep -q "emulator-[0-9]*[[:space:]]*device"; then
  echo "→ 关模拟器"
  "$ADB" emu kill >/dev/null 2>&1 || true
else
  echo "· 模拟器没在跑"
fi

for name in .dev-metro .dev-emulator; do
  pidfile="$WS/$name.pid"
  if [ -f "$pidfile" ]; then
    pid="$(cat "$pidfile")"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "→ 关 $name (pid $pid)"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  fi
done

# Metro 有时是 node 子进程，按端口兜底
port_pid="$(lsof -ti tcp:${EXPO_PORT:-8081} 2>/dev/null | head -1)"
if [ -n "${port_pid:-}" ]; then
  echo "→ 关占用 ${EXPO_PORT:-8081} 的进程 ($port_pid)"
  kill "$port_pid" 2>/dev/null || true
fi

"$ADB" kill-server >/dev/null 2>&1 || true
echo "✓ 都关了"
