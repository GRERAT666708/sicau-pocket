# 在模拟器里抓 App 的 HTTPS 包（完美校园用）

目标是抓「完美校园」App 里宿舍电费 / 校园卡余额的接口，再把它们接进「川农口袋」。

## 已经搭好的东西

| 组件 | 位置 | 说明 |
| --- | --- | --- |
| 模拟器 | `$WS/android-sdk`，AVD `sicau`（Android 15 / google_apis / arm64） | 启动时带 `-writable-system`，才能改系统证书库 |
| 抓包代理 | `tools/mitm.py`（只依赖标准库 + openssl） | `python3 tools/mitm.py --port 8080 --out tools/capture.jsonl` |
| CA 证书 | `tools/certs/ca.crt`（CN=SicauPocket MITM CA） | 已按 `<subject_hash_old>.0` = `99a05c2e.0` 装进系统证书库 |

装系统证书的完整步骤（重装模拟器后要再做一次）：

```bash
export HOME="$WS/android-user"
A="$WS/android-sdk/platform-tools/adb"
# 1. 模拟器必须用 -writable-system 启动
"$WS/android-sdk/emulator/emulator" -avd sicau -no-audio -writable-system -gpu swiftshader_indirect &
$A wait-for-device
# 2. root + 可写
$A root && sleep 2 && $A remount
# 3. 装 CA（文件名 = openssl x509 -subject_hash_old -in ca.crt -noout）
$A push tools/certs/ca.crt /sdcard/ca.crt
$A shell "cp /sdcard/ca.crt /system/etc/security/cacerts/99a05c2e.0 && chmod 644 /system/etc/security/cacerts/99a05c2e.0"
# 4. 重启让它生效
$A reboot
# 5. 让模拟器走代理（10.0.2.2 是宿主机）
$A shell settings put global http_proxy 10.0.2.2:8080
# 用完关掉
$A shell settings put global http_proxy :0
```

验证代理是否解密成功：`curl -sk -x http://127.0.0.1:8080 https://www.17wanxiao.com/`，
`tools/capture.jsonl` 里会出现一条带 `reqHeaders` / `respBody` 的记录。

## 卡住的地方（2026-11-06）

1. **网络**：`api.17wanxiao.com` 在这台机器的网络上 443 不通（两个 A 记录都超时，模拟器里 `nc` 也超时），
   而 `www.17wanxiao.com` 是通的。App 的登录和余额接口都走 `api.17wanxiao.com`，所以即使抓到包也没有响应体。
2. **加固**：完美校园 `com.newcapec.mobile.ncp` 5.8.36 用了 360 加固（`libjiagu_vip_64.so` / `libjgdtc.so`）。
   在模拟器里点「登录」直接弹 **「安全环境未配置成功，请稍后再试」**，登录请求根本没发出去。
   已经试过 `adb unroot` 后重试，仍然一样 —— 大概率是模拟器 / 无 SIM 卡被判定为不安全环境。

## 要继续的话，可选路子

- 给模拟器上 Magisk + Zygisk + Frida，绕过加固的环境检测和证书校验（工作量大，成功率一般）；
- 在**真机**上抓：需要 root 装系统证书，或 App 自身允许用户证书（targetSdk 30，默认不允许）；
- 用学校侧接口：如果能拿到学校后勤/一卡通系统的地址（内网或 WebVPN 里），像教室课表那样抓网页最省事。
