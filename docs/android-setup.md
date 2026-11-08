# 安卓开发环境（本机已装好的那份）

这份文档记录本仓库所在机器上「能跑起安卓版」的完整环境，换机器时照抄即可。

## 已安装的东西

| 组件 | 位置 / 版本 |
| --- | --- |
| Android SDK | `../android-sdk`（与仓库同级，约 6 GB） |
| cmdline-tools / platform-tools | latest / 37.x |
| emulator | 37.2.13 |
| platforms | android-35、android-36 |
| build-tools | 35.0.0、36.0.0 |
| 系统镜像 | `system-images;android-35;google_apis;arm64-v8a` |
| AVD | `sicau`（Pixel 6，Android 15） |
| Expo Go | 58.0.5（已 `adb install`） |

这台机器没有 Android Studio，全部是命令行 SDK；装了 Studio 的话它会自带 SDK，把 `ANDROID_SDK_ROOT` 指过去即可。

## 环境变量（每次开新终端都要设）

```bash
export SDK=$PWD/../android-sdk
export HOME=$PWD/../android-user      # 关键：adb/emulator 要写 ~/.android，沙箱里 HOME 不可写会直接崩
export ANDROID_HOME=$SDK
export ANDROID_SDK_ROOT=$SDK
export ANDROID_AVD_HOME=$HOME/avd
export JAVA_OPTS="-Duser.home=$SDK/home"   # 只有 sdkmanager 需要
```

## 三条命令跑起来

```bash
# 1) Metro（另开一个终端）
export PATH="/Users/grerat/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin:$PATH"
PNPM=/Users/grerat/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.cjs
node $PNPM exec expo start --port 8081

# 2) 模拟器（窗口模式）
./scripts/emulator.sh

# 3) 把项目推进模拟器
./scripts/open-in-emulator.sh
```

截图：`$SDK/platform-tools/adb exec-out screencap -p > shot.png`

## 当初踩过的坑

1. **sdkmanager 写 `~/.android` 被拒**（`EPERM` / `NoSuchFileException`）→ 加 `JAVA_OPTS="-Duser.home=$SDK/home"`。
2. **licenses 看着已接受，其实没落盘**→ 换了 `user.home` 后要在新目录重新 `yes | sdkmanager --licenses`，否则安装包被静默跳过。
3. **`emulator: Unknown AVD name`** → emulator 只认 `$ANDROID_AVD_HOME`、`$ANDROID_SDK_HOME/avd`、`$HOME/.android/avd`，不认 `ANDROID_USER_HOME`。
4. **`adb: Cannot mkdir ~/.android` 直接 Abort trap 6** → 把 `HOME` 指到可写目录。
5. **Expo Go 下载极慢**：官方 226 MB 包在 GitHub Releases 单连接只有 15–30 KB/s。可行做法是多线程 Range 分段 + 国内镜像（如 `https://ghproxy.net/<github 原始地址>`），最后 `unzip -t` 校验再 `adb install`。

## 想换真机

手机装 Expo Go（应用商店搜「Expo Go」），同一 Wi-Fi 下扫 `expo start` 终端里的二维码即可，不需要模拟器。
