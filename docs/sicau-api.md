# 四川农业大学系统接入说明

> 目标：把 demo 数据换成真实的川农数据。课表这块已经做了第一版（见第 4 节），电费 / 一卡通 / 图书馆仍是 demo。
>
> ⚠️ 本文档是**实测笔记**，不是官方接口文档。学校随时可能改版；请遵守《四川农业大学校园网与信息系统管理办法》，控制请求频率，不要存储他人账号密码。

## 1. 现状

| 能力 | 当前实现 | 位置 |
| --- | --- | --- |
| 课表（手动） | 增删改、多时段、周次 | `app/course/edit.tsx` |
| 课表（导入） | **账号登录 / 课表链接 / 网页源码** 三种方式 | `app/import.tsx`、`lib/jiaowu.ts` |
| 课表解析 | 正方 ASP 网格表 → 结构化课程，自动忽略「借用教室」记录 | `lib/timetable.ts` |
| 电费 | 14 天随机用量、余额 | `lib/campus.ts` `demoElectricity()` |
| 一卡通 | 余额、6 笔流水 | `lib/campus.ts` `demoEcard()` |
| 空教室 | 4 栋楼 16 间房，按节次随机占用 | `lib/campus.ts` `demoClassrooms()` |
| 图书馆座位 | 4 个区域空位数 | `lib/campus.ts` `demoSeats()` |
| 登录页 | 演示绑定学号姓名（不校验密码） | `app/login.tsx` |

## 2. 学校系统入口（2026-11 实测）

| 系统 | 地址 | 实测情况 |
| --- | --- | --- |
| 川农e认证 | `https://auth.sicau.edu.cn` | 302 → `/sso/login` → 落到 `https://auth.sicau.edu.cn/wui/#/?appid=ywtb`，是个 Vue SPA，登录走内部 JSON 接口，**未接** |
| 教务处 | `https://jiaowu.sicau.edu.cn` | 302 → `/web/web/web/index.asp`；GB2312 编码的老版正方 ASP，**有可用的本地账号密码表单** |
| 图书馆 | `https://lib.sicau.edu.cn` | OPAC，未细看 |
| 学校主页 | `https://www.sicau.edu.cn` | 校历、通知 |
| 一卡通 / 后勤缴费 | 未确认 | 常见形态是微信小程序 |

## 2.1 校园 WebVPN（校外访问的关键）

`https://webvpn.sicau.edu.cn/` 是网瑞达 wengine WebVPN，**不在校园网也能用**：

```
GET https://webvpn.sicau.edu.cn/            → 302 /login
GET /login                                  → 302 /https/77726476706e69737468656265737421f1e2…/sso/login?appid=…&service=…
                                            → 「川农e认证」登录页（Vue SPA）
登录成功后                                  → VPN 门户，里面点「教务系统」
                                            → https://webvpn.sicau.edu.cn/https/77726476706e69737468656265737421<加密host>/web/web/web/index.asp
```

要点：

- 前缀 `77726476706e69737468656265737421` 是 ASCII 的 `wrdvpnisthebest!`，后面那段是 wengine 把目标域名加密后的十六进制。
  **不要去自己拼这段加密串**：登录后在门户里点链接（或者注入 JS 点「教务」链接）最稳，学校换版本也不会挂。
- 会话 Cookie 形如 `wengine_vpn_ticketwebvpn_sicau_edu_cn=…`（HttpOnly、Secure、Domain=webvpn.sicau.edu.cn）。
- 代理出来的页面 DOM 与直连一致（表格、字符集仍是 GB2312），所以课表解析代码无需改动。
- App 里「校园 VPN / 直连教务网」两个通道各自记 Cookie，互不干扰。

## 3. 教务系统登录（实测）

登录页：`https://jiaowu.sicau.edu.cn/web/web/web/index.asp`（GB2312）

```html
<form name="form1" action="../../../../jiaoshi/bangong/check.asp" method="post">
  <input name="user" ...>          <!-- 学号 / 工号 -->
  <input name="pwd"  type="password">
  <input type="radio" name="lb" value="S">  <!-- S=学生 T=教师 -->
  <input type="hidden" name="sign"     value="…32位hex…">
  <input type="hidden" name="hour_key" value="…一长串数字…">
</form>
```

要做的三步：

1. `GET index.asp`，从 HTML 里抠出 `sign` 与 `hour_key`（每次请求都可能变）。
2. `POST https://jiaowu.sicau.edu.cn/jiaoshi/bangong/check.asp`，`Content-Type: application/x-www-form-urlencoded`，字段 `user / pwd / lb / sign / hour_key`。
   - `lb` 是**登录身份**，学生必须 `S`（教师 `T`）；不带或带错会回 `登录类别错误，请重新登录！`
   - `pwd` 必须按 **GB2312 百分号编码**发送。老 ASP 站点的代码页是 GB2312，按 UTF-8 发（比如密码里有全角「！」`%EF%BC%81`）会被解成乱码，
     服务端于是回一句摸不着头脑的 `登录类别错误`，而不是「密码错误」。改成 `%A3%A1` 之后就正常了（`lib/gb2312.ts` 的 `encodeGb2312Form`）。
3. **必须回 `https://jiaowu.sicau.edu.cn/jiaoshi/bangong/index.asp` 验证登录态**：密码错时 `check.asp` 也可能返回 200（实测只有 98 字节），页面里带 `pwd` 输入框说明还停在登录页。
4. 服务端的报错都在 `alert('…')` 里，把这句话原样显示给用户最有用。

**实测（2026-11-05，测试账号（学号已隐去））**：

```
POST check.asp（lb=S，pwd 用 GB2312 编码）
→ 200，`alert('该账号必须采用扫码或统一身份认证方式登录！')`
```

当时教务站内登录被拦下；后来确认这条提示是**当天教务网本身故障/策略临时收紧**导致的，
修好之后站内密码登录仍然可用（同学反馈过）。所以：

- 「账号直连」这条路径保留，登录失败时把服务端原话显示出来，别急着断定是账号类型问题。
- 「在 App 内嵌浏览器里登录 + 导入当前页面」依旧是推荐路径：真实浏览器能跑完密码登录、SSO、验证码、扫码全套流程，
  而且登录态会被记住（见 3.1）。

统一身份认证入口：`/jiaoshi/aspsso/caslogin.asp` → `https://auth.sicau.edu.cn/wui/#/?appid=b54a2f27-f7ba-4b91-bbf0-3b…`（Vue SPA，
有「短信登录 / 密码登录」两个 tab + 图形验证码）。在 App 的 WebView 里能正常打开和登录，实测停在 SSO 登录页。

Cookie 处理：RN 的 `fetch` 不会自动保存 Cookie，`lib/jiaowu.ts` 里自带了一个极简 cookie jar（解析 `set-cookie`，后续请求手动带 `Cookie` 头）。

### 3.1 会话留存（WebView 方案）

App 用内嵌 WebView 打开教务网，登录态就是这本 Cookie。两层保障：

1. **平台层（主要）**：WebView 的 Cookie 存储本来就是落盘的——Android 走 Chromium 的 cookie store，
   iOS 走 `WKWebsiteDataStore`。`ASPSESSIONID*` 这类会话 Cookie 即使 HttpOnly 也在里面。
   实测：`adb shell am force-stop host.exp.exponent` 后重开，`document.cookie` 里的
   `ASPSESSIONIDQGRSQAQQ=…` 与重启前完全一致。
2. **应用层（补刀）**：`lib/webSession.ts` 把可读的 `document.cookie`、最后一张课表页的 URL、
   是否已登录写进 AsyncStorage（键 `@sicau-pocket/websession/v1`）。下次打开时用
   `injectedJavaScriptBeforeContentLoaded` 在页面脚本跑之前回填这些 Cookie，并直接导航到上次的课表页。
   HttpOnly 的部分它拿不到，但平台层已经保证。

退出：注入 JS 找 `a` 标签里文本是「退出 / 注销 / 安全退出」的链接并 `click()`，走服务端真登出；
找不到就提示刷新。`clearWebSession()` 只清本机记录，不动平台 Cookie。

## 4. 课表页面与解析

### 4.1 页面

- 公开的教室课表（不需要登录，可用来验证解析器）：
  教室列表 `https://jiaowu.sicau.edu.cn/web/web/js_kb_cha/jshi_yk.asp`
  单个教室 `https://jiaowu.sicau.edu.cn/web/web/js_kb_cha/kbjshi.asp?bianhao=<token>`
  （`bianhao` 是 48 位纯数字 token，从教室列表的「查看课表」链接里取）
- 学生个人课表：需要登录后从个人主页找，链接文案含「课表」。`lib/jiaowu.ts` 的 `fetchTimetableAfterLogin()` 会自动扫首页里所有含 `课表/kb/kbcx` 的链接逐个尝试。

### 4.2 单元格格式（实测）

```html
<td>思想道德与法治405202609010202<br>唐刚(2)<br>
    <font color=black>5-14</font> 周<br>174人<br>通识必修<br>&nbsp;</td>
```

拆成文本行后：

| 行 | 内容 | 用途 |
| --- | --- | --- |
| 1 | `思想道德与法治405202609010202` | 课程名 + 课程号（尾部 8 位以上数字/下划线是课程号，需要切掉） |
| 2+ | `唐刚(2)` ⬅ 教师（括号里是教学班/周学时，丢掉） | `Course.teacher` |
| n | `5-14 周`（可能被 `<font>` 切成两行） | 周次 → `CourseSlot.weeks` |
| n+1 | `174人` | 丢弃 |
| n+2 | `通识必修` | 丢弃（课程性质） |

行列结构：`上午/下午/晚上` 列（rowspan）+ `12 节` / `34 节` 这样的节次列 + 周一…周日 7 列。节次文本按 `12`/`34`/`910`/`1112` 解析成起止节次。

**注意**：这套 ASP 页面**经常不闭合标签**（实测一页里 3 个 `<table>` 只有 1 个 `</table>`，16 个 `<td>` 只有 14 个 `</td>`），所以 `lib/html.ts` 全部按「开标签切段」处理，不能用 `[\s\S]*?</table>`。

### 4.3 编码

页面是 GB2312，而 Hermes 上 `new TextDecoder('gb2312')` 不可用（实测拿到乱码）。因此 `lib/gb2312.ts` 自带一张 94×94 映射表（`lib/gb2312-table.ts`，由 Python `codecs` 生成），纯 JS 解码。

### 4.4 解析产物

`lib/timetable.ts` 导出：

- `parseWeeksText('5-14')` / `'1-8,10-12周(单)'` / `'第3-15周'` → `number[]`
- `parseTimetableHtml(html)` → `ParsedSlot[]`（含 `booking` 标记：没有课程号且带「借用教室」的记成教室借用，不导进课表）
- `groupParsedSlots()` / `toCourses()` → `Course[]`（`lib/types.ts`）

## 5. 一卡通 / 电费 / 图书馆

这三类系统没有公开接口，通常需要：

1. 抓包确认域名、登录态（Cookie 或 token）与参数；
2. 确认学校信息中心是否提供开放接口；
3. 只能抓包时务必降频（建议 ≥ 5 分钟一次并缓存）。

`lib/campus.ts` 的函数签名（`demoElectricity` / `demoEcard` / `demoClassrooms` / `demoSeats`）就是为替换准备的：保持返回类型不变即可。

## 6. 落地清单

- [x] 教务系统本地表单登录（`sign` / `hour_key` + Cookie jar + 登录态校验）
- [x] 课表 HTML 解析（GB2312、不闭合标签、rowspan/colspan、周次、借用教室过滤）
- [x] 三种导入方式 + 预览 + 覆盖导入（`app/import.tsx`）
- [ ] 用真实学生账号确认「个人课表」页面 URL（目前自动扫链接，未实测成功路径）
- [ ] 接统一身份认证 SSO（`auth.sicau.edu.cn/wui` 的 JSON 登录接口）
- [ ] 讲台/教室占用接真实数据（公开的 `kbjshi.asp` 已经能抓，可做「空教室」真数据）
- [ ] 一卡通 / 电费 / 图书馆接口替换 demo
- [ ] 全部请求加超时、失败提示与本地缓存（弱网可用）

## 7. 安全与合规

- **不要**在客户端硬编码学校内部密钥；本项目无自建后端，请求由用户设备直接发往学校系统。
- 学号密码只在单次登录请求里用，不写日志、不落盘（`app/import.tsx` 里密码不持久化）。
- **不要**把 CAS 票据或 Cookie 上传到第三方服务器。
- 仅用于查询自己的数据；批量爬取、代查他人数据违反学校规定。
- 上架应用商店时，隐私政策里要写清「数据只保存在本机」。

## 6.1 教室课表（空闲教室的真实数据源）

公开页面，不需要登录，GB2312 编码：

- 教室总表：`GET https://jiaowu.sicau.edu.cn/web/web/js_kb_cha/jshi_yk_1.asp`
  → 302 到 `jshi_yk.asp?test=<一长串>`（一定要跟随跳转）→ 约 130KB
  表格列：`序号 | 校区 | 教室 | 容量 | 类型 | 查看课表`，最后一列 `<a href=kbjshi.asp?bianhao=<40 位数字>>`
  共 211 间：雅安 98、成都 94、都江堰 19
- 单间教室课表：`GET https://jiaowu.sicau.edu.cn/web/web/js_kb_cha/kbjshi.asp?bianhao=<d>`（约 30KB）
  版式与公开教室课表一致，`lib/timetable.ts` 的 `parseTimetableAny` 直接能解析
- 不带 `bianhao` 或 ticket 过期时返回 500（HTML 错误页），需要重新走一次总表

已在 `lib/classroom.ts` 落地：`syncCatalog()` 拉总表、`syncBuilding()` 按教学楼 4 并发抓每间、
按 `bianhao` 缓存在 AsyncStorage（`@sicau-pocket/classroom/v1`），7 天有效期。

## 6.2 完美校园（宿舍电费 / 一卡通）

川农这两个功能在完美校园（新开普）里。**结论：当前接不了**，三条路都验证过（2026-11-06）：

### 接口

- `api.17wanxiao.com`：两个 A 记录 `47.97.100.248`、`120.27.220.115`，443 连接全部超时（开发机 + 模拟器 `nc` 都超时）。
- `app.17wanxiao.com` / `app.59wanmei.com`：**可达**（HTTPS 200），是 App 真正读数据用的域名，但没有公开文档。
- `gainDomain` 引导接口（`http://{120.26.154.238,114.55.205.242,121.199.195.240,121.40.9.157}/campus/cam_iface46/gainDomain.action`）：全部 503/504。
- `h5.17wanxiao.com` 500、`m.17wanxiao.com` 返回 98 字节空页、`www.17wanxiao.com` 只有官网。

### 抓包（不可行）

App 5.8.36 带 360 加固（`libjiagu_vip_64.so` 等），一旦检测到系统 HTTP 代理或自签根证书，登录按钮直接弹
「安全环境未配置成功，请稍后再试」，**请求在本地就被拦下**，抓包侧一条记录都没有。安卓模拟器（root/未 root 都试过）与
iOS 真机（Wi-Fi 代理 + 已信任根证书）表现一致。

### 微信侧（不可行）

「智慧川农」小程序里的 `https://yktwechat.sicau.edu.cn/home/openHomePage` 是新开普给学校做的微信端 H5（引
`wanxiao-js-api.js`、`whistle-6.0.3.js`），必须由微信 OAuth 换取登录态，浏览器直接打开返回
「页面错误 / 失败原因：认证错误」。在微信里打开时，所有请求走微信私有加密通道，代理只能看到
`szextshort.weixin.qq.com/mmtls/*` 这类混淆流量。

### 如果以后要接

1. 学校提供公开的一卡通查询页（像教务处的教室课表那样免登录可读）；
2. 完美校园开放接口文档，或学校信息中心给出正式授权；
3. 拿到接口说明（URL + 请求头 + 返回样例）后，按 6.1 的写法加一个 `lib/ecard.ts`，页面从演示数据切到真实数据。

## 7. 成绩查询（已实现，导入式）

老版正方 `xscjcx.asp`、新版教务管理系统都支持，做法和课表一致：内置浏览器里登录 → 进到成绩页 → 注入脚本把 `document.documentElement.outerHTML`（含同源 iframe）传回来 → `lib/grades.ts` 解析。

**解析规则（按表头认列）**

- 遍历页面所有 `<table>`（`lib/html.ts` 的 `extractTables` / `parseTable`，已处理 rowspan/colspan）
- 找表头同时含「课程」与「成绩」的表；列定位按关键字：`课程名称|课程|科目`、`学分`、`成绩|总成绩`、`绩点`、`学期|学年`、`性质|类别`、`考核|考试`
- 数据行：课程名非空且不是表头/合计行；成绩支持数字、`优/良/中/及格/不及格`、`通过`
- 汇总：加权平均分（只算数字成绩）、学分加权绩点、60 分以下门数

**排查**：认不出来时 `parseGrades` 会返回诊断串（`表格 N 个，表头命中：…`），让用户截图即可按页面适配。

## 8. 校历图片（公开，不用登录）

- 首页左上角「【校历】」链接指向 `https://jiaowu.sicau.edu.cn/web/web/web/xl2026-2027.png`（PNG，1275×899，约 520KB）
- 规律：`xl<起始年>-<结束年>.png`，起始年按开学日期推算（8 月及以后取当年）
- 图内含：**行课作息时间表**（第一讲～第五讲共 10 节的具体时间）、行政作息、全年周次/节气/节假日、报到注册与开学行课日期
- App 里：校历页顶部直接显示该图（失败回退到打包版本 `assets/images/xiaoli-2026-2027.png`），点「看大图」放大
- 顺带对齐：`lib/periods.ts` 的 10 节时间即取自这张图（旧版用的是 12 节、08:00 起的通用模板）

## 9. 校园卡 / 电费（微信端一卡通 H5）

- 入口：`https://yktwechat.sicau.edu.cn/home/openHomePage?openid=<32-64 位十六进制>`
- 只要 openid 正确就返回完整页面（11014B），错误/缺失时返回 `errorPage` + “认证错误”。
- 页面内容：姓名、学号、余额、账户状态、有效期，功能入口含 校园卡充值 / 网费充值 / 查询流水 /
  用水服务 / 卡挂失解挂 / 修改密码 / **电费充值** / 我的账单。
- 与 UA 无关（Android / curl / Safari 都一样），不需要微信 JSSDK 就能渲染数据。
- `elec.sicau.edu.cn`（ECMS）是另一套：`POST /api/basic/users/login {name,pass,captchacode,uuid}`，
  数据接口要 Bearer；`loginbyphonenum` / `tpsso` 属第三方白名单（带 AppId/Key/Secret）。
  学生侧没有 ECMS 账号，公众号密码与它无关。
