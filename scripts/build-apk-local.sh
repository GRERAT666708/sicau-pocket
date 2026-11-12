#!/usr/bin/env bash
# 本机构建 APK（不需要 Expo 账号、不走 EAS 云构建）。
#
#   ./scripts/build-apk-local.sh
#
# 依赖（都装在仓库外一层的 ../ 里）：
#   ../tools/node          Node 26 + npm（跑 expo prebuild 与 JS 打包）
#   ../tools/jdk17         JDK 17（Corretto）
#   ../tools/gradle-9.4.1  Gradle 9.4.1（AGP 9 要求）
#   ../android-sdk         Android SDK（build-tools 37 / platforms 37 / NDK 27.1）
#
# 产物：android/app/build/outputs/apk/release/app-release.apk → 复制成 sicau-pocket.apk
set -euo pipefail
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

# lib/version.ts 要和 app.json 同步，否则「检查更新」会一直提示
APP_VER="$(grep -o '"version": *"[^"]*"' app.json | head -1 | sed -E 's/.*"([^"]+)"$/\1/')"
APP_CODE="$(grep -o '"versionCode": *[0-9]*' app.json | head -1 | grep -o '[0-9]*')"
TS_VER="$(grep -o "APP_VERSION = '[^']*'" lib/version.ts | sed -E "s/.*'([^']+)'/\1/")"
TS_CODE="$(grep -o 'APP_BUILD = [0-9]*' lib/version.ts | grep -o '[0-9]*')"
if [ "$APP_VER" != "$TS_VER" ] || [ "$APP_CODE" != "$TS_CODE" ]; then
  echo "✗ lib/version.ts 与 app.json 版本不一致：app.json = ${APP_VER}/${APP_CODE}, version.ts = ${TS_VER}/${TS_CODE}"
  exit 1
fi

ABI="all"
for arg in "$@"; do
  case "$arg" in
    --arm64) ABI="arm64" ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WS="$(cd "$ROOT/.." && pwd)"
cd "$ROOT"

export HOME="$WS/.home"
export JAVA_HOME="$WS/tools/jdk17/Contents/Home"
export GRADLE_USER_HOME="$WS/.gradle-home"
export ANDROID_USER_HOME="$WS/android-user"
export ANDROID_HOME="$WS/android-sdk"
export ANDROID_SDK_ROOT="$WS/android-sdk"
PY_BIN="${PY_BIN:-/Users/grerat/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3}"

export PATH="$WS/tools/node/bin:$JAVA_HOME/bin:$WS/tools/gradle-9.4.1/bin:$PATH"

mkdir -p "$HOME" "$ANDROID_USER_HOME"

if [[ ! -d "$ROOT/android" ]]; then
  echo "→ 没有 android/ 原生工程，先跑 expo prebuild"
  CI=1 npx expo prebuild --platform android --no-install
fi

# prebuild 会重新生成 android/，这里把「国内镜像 + SDK 路径」补回去（幂等）
patch_android() {
  cd "$ROOT/android"

  # build-tools 37 在这台机器上下不下来（dl.google.com 只有几 KB/s），
  # 用 init 脚本把所有模块的 buildToolsVersion 钉到已装的 36.0.0。
  mkdir -p "$GRADLE_USER_HOME/init.d"
  cat > "$GRADLE_USER_HOME/init.d/bt36.gradle" <<'INIT'
allprojects { p ->
  p.plugins.withId('com.android.application') { p.android.buildToolsVersion = '36.0.0' }
  p.plugins.withId('com.android.library') { p.android.buildToolsVersion = '36.0.0' }
  p.afterEvaluate {
    def ext = p.extensions.findByName('android')
    if (ext != null) { try { ext.buildToolsVersion = '36.0.0' } catch (Throwable ignored) {} }
  }
}
INIT

  # 打开代码压缩 + 资源压缩（全 ABI 102MB → ~60MB；单 ABI 39MB → 33MB）
  sed -i '' 's/^android.enableMinifyInReleaseBuilds=.*/android.enableMinifyInReleaseBuilds=true/' gradle.properties || true
  # 版本号跟随 app.json（prebuild 不会自动更新已存在的 android/）
  APP_VER=$(cd "$ROOT" && "$PY_BIN" -c "import json;print(json.load(open('app.json'))['expo']['version'])")
  APP_CODE=$(cd "$ROOT" && "$PY_BIN" -c "import json;print(json.load(open('app.json'))['expo'].get('android',{}).get('versionCode',1))")
  echo "  版本：$APP_VER (versionCode $APP_CODE)"
  sed -i '' "s/versionCode [0-9]*/versionCode $APP_CODE/" app/build.gradle
  sed -i '' "s/versionName \"[^\"]*\"/versionName \"$APP_VER\"/" app/build.gradle

  grep -q '^android.enableShrinkResourcesInReleaseBuilds' gradle.properties \
    && sed -i '' 's/^android.enableShrinkResourcesInReleaseBuilds=.*/android.enableShrinkResourcesInReleaseBuilds=true/' gradle.properties \
    || printf '\nandroid.enableShrinkResourcesInReleaseBuilds=true\n' >> gradle.properties

  # expo modules 用反射按名字加载类，压缩时保守一点全 keep（体积影响很小）。
  # 注意：曾经启动就 NoClassDefFoundError(LazyKType) 的真正原因是
  # expo-linear-gradient / expo-haptics 装成了 15.0.8（旧命名），
  # 而 SDK 58 要求 ~58.0.3 / ~58.0.7 —— keep 规则救不了版本错配。
  "$PY_BIN" - <<'PRO'
p = 'app/proguard-rules.pro'
marker = 'expo.modules.kotlin.types'
s = open(p).read()
if marker not in s:
    s += '''
# expo modules 通过反射按名字加载，压缩时必须保留
-dontwarn expo.modules.**
-keep class expo.modules.** { *; }
-keepclassmembers class expo.modules.** { *; }
-keep class expo.modules.kotlin.** { *; }
'''
    open(p, 'w').write(s)
PRO

  printf 'sdk.dir=%s\n' "$ANDROID_HOME" > local.properties

  "$PY_BIN" - <<'PY'
p = 'build.gradle'
s = open(p).read()
if 'maven.aliyun.com/repository/google' not in s:
    s = s.replace("""  repositories {
    google()
    mavenCentral()
  }""", """  repositories {
    maven { url 'https://maven.aliyun.com/repository/google' }
    maven { url 'https://maven.aliyun.com/repository/central' }
    maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }
    google()
    mavenCentral()
  }""", 1)
    s = s.replace("""  repositories {
    google()
    mavenCentral()
    maven { url 'https://www.jitpack.io' }
  }""", """  repositories {
    maven { url 'https://maven.aliyun.com/repository/google' }
    maven { url 'https://maven.aliyun.com/repository/central' }
    maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }
    google()
    mavenCentral()
    maven { url 'https://www.jitpack.io' }
  }""", 1)
    open(p, 'w').write(s)

p = 'settings.gradle'
s = open(p).read()
if 'maven.aliyun.com/repository/google' not in s:
    s = s.replace("pluginManagement {\n", """pluginManagement {
  repositories {
    maven { url 'https://maven.aliyun.com/repository/google' }
    maven { url 'https://maven.aliyun.com/repository/central' }
    maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }
    gradlePluginPortal()
    google()
    mavenCentral()
  }
""", 1)
    open(p, 'w').write(s)
print('android/ patched')
PY
}

patch_android

# 版本自检：expo 系包必须和 SDK 58 的 bundledNativeModules 对齐，
# 否则压缩包能编出来但一启动就 NoClassDefFoundError。
( cd "$ROOT" && node -e '
const fs=require("fs");
const b=require("./node_modules/expo/bundledNativeModules.json");
const bad=[];
for(const [k,v] of Object.entries(b)){
  try{
    const inst=JSON.parse(fs.readFileSync("./node_modules/"+k+"/package.json","utf8")).version;
    if(inst!==v.replace(/^[~^]/,"")) bad.push(k+" 想要 "+v+" 实际 "+inst);
  }catch(e){}
}
if(bad.length){ console.log("⚠️  expo 包版本和 SDK 58 不一致："); bad.forEach(x=>console.log("   - "+x));
  console.log("   先跑：npx expo install --fix（或手动装成上面的版本），否则压缩包会启动崩溃。"); }
' )

echo "→ 开始构建（首次会下载 Gradle 依赖，约 2GB；之后增量很快）"
cd "$ROOT/android"
if [[ "$ABI" == "arm64" ]]; then
  # 同步图标到 Android 资源（prebuild 只在首次生成，改图标后需要手动同步）
if [ -f "$ROOT/assets/images/icon.png" ] && [ -d "$ROOT/android/app/src/main/res" ]; then
  "$PY_BIN" - "$ROOT" <<'PYEOF'
import sys, os
from PIL import Image
root = sys.argv[1]
res = os.path.join(root, 'android/app/src/main/res')
dens = {'mdpi':1, 'hdpi':1.5, 'xhdpi':2, 'xxhdpi':3, 'xxxhdpi':4}
icon = Image.open(os.path.join(root,'assets/images/icon-simple.png')).convert('RGBA')
fg   = Image.open(os.path.join(root,'assets/images/android-icon-foreground.png')).convert('RGBA')
bg   = Image.open(os.path.join(root,'assets/images/android-icon-background.png')).convert('RGBA')
mono = Image.open(os.path.join(root,'assets/images/android-icon-monochrome.png')).convert('RGBA')
for d, s in dens.items():
    p = os.path.join(res, f'mipmap-{d}')
    os.makedirs(p, exist_ok=True)
    L = int(48*s); A = int(108*s)
    icon.resize((L,L), Image.LANCZOS).save(f'{p}/ic_launcher.webp','WEBP',quality=92)
    icon.resize((L,L), Image.LANCZOS).save(f'{p}/ic_launcher_round.webp','WEBP',quality=92)
    fg.resize((A,A), Image.LANCZOS).save(f'{p}/ic_launcher_foreground.webp','WEBP',quality=92)
    bg.resize((A,A), Image.LANCZOS).save(f'{p}/ic_launcher_background.webp','WEBP',quality=92)
    mono.resize((A,A), Image.LANCZOS).save(f'{p}/ic_launcher_monochrome.webp','WEBP',quality=92)
PYEOF
fi

gradle :app:assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a
else
  gradle :app:assembleRelease --no-daemon
fi

APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
if [[ -f "$APK" ]]; then
  cp "$APK" "$ROOT/sicau-pocket.apk"
  echo
  echo "✓ 构建完成：$ROOT/sicau-pocket.apk"
  echo "  传到手机安装即可（允许「安装未知来源应用」）。"
  ls -lh "$ROOT/sicau-pocket.apk"
else
  echo "✗ 没找到 APK，看上面的报错"
  exit 1
fi
