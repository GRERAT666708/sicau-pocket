import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 版本检查：官网放一份 /app/version.json，App 启动时静默拉一次（12 小时最多一次），
 * 有新版本就在「我的」页顶部出一条提示，点进去直接下 APK。
 *
 * 站点是纯静态的，这里没有账号、没有设备号，请求里也不带任何标识。
 */

export type VersionManifest = {
  version: string;
  versionCode: number;
  apkUrl: string;
  size?: number;
  sha256?: string;
  releasedAt?: string;
  notes?: string[];
  /** 低于这个 versionCode 的版本会被强制提示（暂未使用，留给以后） */
  minimumVersionCode?: number;
};

const ENDPOINTS = [
  // 本地调试：EXPO_PUBLIC_UPDATE_URL=http://10.0.2.2:8080/app/version.json
  process.env.EXPO_PUBLIC_UPDATE_URL ?? '',
  'https://sicau-pocket.com/app/version.json',
  // jsdelivr 在国内比 raw.githubusercontent 稳，仓库更新后几分钟生效
  'https://cdn.jsdelivr.net/gh/GRERAT666708/sicau-pocket@main/site/app/version.json',
  'https://raw.githubusercontent.com/GRERAT666708/sicau-pocket/main/site/app/version.json',
];

const KEY_LAST_CHECK = '@sicau-pocket/update/lastCheckAtV2';
const KEY_IGNORE = '@sicau-pocket/update/ignoreCode';

/** 当前安装包的 versionCode；取不到就退回 0（只会导致「提示更新」而不是漏提示） */
export const APP_VERSION_CODE: number =
  (Constants.expoConfig?.android?.versionCode as number | undefined) ??
  (Constants.expoConfig as any)?.versionCode ??
  0;

async function fetchManifestOnce(url: string): Promise<VersionManifest | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'cache-control': 'no-cache' },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as VersionManifest;
    if (!json || typeof json.versionCode !== 'number' || typeof json.apkUrl !== 'string') return null;
    return json;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchManifest(): Promise<VersionManifest | null> {
  for (const url of ENDPOINTS.filter(Boolean)) {
    const manifest = await fetchManifestOnce(url);
    if (manifest) return manifest;
  }
  return null;
}

export type UpdateResult = {
  manifest: VersionManifest | null;
  hasUpdate: boolean;
  /** 用户点过「忽略这个版本」 */
  ignored: boolean;
};

export async function checkForUpdate(): Promise<UpdateResult> {
  const manifest = await fetchManifest();
  // 拉失败别记时间，下次启动还会重试；成功才记，12 小时内不再打扰
  if (!manifest) return { manifest: null, hasUpdate: false, ignored: false };
  await AsyncStorage.setItem(KEY_LAST_CHECK, String(Date.now()));

  const ignore = Number((await AsyncStorage.getItem(KEY_IGNORE)) ?? 0);
  const hasUpdate = manifest.versionCode > APP_VERSION_CODE;
  return { manifest, hasUpdate, ignored: hasUpdate && manifest.versionCode <= ignore };
}

export async function ignoreVersion(versionCode: number): Promise<void> {
  await AsyncStorage.setItem(KEY_IGNORE, String(versionCode));
}

/** 12 小时内不重复自动检查 */
async function recentlyChecked(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(KEY_LAST_CHECK);
  const last = Number(raw ?? 0);
  return Date.now() - last < 12 * 60 * 60 * 1000;
}

export function useUpdate(auto = true) {
  const [manifest, setManifest] = useState<VersionManifest | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [ignored, setIgnored] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (force = false) => {
    setChecking(true);
    try {
      if (!force && (await recentlyChecked())) {
        // 刚查过：只回读忽略状态，不再发请求
        if (mounted.current) setChecked(true);
        return;
      }
      const result = await checkForUpdate();
      if (!mounted.current) return;
      setManifest(result.manifest);
      setHasUpdate(result.hasUpdate);
      setIgnored(result.ignored);
      setChecked(true);
    } finally {
      if (mounted.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (auto) void run(false);
  }, [auto, run]);

  const dismiss = useCallback(async () => {
    if (manifest) await ignoreVersion(manifest.versionCode);
    if (mounted.current) setIgnored(true);
  }, [manifest]);

  return { manifest, hasUpdate, ignored, checking, checked, check: run, dismiss };
}

/** 把字节数变成 "34.2 MB" */
export function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}
