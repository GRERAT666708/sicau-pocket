/**
 * 教务网页会话的本地留存。
 *
 * 目的：第二次打开「在 App 里登录教务网」时不用重新登录。
 *
 * 分两层：
 *  1) 平台层：WebView 自己的 Cookie 存储本来就是持久化的（Android Chromium cookie store
 *     / iOS WKWebsiteDataStore），HttpOnly 的会话 Cookie 也在这个库里，这一层我们不用管。
 *  2) 应用层：把可读的 document.cookie、最后停留的网址、是否已登录记到 AsyncStorage，
 *     下次进来先回填 + 直接回到上次那一页。换设备/清缓存后这一层还能救一下。
 *
 * 现在有两条通道：
 *  - vpn：校园 WebVPN（https://webvpn.sicau.edu.cn/），校外也能开教务网
 *  - direct：直连 jiaowu.sicau.edu.cn（校园网内网速最快）
 * Cookie 按域名分开存，别把 A 站的 Cookie 塞给 B 站。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@sicau-pocket/websession/v2';

export type WebChannel = 'vpn' | 'direct';

export type WebSession = {
  /** 上次用的通道 */
  channel?: WebChannel;
  /** 最后一次停留的网址（通常是课表页） */
  lastUrl?: string;
  /** 上一次检测到已登录 */
  loggedIn?: boolean;
  /** 按域名分开存的 document.cookie */
  cookiesByHost?: Record<string, string>;
  updatedAt?: number;
};

export async function loadWebSession(): Promise<WebSession> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as WebSession;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveWebSession(patch: WebSession): Promise<void> {
  try {
    const current = await loadWebSession();
    const next: WebSession = {
      ...current,
      ...patch,
      cookiesByHost: { ...(current.cookiesByHost ?? {}), ...(patch.cookiesByHost ?? {}) },
      updatedAt: Date.now(),
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 存不下就算了，不影响主流程
  }
}

export async function clearWebSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // 忽略
  }
}

/** 从网址里取域名，取不到就返回空串 */
export function hostOf(url: string | undefined): string {
  if (!url) return '';
  const matched = url.match(/^https?:\/\/([^/:]+)/i);
  return matched ? matched[1].toLowerCase() : '';
}

/** 把 "a=1; b=2" 变成能直接在页面里执行的 document.cookie 赋值语句 */
export function cookieAssignments(cookies: string | undefined, host: string): string[] {
  if (!cookies || !host) return [];
  return cookies
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.includes('='))
    .map((part) => {
      const name = part.slice(0, part.indexOf('=')).trim();
      const value = part.slice(part.indexOf('=') + 1).trim();
      if (!name) return '';
      const safeName = JSON.stringify(name).slice(1, -1);
      const safeValue = JSON.stringify(value).slice(1, -1);
      return `document.cookie=${JSON.stringify(`${safeName}=${safeValue}; path=/; domain=.${host};`)};`;
    })
    .filter(Boolean);
}
