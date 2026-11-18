import { downloadApk, md5Of } from './apkUpdate';

/**
 * 只在打包时给了 EXPO_PUBLIC_MD5_SELFTEST=1 才会跑，用来在真机上验证
 * 「下载 → 算 md5 → 比对」这条链路，不需要真的发一次版。
 * 结果打到 logcat：`adb logcat -s ReactNativeJS:* | grep MD5TEST`
 */
const PROBE = 'https://cdn.jsdelivr.net/gh/GRERAT666708/sicau-pocket@main/site/app/version.json';

export function md5SelfTestEnabled() {
  return process.env.EXPO_PUBLIC_MD5_SELFTEST === '1';
}

export async function runMd5SelfTest(): Promise<void> {
  const log = (...args: unknown[]) => console.log('MD5TEST', ...args);

  const first = await downloadApk(PROBE);
  if (!first.ok) {
    log('fail: first download', first.reason);
    return;
  }
  const md5 = await md5Of(first.uri);
  log('downloaded, md5 =', md5, 'file =', first.uri);
  if (!md5) {
    log('fail: md5 unavailable on this device');
    return;
  }

  const good = await downloadApk(PROBE, undefined, undefined, md5);
  log('good md5 ->', good.ok ? 'PASS(ok)' : `FAIL(${good.reason})`);

  const bad = await downloadApk(PROBE, undefined, undefined, '0'.repeat(32));
  log('bad  md5 ->', bad.ok ? 'FAIL(should have rejected)' : `PASS(${bad.reason})`);
}
