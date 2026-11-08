# 川农口袋 · 四川农业大学校园助手

一个为四川农业大学（SICAU）同学做的轻量校园 App，用一套 TypeScript 代码同时跑在 **iOS / Android / Web** 上。

产品思路参考了郑州大学的开源项目 [ZZUPocket](https://github.com/3beuml/ZZUPocket)（Kotlin + Jetpack Compose），本项目用 Expo + React Native 重写，并换成川农的作息、学期与信息架构。

## 功能

| 模块 | 说明 |
| --- | --- |
| 今天 | 聚合首页：现在上什么课、还有多久下课、今日时间轴（右上角「去课表看」直达课表）、快捷入口、专注统计 |
| 课表 | 10 节次网格（08:10 起，按官方作息）、上午/下午/晚上分组、7 天横向滚动、单双周 / 多时段 / 自定义课程、周次切换、**非本周课程灰底占位** |
| 专注 | 番茄钟（15/25/45/60 分钟）、标签、暂停/继续、今日记录、17 周热力图、连续天数 |
| 我的 | 身份绑定、校区切换、校园服务入口、设置 |
| 课表导入 | **账号登录 / 课表链接 / 网页源码** 三种方式，把教务系统的真实课表解析进本机 |
| 空闲教室 | 教务真实课表（211 间教室），按教学楼 / 时段查询，每周可重新同步 |
| 成绩查询 | 在 App 内置浏览器里登录教务系统，进到「成绩查询」后一键导入，自动算加权平均分 / 平均绩点 / 挂科数 |
| 校历 | 教务网校历原图（含作息/节假日/报到时间，可放大）+ 按开学日期推算的周历 |
| 校园服务 | 宿舍电费、校园一卡通、图书馆座位（**当前为演示数据**，电费/一卡通归「完美校园」） |
| 外观 | 浅色 / 深色 / 跟随系统，全套自绘主题 |


## 校园卡 / 电费（真实数据，v0.8.0）

学校给学生的入口是微信里的 H5：`https://yktwechat.sicau.edu.cn/home/openHomePage?openid=…`。
实测这个页面**只要带上 openid 就能直接渲染**（与 UA 无关、不需要微信 JSSDK），余额、流水、
校园卡充值、电费充值都在里面。

所以「我的 → 校园一卡通 / 宿舍电费」进的是 App 内的「校园卡」页：

1. 在微信「智慧川农 → 一卡通服务」里打开一次，点右上角「…」→「复制链接」；
2. 把整段链接粘到 App 里绑定（只需要做一次）；
3. 之后 App 内直接显示真实余额 + 学校的一卡通页面，可以直接充宿舍电费。

拿到 openid 的正确姿势（微信小程序内嵌页，复制链接不一定给）：
进「电费充值」页 → 右上角「…」→「用其他应用打开」→ 选 Safari / Chrome → 复制地址栏里 `openid=` 后面那串。

openid 只存在本机 AsyncStorage，不上传、不进日志。想解绑在页面里点「解除绑定」。

**电费房间记忆**：进「电费充值」后选一次「校区 → 楼栋 → 楼层 → 房间」，App 会把四个值记下来，
下次进这个页面自动按顺序填回去（注入 JS 依次触发 change，等上一级选项加载完再填下一级），
就不用每次点四次下拉。卡片上会显示记住的房间名。

> 顺带记一下：`elec.sicau.edu.cn`（ECMS）是后勤侧的电控系统，登录是「用户名 + 密码」的
> 本地账号（无注册/无统一身份认证入口），跟公众号是两套账号，学生通常拿不到——
> 这也是为什么走「一卡通 H5」而不是直连 ECMS 接口。

## 空闲教室（真实数据）

空闲教室用的是教务处公开的「教室课表」页面，不用登录：

1. `jshi_yk_1.asp` 是教室总表，211 间（雅安 98 / 成都 94 / 都江堰 19），带校区、容量、类型和每间教室的 `bianhao`
2. 每间教室的课表在 `kbjshi.asp?bianhao=…`，约 30KB，解析成「星期 × 节次 × 周次」
3. 按教学楼批量抓（4 并发），缓存在本机，一周内不重复抓
4. 进页面时如果教室列表超过 7 天会自动拉一次列表；教室课表点「同步本楼教室课表」再更新

实测：成都 4 教 67 间教室，一次同步约 20 秒，周五上午能算出 5 间空闲。

> 数据是教务系统里的排课结果，教室临时借用/调课可能没同步，跟教务系统本身一致。

## 成绩查询（导入式）

教务系统的成绩页每个学校模板都不一样，所以用的还是「真实页面 + 解析」这条路，不用猜接口：

1. 「我的 → 成绩查询 → 打开教务系统导入」
2. 在内置浏览器里登录（校园 VPN 或直连都行），进到「成绩查询 / 我的成绩」
3. 等成绩表格显示出来，点底部「导入这个页面」

解析是**按表头认列**的：只要表格里同时有「课程」和「成绩」两列就能认出来（老版 `xscjcx`、新版教务管理系统都支持），学分 / 绩点 / 学期列有就一起读。导入后会算：

- 加权平均分（按学分加权，只算数字成绩）
- 学分加权绩点
- 挂科门数（60 分以下）

页面上还会显示诊断信息，认不出来会告诉你「表格 N 个、表头命中了哪些列」，按提示截图发我就能适配。

## 校历

两块内容：

1. **教务网校历原图**：直接从教务处公开地址取（不用登录）`https://jiaowu.sicau.edu.cn/web/web/web/xl<学年>.png`，学年按开学日期推算（如 `xl2026-2027.png`）。图里含作息时间表、节假日、报到注册时间；点「看大图」可以放大左右拖动。网络不通时自动回退到随 App 打包的那张，并提示"没连上教务网"。
2. **按开学日期推算的周历**：每周起止日期、当周课节数、本周高亮。

**作息时间已按这张官图对齐**：第一讲 08:10–08:55 / 09:05–09:50，第二讲 10:10–10:55 / 11:05–11:50，第三讲 14:20–15:05 / 15:15–16:00，第四讲 16:20–17:05 / 17:15–18:00，第五讲 19:30–20:15 / 20:25–21:10（共 10 节，`lib/periods.ts`）。

## 完美校园（电费 / 一卡通）

川农的宿舍电费充值和一卡通余额都在**完美校园**（新开普）里。这两块我们**没有接入**，原因写清楚，免得以后重复踩：

| 尝试 | 结果 |
| --- | --- |
| 直接调接口 | `api.17wanxiao.com` 公网不可访问（两个 A 记录 443 全超时）；App 实际用的 `app.17wanxiao.com` / `app.59wanmei.com` 可达但无公开文档 |
| 抓包逆向 | App 带加固，检测到系统代理或自签证书就弹「安全环境未配置成功」，请求在本地被拦，一条都没发出去（安卓模拟器、iPhone 真机都是这个报错） |
| 借微信「智慧川农」里的一卡通 | 那个页面走微信私有加密通道，只抓到 `szextshort.weixin.qq.com/mmtls` 这类混淆流量 |

所以电费、一卡通两页展示的是**演示数据**，页面上有明确说明和「去完美校园查看」的入口（`我的 → 宿舍电费 / 校园一卡通`）。
要是哪天学校开放了一卡通查询页、或者你拿到了接口说明，把它补进 `docs/sicau-api.md` 的 6.2 节就能接。

## 截图

在 Android 模拟器（Pixel 6 / Android 15，1080×2400）里跑起来的实机截图：

| 今天 | 课表 | 专注 | 我的 |
| --- | --- | --- | --- |
| ![今天](docs/screenshots/today.png) | ![课表](docs/screenshots/schedule.png) | ![专注](docs/screenshots/focus.png) | ![我的](docs/screenshots/me.png) |

深色模式：

| 今天 | 课表 |
| --- | --- |
| ![深色今天](docs/screenshots/dark-today.png) | ![深色课表](docs/screenshots/dark-schedule.png) |

校区与导入：

| 导入课表（单入口） | 校区与专业 | 空闲教室（教务真实数据） |
| --- | --- | --- |
| ![导入课表](docs/screenshots/import-simple.png) | ![校区与专业](docs/screenshots/settings-campus.png) | ![空闲教室](docs/screenshots/classroom-real.png) |

| 我的（按专业显示校区） | 电费接完美校园的说明 |
| --- | --- |
| ![我的](docs/screenshots/me-profile.png) | ![电费](docs/screenshots/electricity-perfectcampus.png) |

导入真实课表：

| 成绩查询（空态） | 导入成绩（内置浏览器） | 校历（含教务网原图） |
| --- | --- | --- |
| ![成绩查询](docs/screenshots/grades-empty.png) | ![导入成绩](docs/screenshots/grade-import.png) | ![校历](docs/screenshots/calendar.png) |

| 校区与专业（按专业提醒改校区） |
| --- |
| ![校区提醒](docs/screenshots/settings-campus-hint.png) |

| 解析预览 | 导入完成 | 导入后的课表 |
| --- | --- | --- |
| ![解析预览](docs/screenshots/import-parse.png) | ![导入完成](docs/screenshots/import-done.png) | ![导入后的课表](docs/screenshots/schedule-imported.png) |

## 技术栈

- Expo SDK 58 / React Native 0.88 / React 19
- expo-router（文件路由 + 原生 Stack / Tabs）
- TypeScript 严格模式
- AsyncStorage 本地持久化（无后端）
- react-native-svg（专注环）、expo-linear-gradient（渐变卡片）

## 目录结构

```
app/                    页面（expo-router）
  (tabs)/               底部四个 tab：今天 / 课表 / 专注 / 我的
  course/[id].tsx       课程详情（modal）
  course/edit.tsx       新增 / 编辑课程（modal）
  campus/[kind].tsx     电费 / 一卡通 / 图书馆 / 空教室
  settings.tsx          外观、学期、数据管理
  login.tsx             身份绑定（演示模式）
  about.tsx             关于
components/             UI 套件、悬浮 TabBar、热力图
constants/theme.ts      亮/暗主题、课程色板、间距
lib/                    纯逻辑：课表、日期、节次、番茄钟、统计、演示数据
docs/sicau-api.md       川农各系统接入说明
```


## 界面：玻璃卡片与渐变背景

v0.7.0 起整套 UI 换成「半透明玻璃卡片 + 渐变背景」的风格：

- **玻璃材质**：`components/Glass.tsx` 的 `GlassSurface` —— 模糊层（`expo-blur`）+ 半透明染色 + 顶部镜面高光 + 1px 亮边 + 柔和投影，四层叠出来。卡片、快捷入口、设置列表、悬浮 tab bar 都是这一套。
- **渐变背景**：`components/AppBackground.tsx`，浅色 `#F8FCF9 → #EFF6F0 → #E4EFE7`，深色 `#101815 → #0C1310 → #070B09`；页面滚动时玻璃卡片会透出底下的渐变。
- **校徽水印**：同一个组件里水平垂直居中铺一枚极淡的川农校徽（浅色 9%、深色 7% 不透明度），素材从教务处校历图上裁出来做了透明处理，存在 `assets/images/emblem-green.png` / `emblem-white.png`。
- **主按钮**：绿到深绿的渐变胶囊 + 上半部白色高光，按压有轻微缩放。
- **tab bar**：`borderRadius: 30` 的悬浮胶囊，选中项是一枚带亮边的浅色药丸。

> 安卓上 `expo-blur` 是近似模糊（真实高斯模糊只有 iOS 有），所以安卓的玻璃会略实一点，保证文字可读。



## 已经打好包的 APK

`../sicau-pocket-0.7.2.apk`（102MB，`io.github.grerat666708.sicaupocket`，versionCode 1）——
已在 Android 模拟器里装上并跑通，装到手机上就是独立 App，不需要 Expo Go。

体积偏大是因为**三个 ABI 都打进去了、且关了 R8 压缩**。要小一点可以：

- 只留 arm64：`gradle :app:assembleRelease -PreactNativeArchitectures=arm64-v8a`
- 或者修好 R8（expo-modules 58 的 `LazyKType` 缺失问题）后再开 `android.enableMinifyInReleaseBuilds=true`

## 本地构建（不用 Expo 账号）

```bash
./scripts/build-apk-local.sh      # 约 5–10 分钟（首次要下 ~2GB 依赖）
```

依赖已经装好在仓库外一层：`tools/node`（Node 26）、`tools/jdk17`（Corretto 17）、
`tools/gradle-9.4.1`、`android-sdk`（platform 37 / build-tools 36 / NDK 27.1 / CMake 3.22.1）。

脚本会自动做几件这台机器特有的事：

| 问题 | 处理 |
|---|---|
| `dl.google.com` 只有几 KB/s | Gradle 仓库换成阿里云镜像（google / central / gradle-plugin） |
| 没有 build-tools 37（AGP 9 默认要） | `init.d/bt36.gradle` 把 `buildToolsVersion` 钉到 36.0.0 |
| AGP 要写 `~/.android` 但被沙箱拒 | `HOME` / `ANDROID_USER_HOME` 指向工作区内可写目录 |
| R8 报 `Missing class expo.modules.kotlin.types.LazyKType` | 关掉 `android.enableMinifyInReleaseBuilds`（先出包，后续再修） |
| Gradle 9.4.1 需要 JDK 17 | `JAVA_HOME=tools/jdk17/Contents/Home` |


### R8 压缩（v0.7.3 起默认开）

`android/gradle.properties` 里 `android.enableMinifyInReleaseBuilds=true` + `enableShrinkResourcesInReleaseBuilds=true`，
`app/proguard-rules.pro` 里 keep 住 `expo.modules.**`。体积对比（arm64 单 ABI）：

| 配置 | 体积 |
| --- | --- |
| 全 ABI + 不压缩 | 102MB |
| 全 ABI + R8 | 96MB |
| arm64 + 不压缩 | 39MB |
| **arm64 + R8** | **33MB** |

踩过的坑：R8 包能编出来，但一启动就 `NoClassDefFoundError: expo.modules.kotlin.types.LazyKType`。
根因不是 keep 规则，而是 **expo 系包的版本没跟 SDK 58 对齐** —— `expo-linear-gradient`、`expo-haptics`
装成了 `15.0.8`（旧命名），SDK 58 要求 `~58.0.3` / `~58.0.7`。用 `npx expo install --fix`
（或按 `node_modules/expo/bundledNativeModules.json` 手动对齐）之后 R8 就正常了。
`scripts/build-apk-local.sh` 里已经加了版本自检，不一致会直接提示。

## 打包成能直接装的 APK（EAS 云构建）

不用装 Android Studio，也不需要本地 JDK/Gradle，用 Expo 的云构建：

```bash
# 1. 注册并登录 Expo 账号（免费）
npx eas-cli@latest login

# 2. 首次在项目里初始化（会读 app.json / eas.json，生成 projectId）
npx eas-cli@latest build:configure

# 3. 出 APK（preview profile 配的 buildType: apk）
npx eas-cli@latest build -p android --profile preview
```

构建完会打印一个 `.apk` 下载链接，手机上下载直接安装（需要在系统里允许"安装未知来源应用"）。

不想记命令的话，直接跑仓库里的脚本：

```bash
./scripts/build-apk.sh          # preview → APK
./scripts/build-apk.sh --ios    # iOS
./scripts/build-apk.sh --local  # 本机构建（需 SDK + JDK 17）
```

几个注意点：

- **包名先换成自己的**：`app.json` 里 `android.package` / `ios.bundleIdentifier` 现在是 `com.sicau.pocket`，用的是学校域名，商店审核有风险。改成你自己的反写域名，最省事的是用 GitHub：
  ```json
  "android": { "package": "io.github.你的GitHub用户名.sicaupocket" },
  "ios": { "bundleIdentifier": "io.github.你的GitHub用户名.sicaupocket" }
  ```
  包名一旦发布就不能改，定之前想清楚。
- **版本号自动递增**：`eas.json` 里 `preview` / `production` 都开了 `autoIncrement: true`，`appVersionSource: remote` 由 EAS 托管 —— 每构建一次 `versionCode`（Android）和 `buildNumber`（iOS）自动 +1，不用手动改；`version`（对用户显示的 0.7.x）还是手动改 `app.json`。
- **免费额度**：Expo 免费账号每月有几次 Android 构建，排队时间视情况 5–30 分钟。
- **本地构建（可选）**：`npx eas-cli@latest build -p android --profile preview --local` 需要本机有 Android SDK + JDK 17；没有的话就用云构建。
- **iOS**：`npx eas-cli@latest build -p ios --profile preview` 需要 Apple 开发者账号（$99/年）才能装到真机，或者只做模拟器包。

### 自己的 GitHub 主页链接在哪

1. 登录 GitHub，右上角头像 → **Your profile**，地址栏就是 `https://github.com/你的用户名`。
2. 或者直接访问 `https://github.com/settings/profile`，页面右上角会显示 `Your personal account` 那一栏的链接。
3. 命令行也能看：`git config --get user.name`（不一定是用户名），更稳的是 `gh api user -q .login`（装了 GitHub CLI 的话）。

本项目已经按 `https://github.com/GRERAT666708` 设好：包名 `io.github.grerat666708.sicaupocket`（GitHub 用户名大小写不敏感，但 Android 包名只能小写）。

## 本地运行

> Node 已经装好（`tools/node`，v26.13.0 + npm 11 + eas-cli 27.5），并已写进 `~/.zshrc` 的 PATH，新开终端直接能用 `node` / `npx` / `eas`。

> **只想赶快跑起来？** 在项目根目录执行一条命令（开模拟器 + Metro + 打开 App 全包了）：
>
> ```bash
> ./scripts/dev.sh          # 带窗口的模拟器；--headless 无窗口；--clear 清 Metro 缓存
> ./scripts/stop-dev.sh     # 关掉模拟器和 Metro
> ```
>
> 第一次启动约 40 秒，之后热更新会自动生效，改代码不用重启。

本机没有全局 Node 时，使用 DSH 自带运行时：

```bash
export PATH="/Users/grerat/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin:$PATH"
cd sicau-pocket
PNPM=/Users/grerat/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.cjs
node $PNPM install
node $PNPM exec expo start    # 扫码用 Expo Go 打开，或按 w 打开网页预览
```

其他常用命令：

```bash
node $PNPM typecheck      # tsc --noEmit
node $PNPM exec expo start --web        # 只开 Web 预览
node $PNPM exec expo export -p web      # 导出静态 Web 版到 dist/
```

> 没有全局 npm 的环境里，把 `npx expo …` 换成 `node <pnpm.cjs 路径> exec expo …`；
> Expo CLI 会写 `~/.expo`，如果该目录不可写，用 `HOME=$PWD/.home` 前置重定向。

## 在安卓模拟器里运行

本机没有安装 Android Studio，用的是命令行 Android SDK + AVD（Pixel 6 / Android 15）。完整环境清单和踩坑记录见 [docs/android-setup.md](docs/android-setup.md)，跑起来只要两条命令：

```bash
./scripts/dev.sh               # 一条命令：起模拟器 → 等开机 → 起 Metro → 端口反代 → 打开 App
./scripts/stop-dev.sh          # 全部关掉
```

`dev.sh` 还带两个兜底：冷启动时 Expo Go 偶尔抢跑报 `runtime not ready`，脚本会自动重开一次；
Metro 已经在跑时直接复用（`--no-metro` 可强制跳过启动）。

手动分步的话：

```bash
./scripts/emulator.sh          # 启动模拟器（加 --headless 则无窗口）
./scripts/open-in-emulator.sh  # 把 Metro 端口映射进去并用 Expo Go 打开
```

等价的手写命令：

```bash
SDK=/path/to/android-sdk
export HOME="$PWD/android-user"                 # adb / emulator 需要可写的 HOME
export ANDROID_AVD_HOME="$HOME/avd"

$SDK/emulator/emulator -avd sicau -no-audio -no-boot-anim -gpu swiftshader_indirect &
$SDK/platform-tools/adb reverse tcp:8081 tcp:8081
$SDK/platform-tools/adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081"
$SDK/platform-tools/adb exec-out screencap -p > shot.png
```

## 怎么生成能安装的 APK / IPA

**路线 A：EAS 云构建（推荐，不用配置本机 Android 环境）**

```bash
npm i -g eas-cli          # 需要本机有 Node.js（LTS 即可）
eas login                 # 免费注册 expo.dev 账号
eas build -p android --profile preview     # 云端构建，产出可直接安装的 APK
eas build -p ios --profile preview         # 产出 iOS 内测包（需 Apple 开发者账号 $99/年）
eas build -p android --profile production  # AAB，用于 Google Play 上架
eas build -p ios --profile production      # IPA，用于 App Store 上架
```

**路线 B：本地构建（需要 JDK 17 + Android SDK + 能访问 Maven 仓库）**

```bash
npx expo prebuild -p android          # 生成原生 android/ 工程
cd android
./gradlew assembleRelease             # 产物：android/app/build/outputs/apk/release/app-release.apk
# 调试包：./gradlew assembleDebug → app/build/outputs/apk/debug/app-debug.apk
```

首次构建会自动下载 Gradle 与依赖（数百 MB），国内网络建议挂代理或配置阿里云 Maven 镜像。

**路线 C：开发构建（要自己写原生模块时用）**

```bash
npx expo install expo-dev-client
eas build -p android --profile development   # 产出 dev 客户端，之后改 JS 不用重新打包
```

`eas.json` 已配置 development / preview / production 三套 profile；`app.json` 里包名是 `com.sicau.pocket`，**上架前请改成你自己拥有的域名反写**（见下方「关于包名和域名」）。

## 关于包名和域名

Android 的 `applicationId` 和 iOS 的 `bundleIdentifier` 采用「反写域名」的约定，例如 `com.sicau.pocket`。它的作用是：

- 手机和应用商店用它唯一标识你的 App；
- 域名所有者才能发出这种包名的应用（Google Play / App Store 会核对域名归属，收到投诉可能下架）。

所以：

- **不需要真的买域名**。如果你没有 `sicau.edu.cn` 的授权，用 `com.sicau.pocket` 属于占用学校域名，有被下架的风险。
- 只要把包名换成「反写后仍然唯一、且你能自证」的字符串即可，例如：
  - `io.github.你的GitHub用户名.sicaupocket`（你有这个 GitHub 账号就成立，商店也认）
  - `com.你的名字.sicaupocket`
- 只改 `app.json` 里的 `ios.bundleIdentifier` / `android.package`，重新构建即可，代码不用动。
- 包名一旦上架就不能再改（等于换了新 App），所以第一次发布前定好。

## 导入真实课表

「我的 → 教务课表导入」现在只剩一条路径（`app/web-import.tsx`）：**在 App 里打开真实的教务网，自己登录，停在课表页，点「导入这个页面」**。

为什么不自动登：教务系统的登录方式（密码 / 短信 / 扫码 / 统一身份认证）经常变，而内嵌一个真实浏览器就永远不会过时——学校改版、加验证码、加扫码都不影响导入，密码也只在你面前那个网页里输入。

解析完先给预览（课程名、教师、时段、周次），确认后再覆盖导入；教室借用/活动登记会被自动识别并跳过。

### 校区与专业

首页右上角的「XX 校区」不再是写死的雅安，来源有三个，按优先级：

1. **按课表识别**：学生课表的单元格里写着「成都校区：4-B608」这类前缀，导入时数一下哪个校区出现得最多，自动写进去（`detectCampus()`）；
2. **按专业推断**：「设置 → 校区与专业」里填专业或学院名，按官网「专业设置」表推断（`lib/major.ts`）——
   动物医学 / 动物科学 / 农学 / 林学 / 风景园林 / 经济管理 → **成都**；
   计算机 / 食品 / 水利水电 / 生命科学 / 法学 / 体育 / 艺术 → **雅安**；
   土木 / 建筑 / 商旅（会计、旅游、市营…） → **都江堰**；
3. **手动改**：设置页三个校区按钮，随时覆盖。

改校区会同时切换「空闲教室」的教学楼列表和「图书馆座位」的区域名，两个页面默认跟着你所在校区走。

### 两条通道：校园 VPN / 直连

页面底部有「校园 VPN」「直连教务网」两个开关，默认走 VPN：

- **校园 VPN**：`https://webvpn.sicau.edu.cn/`（网瑞达 wengine）。打开后先跳「川农e认证」登录，
  登录完在门户里点「教务系统」（App 底部也有「进入教务系统」按钮帮你点），
  之后访问的是 `https://webvpn.sicau.edu.cn/https/77726476706e69737468656265737421…/` 这样的代理地址。
  **不在校园网也能用**，出门在外也能导课表。
- **直连教务网**：`https://jiaowu.sicau.edu.cn/`，校园网内最快，登录页和以前一样。
- 两条通道的登录状态分别记住，切换通道不会混用 Cookie。

### 登录状态会被记住

- 会话 Cookie 由系统 WebView 自己持久化（Android Chromium cookie store / iOS `WKWebsiteDataStore`），
  HttpOnly 的 `ASPSESSIONID*` 也在里面，所以关掉 App 再打开不用重新登录。
- 另外把可读的 `document.cookie`、最后停留的课表网址存到 AsyncStorage（`lib/webSession.ts`），
  下次进来先回填，并**直接回到上次那张课表页**。
- 实测：杀掉进程重开，`ASPSESSIONID…` 一模一样，页面直接落在上次的教室课表。
- 想换账号：底部「退出登录」会去点教务页面里的「退出/注销」链接（真登出），
  「清除记住的会话」只清本机记录。

![在 App 里登录教务网](docs/screenshots/web-login.png)
![走川农e认证](docs/screenshots/web-sso.png)
![识别到课表并解析](docs/screenshots/web-detect.png)

实现细节（GB2312 解码与表单编码、不闭合标签、单元格格式、登录校验、教务要求 `lb=S` 的学生身份）都在
[`docs/sicau-api.md`](docs/sicau-api.md)。

## 数据说明

首次安装会写入一份示例课表（动物医学专业 8 门课），可在「设置 → 导入示例课表」恢复。课表导入会用真实教务数据覆盖本地课表。

电费 / 一卡通 / 图书馆 / 空教室仍是本地生成的演示数据；登录页为「演示模式」，只把学号与姓名写进本机存储。课表导入时的教务密码只在当次请求里使用，不持久化、不写日志。

真实接入需要完成 `docs/sicau-api.md` 里的步骤：CAS 登录拿票据 → 请求教务课表 → 请求一卡通 / 后勤接口。请遵守学校信息系统管理规定，不要高频请求。

## 路线图

- [x] WebView 内打开教务网登录并一键导入课表（川农e认证在 WebView 里正常）
- [x] 记住 WebView 会话与上次的课表页，免重复登录
- [x] 教务课表导入（账号 / 链接 / 源码三种方式，解析正方 ASP 网格课表）
- [ ] 桌面小组件（Android AppWidget / iOS WidgetKit）
- [ ] 上课提醒与静音（本地通知）
- [x] 成绩查询（导入式）
- [x] 校历（按开学日期推算）
- [ ] 考试安排
- [ ] 深色模式细节打磨、无障碍标签

## 免责声明

个人学习作品，与四川农业大学官方无关。示例课程、成绩与消费数据均为虚构，仅用于界面演示。
