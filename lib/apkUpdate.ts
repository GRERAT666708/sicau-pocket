import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/**
 * Android 侧的应用内更新：下载 APK → 拉起系统安装器。
 *
 * iOS 走 App Store，不能（也不允许）这样更新，所以这里所有函数在非 Android
 * 平台上直接返回 false，调用方会退回「打开下载页」的老逻辑。
 * 这样同一份代码在 iOS 上编译、运行都正常，只是不提供应用内下载。
 */

export const supportsInAppInstall = Platform.OS === 'android';

export type DownloadProgress = (percent: number) => void;

/** 下载 APK 到缓存目录；返回本地 file:// 路径，失败返回 null */
export async function downloadApk(
  url: string,
  onProgress?: DownloadProgress,
  signal?: { cancelled: boolean },
): Promise<string | null> {
  if (!supportsInAppInstall) return null;
  const dir = FileSystem.cacheDirectory;
  if (!dir) return null;

  const target = `${dir}sicau-pocket-update.apk`;
  try {
    await FileSystem.deleteAsync(target, { idempotent: true });
  } catch {
    /* 删不掉也无所谓，下面会覆盖 */
  }

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
    return out?.uri ?? null;
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
