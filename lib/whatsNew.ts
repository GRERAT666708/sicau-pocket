import AsyncStorage from '@react-native-async-storage/async-storage';

import { notesFor } from '@/lib/changelog';
import { APP_VERSION } from '@/lib/version';

const KEY = '@sicau-pocket/whatsNew/seenVersion';
/** 老用户的老数据标记：有它说明不是第一次装（0.10.21 之前的版本没有 whatsNew 记录） */
const LEGACY_KEY = '@sicau-pocket/state/v1';

export type WhatsNewInfo = { version: string; notes: string[] };

/**
 * 更新后第一次启动返回本次更新说明；首次安装、或这个版本已经看过，返回 null。
 * 调用即标记为已看，避免用户没点关闭又重新弹。
 */
export async function takeWhatsNew(): Promise<WhatsNewInfo | null> {
  try {
    const seen = await AsyncStorage.getItem(KEY);
    if (!seen) {
      // 没有记录：可能是刚装上，也可能是从老版本升上来的（老版本没写过这个 key）
      const legacy = await AsyncStorage.getItem(LEGACY_KEY);
      await AsyncStorage.setItem(KEY, APP_VERSION);
      if (!legacy) return null; // 真·首次安装，不打扰
      const legacyNotes = notesFor(APP_VERSION);
      return legacyNotes ? { version: APP_VERSION, notes: legacyNotes } : null;
    }
    if (seen === APP_VERSION) return null;
    await AsyncStorage.setItem(KEY, APP_VERSION);
    const notes = notesFor(APP_VERSION);
    return notes ? { version: APP_VERSION, notes } : null;
  } catch {
    return null;
  }
}

/** 调试用：忘掉「已看过的版本」，下次启动会重新弹 */
export async function resetWhatsNew(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
