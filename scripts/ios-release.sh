#!/usr/bin/env bash
# 川农口袋 iOS 出包：archive → 导出 ipa →（可选）上传 TestFlight
# 依赖：.home/asc/ 下的 App Store Connect API Key、已导入的签名 keychain
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
H="$ROOT/.home"
KEYCHAIN="${SICAU_KEYCHAIN:-/tmp/sicau-signing.keychain-db}"
PROFILE_NAME="${SICAU_PROFILE:-SICAU Pocket AppStore}"
WIDGET_BUNDLE="io.github.grerat666708.sicaupocket.widget"
WIDGET_PROFILE_NAME="${SICAU_WIDGET_PROFILE:-SICAU Widget AppStore}"
TEAM="${SICAU_TEAM:-HV6N28UTVZ}"
BUNDLE="io.github.grerat666708.sicaupocket"
KEY_PATH="$H/asc/AuthKey_4GN64G2L6M.p8"
KEY_ID="4GN64G2L6M"
ISSUER="f2348b7f-4036-4629-a67e-94555025cb8a"
UPLOAD="${1:-}"
VERSION="$(python3 -c "import json;print(json.load(open('$ROOT/app.json'))['expo']['version'])")"
BUILD_NUM="$(python3 -c "import json;print(json.load(open('$ROOT/app.json'))['expo']['ios']['buildNumber'])")"
echo "==> version $VERSION ($BUILD_NUM)"

echo "==> archive"
rm -rf "$H/build"; mkdir -p "$H/build"
cd "$ROOT/ios"
xcodebuild -workspace app.xcworkspace -scheme app -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$H/build/app.xcarchive" \
  DEVELOPMENT_TEAM="$TEAM" MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD_NUM" \
  OTHER_CODE_SIGN_FLAGS="--keychain $KEYCHAIN" archive

echo "==> export ipa"
cat > /tmp/ExportOptions.plist <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>$TEAM</string>
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>Apple Distribution</string>
  <key>provisioningProfiles</key><dict>
    <key>$BUNDLE</key><string>$PROFILE_NAME</string>
    <key>$WIDGET_BUNDLE</key><string>$WIDGET_PROFILE_NAME</string>
  </dict>
  <key>uploadSymbols</key><true/><key>destination</key><string>export</string>
</dict></plist>
PL
mkdir -p "$H/build/export"
xcodebuild -exportArchive -archivePath "$H/build/app.xcarchive" -exportPath "$H/build/export" \
  -exportOptionsPlist /tmp/ExportOptions.plist \
  OTHER_CODE_SIGN_FLAGS="--keychain $KEYCHAIN"

ls -lh "$H/build/export/app.ipa"
ACTUAL="$(unzip -p "$H/build/export/app.ipa" Payload/app.app/Info.plist | plutil -extract CFBundleVersion raw -o - - 2>/dev/null || true)"
echo "==> ipa CFBundleVersion=$ACTUAL (expect $BUILD_NUM)"
if [ "$ACTUAL" != "$BUILD_NUM" ]; then echo "ERROR: build number mismatch, abort"; exit 3; fi

# 小组件资源体检：WidgetKit 归档时对图片有像素上限（约小组件尺寸的 2 倍：
# medium 756.8×328，面积 ≈248230）。超了的话 archive / export / 上传都不报错，
# 但桌面上永远只显示系统占位骨架（build 3 就是这么发出去的）。
# 这里在归档产物上直接拦掉。
MAX_AREA=248230
MAX_DIM=756
ASSETS_CAR="$H/build/app.xcarchive/Products/Applications/app.app/PlugIns/SicauWidget.appex/Assets.car"
if [ -f "$ASSETS_CAR" ]; then
  echo "==> widget asset size check"
  if ! xcrun assetutil --info "$ASSETS_CAR" | python3 -c '
import json, sys

max_area, max_dim = int(sys.argv[1]), int(sys.argv[2])
bad = []
for entry in json.load(sys.stdin):
    w, h = entry.get("PixelWidth"), entry.get("PixelHeight")
    if not w or not h:
        continue
    name = entry.get("Name") or "?"
    if w * h > max_area or w > max_dim or h > max_dim:
        bad.append("%s: %dx%d (area %d)" % (name, w, h, w * h))
if bad:
    print("ERROR: WidgetKit 归档会失败，这些图片超出上限：")
    print("\n".join("  - " + b for b in bad))
    sys.exit(1)
print("ok: 小组件图片都在归档上限内")
' "$MAX_AREA" "$MAX_DIM"; then
    echo "ERROR: widget asset size check failed, abort"; exit 3
  fi
else
  echo "==> WARN: 没有找到 SicauWidget.appex/Assets.car，跳过资源体检"
fi

if [ "$UPLOAD" = "--upload" ]; then
  echo "==> upload to TestFlight"
  mkdir -p ~/private_keys && cp "$KEY_PATH" ~/private_keys/ && chmod 600 ~/private_keys/$(basename "$KEY_PATH")
  xcrun altool --upload-app -f "$H/build/export/app.ipa" -t ios \
    --apiKey "$KEY_ID" --apiIssuer "$ISSUER"
fi
