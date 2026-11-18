import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/**
 * 各功能板块的「首次引导」是否已经看过。
 * 只存本机，键前缀跟其它设置保持一致；「恢复初始状态」时会一起清掉。
 */
const KEY = '@sicau-pocket/guides/v1';

export type GuideId =
  | 'today'
  | 'schedule'
  | 'focus'
  | 'me'
  | 'ecard'
  | 'classroom'
  | 'grades'
  | 'calendar'
  | 'import';

type Seen = Record<string, boolean>;

let cache: Seen | null = null;

async function load(): Promise<Seen> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Seen) : {};
  } catch {
    cache = {};
  }
  return cache;
}

export async function isGuideSeen(id: GuideId): Promise<boolean> {
  const seen = await load();
  return Boolean(seen[id]);
}

export async function markGuideSeen(id: GuideId): Promise<void> {
  const seen = await load();
  seen[id] = true;
  cache = seen;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    // 存不进去也只影响下次还会弹一次，不影响功能
  }
}

/** 设置里「恢复初始状态」时调用，让引导重新出现 */
export async function resetGuides(): Promise<void> {
  cache = {};
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // 忽略
  }
}

/**
 * 某板块的引导：没看过就 show=true；点「知道了」后 dismiss 并落盘。
 * 首次渲染是 false（要读一次存储），所以不会闪一下又消失。
 */
export function useGuide(id: GuideId): { show: boolean; dismiss: () => void } {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const seen = await isGuideSeen(id);
      if (alive && !seen) setShow(true);
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const dismiss = useCallback(() => {
    setShow(false);
    void markGuideSeen(id);
  }, [id]);

  return { show, dismiss };
}
