type HapticsModule = typeof import('expo-haptics');

/**
 * 震动反馈是锦上添花：原生模块在某些构建里被裁掉了（R8/autolinking），
 * 这里统一 try/catch，缺模块时静默跳过，不影响计时。
 */
function haptics(): HapticsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-haptics') as HapticsModule;
  } catch {
    return null;
  }
}
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import { actions, uid } from './store';

export type TimerPhase = 'idle' | 'running' | 'paused';

type TimerState = {
  phase: TimerPhase;
  durationMin: number;
  tag: string;
  /** 当前计时段开始时间 */
  startedAt: number;
  /** 之前累计的秒数 */
  accumulated: number;
};

let timer: TimerState = {
  phase: 'idle',
  durationMin: 25,
  tag: '学习',
  startedAt: 0,
  accumulated: 0,
};

const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;

function emit() {
  for (const l of listeners) l();
}

/**
 * useSyncExternalStore 用 Object.is 比较快照。倒计时过程中 timer 对象本身不变
 * （只有时间流逝），所以每次通知都要生成新对象，否则 React 会跳过重渲染。
 */
let snapshot: TimerState = timer;

function bump() {
  snapshot = { ...timer };
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function elapsedOf(s: TimerState): number {
  if (s.phase === 'running') return s.accumulated + (Date.now() - s.startedAt) / 1000;
  return s.accumulated;
}

function ensureTick() {
  if (interval) return;
  interval = setInterval(() => {
    const total = timer.durationMin * 60;
    if (elapsedOf(timer) >= total) {
      complete();
      return;
    }
    bump();
  }, 500);
}

function stopTick() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

function reset() {
  stopTick();
  timer = { ...timer, phase: 'idle', startedAt: 0, accumulated: 0 };
  bump();
}

function complete() {
  const total = timer.durationMin * 60;
  const now = Date.now();
  actions.addSession({
    id: uid('focus'),
    tag: timer.tag,
    startedAt: now - total * 1000,
    endedAt: now,
    plannedMinutes: timer.durationMin,
    minutes: timer.durationMin,
    completed: true,
  });
  if (Platform.OS !== 'web') {
    const h = haptics();
    if (h) void h.notificationAsync(h.NotificationFeedbackType.Success).catch(() => {});
  }
  reset();
}

export const timerActions = {
  start(minutes: number, tag: string) {
    timer = {
      phase: 'running',
      durationMin: minutes,
      tag,
      startedAt: Date.now(),
      accumulated: 0,
    };
    ensureTick();
    bump();
    if (Platform.OS !== 'web') {
      const h = haptics();
      if (h) void h.impactAsync(h.ImpactFeedbackStyle.Light).catch(() => {});
    }
  },
  pause() {
    if (timer.phase !== 'running') return;
    timer = { ...timer, phase: 'paused', accumulated: elapsedOf(timer), startedAt: 0 };
    stopTick();
    bump();
  },
  resume() {
    if (timer.phase !== 'paused') return;
    timer = { ...timer, phase: 'running', startedAt: Date.now() };
    ensureTick();
    bump();
  },
  cancel() {
    if (timer.phase === 'idle') return;
    const minutes = Math.round(elapsedOf(timer) / 60);
    if (minutes >= 1) {
      actions.addSession({
        id: uid('focus'),
        tag: timer.tag,
        startedAt: Date.now() - elapsedOf(timer) * 1000,
        endedAt: Date.now(),
        plannedMinutes: timer.durationMin,
        minutes,
        completed: false,
      });
    }
    reset();
  },
  setDuration(minutes: number) {
    if (timer.phase !== 'idle') return;
    timer = { ...timer, durationMin: minutes };
    bump();
  },
  setTag(tag: string) {
    if (timer.phase !== 'idle') return;
    timer = { ...timer, tag };
    bump();
  },
};

export function useTimer() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  const elapsed = elapsedOf(state);
  const total = state.durationMin * 60;
  const remaining = Math.max(0, total - elapsed);
  const progress = total > 0 ? Math.min(1, elapsed / total) : 0;
  return { state, elapsed, remaining, progress, total };
}
