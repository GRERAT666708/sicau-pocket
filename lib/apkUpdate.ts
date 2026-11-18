import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/**
 * Android 侧的应用内更新：下载 APK → 校验 → 拉起系统安装器。
 *
 * iOS 走 App Store，不能（也不允许）这样更新，所以这里所有函数在非 Android
 * 平台上直接返回失败，调用方会退回「打开下载页」的老逻辑。
 * 这样同一份代码在 iOS 上编译、运行都正常，只是不提供应用内下载。
 */

export const supportsInAppInstall = Platform.OS === 'android';

export type DownloadProgress = (percent: number) => void;

export type DownloadResult =
  | { ok: true; uri: string }
  | { ok: false; reason: 'unsupported' | 'network' | 'checksum' };

/**
 * 下载 APK 到缓存目录。
 *
 * `expectedMd5` 来自 version.json 的 `md5` 字段：给了就校验，
 * 不一致说明文件被截断/被替换，直接删掉当作失败，绝不能让用户装上去。
 */
export async function downloadApk(
  url: string,
  onProgress?: DownloadProgress,
  signal?: { cancelled: boolean },
  expectedMd5?: string,
): Promise<DownloadResult> {
  if (!supportsInAppInstall) return { ok: false, reason: 'unsupported' };
  const dir = FileSystem.cacheDirectory;
  if (!dir) return { ok: false, reason: 'network' };

  const target = `${dir}sicau-pocket-update.apk`;
  try {
    await FileSystem.deleteAsync(target, { idempotent: true });
  } catch {
    /* 删不掉也无所谓，下面会覆盖 */
  }

  let uri: string;
  try {
    const res = await FileSystem.createDownloadResumable(
      url,
      target,
      {},
      (p) => {
        if (signal?.cancelled) return;
        const total = p.totalBytesExpectedToWrite || 0;
        if (total > 0) onProgress?.(Math.min(100, Math.round((p.totalBytesWritten / total) * 100)));
      },
    );
    const out = await res.downloadAsync();
    if (!out?.uri) return { ok: false, reason: 'network' };
    uri = out.uri;
  } catch {
    return { ok: false, reason: 'network' };
  }

  if (!expectedMd5) return { ok: true, uri };

  try {
    const info = await FileSystem.getInfoAsync(uri, { md5: true });
    const actual = 'md5' in info ? info.md5 : undefined;
    if (!actual || actual.toLowerCase() !== expectedMd5.toLowerCase()) {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      return { ok: false, reason: 'checksum' };
    }
  } catch {
    // 算不出哈希时不阻断安装（老设备/老 SDK 的兜底），只当没校验
    return { ok: true, uri };
  }

  return { ok: true, uri };
}

/** 算本地文件的 md5；算不出来返回 null（老设备兜底） */
export async function md5Of(fileUri: string): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(fileUri, { md5: true });
    const md5 = 'md5' in info ? info.md5 : undefined;
    return md5 ? md5.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** 拉起系统安装器；Android 8+ 需要 REQUEST_INSTALL_PACKAGES 权限 */
export async function installApk(fileUri: string): Promise<boolean> {
  if (!supportsInAppInstall) return false;
  try {
    // 只在 Android 上加载这个原生模块，避免 iOS 打包时引入不必要的原生代码
    const IntentLauncher = require('expo-intent-launcher');
    const contentUri = await FileSystem.getContentUriAsync(fileUri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: 'application/vnd.android.package-archive',
    });
    return true;
  } catch {
    return false;
  }
}
