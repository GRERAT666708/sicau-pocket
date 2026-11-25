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

if [ "$UPLOAD" = "--upload" ]; then
  echo "==> upload to TestFlight"
  mkdir -p ~/private_keys && cp "$KEY_PATH" ~/private_keys/ && chmod 600 ~/private_keys/$(basename "$KEY_PATH")
  xcrun altool --upload-app -f "$H/build/export/app.ipa" -t ios \
    --apiKey "$KEY_ID" --apiIssuer "$ISSUER"
fi
