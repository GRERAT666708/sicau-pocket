import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { hydrate, getState, subscribe } from '@/lib/store';
import { syncWidget } from '@/lib/widgetSync';
import { syncClassReminders } from '@/lib/reminders';

/**
 * 后台维护任务。
 *
 * 解决的问题：Android 桌面小组件（以及上课提醒）以前只在「打开 App」时才刷新，
 * 手机放兜里一天不动，小组件显示的还是昨天的课。
 *
 * 用系统的后台任务（Android: WorkManager / iOS: BGTaskScheduler）每 15~60 分钟醒一次：
 *   1. 重新写一遍 widget.json（小组件下次绘制时读到新数据）
 *   2. 顺手补排未来几天的上课提醒（用户开了提醒时才做）
 *
 * 只读本机 AsyncStorage，不联网。
 */

export const MAINTENANCE_TASK = 'sicau-pocket-maintenance';
/** 最小 15 分钟；再密系统也会合并，反而更费电 */
const INTERVAL_MINUTES = 30;

TaskManager.defineTask(MAINTENANCE_TASK, async () => {
  try {
    await hydrate();
    const { courses, settings } = getState();
    await syncWidget(true);
    if (settings.classReminder) {
      await syncClassReminders(courses, settings);
    }
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** 注册（幂等）：已经在注册表里就不再重复注册 */
export async function ensureMaintenanceTask(): Promise<boolean> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;
    const registered = await TaskManager.isTaskRegisteredAsync(MAINTENANCE_TASK);
    if (!registered) {
      await BackgroundTask.registerTaskAsync(MAINTENANCE_TASK, { minimumInterval: INTERVAL_MINUTES });
    }
    return true;
  } catch {
    return false;
  }
}

export async function unregisterMaintenanceTask(): Promise<void> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(MAINTENANCE_TASK);
    if (registered) await BackgroundTask.unregisterTaskAsync(MAINTENANCE_TASK);
  } catch {
    // 忽略：任务没注册过或系统不支持
  }
}

/**
 * 前台兜底：App 从后台回到前台、以及课表变更时，顺手重排提醒（后台任务不保证准点）。
 * 返回取消订阅函数。
 */
export function startReminderSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSignature = '';

  const run = () => {
    const { courses, settings } = getState();
    const signature = JSON.stringify({
      n: courses.length,
      ids: courses.map((c) => `${c.id}:${c.slots.length}`).join(','),
      on: settings.classReminder === true,
      lead: settings.classReminderLead,
      start: settings.termStart,
    });
    if (signature === lastSignature) return;
    lastSignature = signature;
    void syncClassReminders(courses, settings);
  };

  run();
  const unsubscribe = subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, 1200);
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
