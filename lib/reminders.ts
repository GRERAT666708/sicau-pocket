import { Platform } from 'react-native';

import { addDays, fmtHM, startOfDay, weekNumber } from '@/lib/date';
import { periodEnd, periodStart } from '@/lib/periods';
import type { AppSettings, Course } from '@/lib/types';

/**
 * 上课本地提醒。
 *
 * 只在手机本地排通知（Android 用 NotificationManager 的定时提醒，iOS 用 UNUserNotificationCenter），
 * 不联网、不上传任何课表内容。允许的提前量由 `settings.classReminderLead` 决定。
 *
 * 为什么是「排未来 14 天」而不是「每周重复」：
 * 单双周、临时调课、换学期都要跟着变，滚动排一段固定窗口最省心；
 * 每次打开 App / 改课表 / 改设置都会先清空再重排，保证不会重复也不会过期。
 */

export const REMINDER_LEADS = [5, 10, 15, 20, 30] as const;
export const DEFAULT_REMINDER_LEAD = 10;
/** 一次最多排多少条（iOS 单个 App 上限 64 条待发通知，留点余量） */
const MAX_SCHEDULED = 48;
/** 往后排多少天 */
const HORIZON_DAYS = 14;

const CHANNEL_ID = 'class-reminder';

type NotificationsModule = typeof import('expo-notifications');

/** expo-notifications 在 web 上不可用，这里统一做一层保护 */
function notifications(): NotificationsModule | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}

let handlerInstalled = false;

/**
 * 前台也要弹：expo-notifications 默认在 App 处于前台时静默丢弃通知，
 * 上课提醒必须例外，否则「正在用 App 时收不到上课提醒」就等于没有。
 */
function installForegroundHandler(): void {
  const N = notifications();
  if (!N || handlerInstalled) return;
  handlerInstalled = true;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** 点通知回到课表页 */
export function startNotificationTapRouting(onRoute: (route: string) => void): () => void {
  const N = notifications();
  if (!N) return () => {};
  const sub = N.addNotificationResponseReceivedListener((response) => {
    const route = response.notification.request.content.data?.route;
    if (typeof route === 'string') onRoute(route);
  });
  return () => sub.remove();
}

export type ReminderEvent = {
  /** 触发时间 */
  fireAt: Date;
  title: string;
  body: string;
  /** 用于排序/去重 */
  key: string;
};

/** 把课表摊平成「未来 N 天里每个要上课的时段」，纯函数，方便单测 */
export function buildReminderEvents(
  courses: Course[],
  settings: AppSettings,
  now = new Date(),
  horizonDays = HORIZON_DAYS,
): ReminderEvent[] {
  const lead = settings.classReminderLead ?? DEFAULT_REMINDER_LEAD;
  const start = startOfDay(now);
  const out: ReminderEvent[] = [];

  for (let offset = 0; offset < horizonDays; offset++) {
    const date = addDays(start, offset);
    // 1 = 周一 … 7 = 周日（课程 slot.day 用这套编号）
    const day = ((date.getDay() + 6) % 7) + 1;
    const week = weekNumber(settings.termStart, date);

    for (const course of courses) {
      for (const slot of course.slots) {
        if (slot.day !== day) continue;
        if (!slot.weeks.includes(week)) continue;

        const minutes = periodStart(slot.start) - lead;
        if (minutes < 0) continue;
        const fireAt = new Date(date.getTime());
        fireAt.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
        if (fireAt.getTime() <= now.getTime() + 30_000) continue;

        const room = slot.room ?? course.room;
        const timeText = `${fmtHM(periodStart(slot.start))}-${fmtHM(periodEnd(slot.end))}`;
        out.push({
          fireAt,
          title: lead > 0 ? `${lead} 分钟后上课：${course.name}` : `现在上课：${course.name}`,
          body: [timeText, room, course.teacher].filter(Boolean).join(' · '),
          key: `${course.id}-${slot.id}-${date.toISOString().slice(0, 10)}`,
        });
      }
    }
  }

  out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return out.slice(0, MAX_SCHEDULED);
}

export type ReminderSyncResult =
  | { ok: true; scheduled: number; lead: number }
  | { ok: false; reason: 'unsupported' | 'permission' | 'error'; message?: string };

/** 申请通知权限（只在用户第一次打开开关时调用） */
export async function ensureReminderPermission(): Promise<boolean> {
  const N = notifications();
  if (!N) return false;
  const current = await N.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await N.requestPermissionsAsync();
  return asked.granted;
}

async function ensureChannel(): Promise<void> {
  const N = notifications();
  if (!N || Platform.OS !== 'android') return;
  await N.setNotificationChannelAsync(CHANNEL_ID, {
    name: '上课提醒',
    importance: N.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 200, 120, 200],
    lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
  });
}

/**
 * 清空旧提醒 → 按当前课表重排。可以随便重复调用。
 */
export async function syncClassReminders(
  courses: Course[],
  settings: AppSettings,
  options: { requestPermission?: boolean } = {},
): Promise<ReminderSyncResult> {
  const N = notifications();
  if (!N) return { ok: false, reason: 'unsupported' };
  installForegroundHandler();

  const enabled = settings.classReminder === true;
  const lead = settings.classReminderLead ?? DEFAULT_REMINDER_LEAD;

  // 无论开关状态，先清掉之前排的，避免关掉之后还在响
  await N.cancelAllScheduledNotificationsAsync();
  if (!enabled) return { ok: true, scheduled: 0, lead };

  const granted = options.requestPermission ? await ensureReminderPermission() : (await N.getPermissionsAsync()).granted;
  if (!granted) return { ok: false, reason: 'permission' };

  await ensureChannel();

  const events = buildReminderEvents(courses, settings);
  let scheduled = 0;
  for (const event of events) {
    try {
      await N.scheduleNotificationAsync({
        content: {
          title: event.title,
          body: event.body,
          sound: 'default',
          data: { key: event.key, route: '/schedule' },
        },
        trigger: {
          type: N.SchedulableTriggerInputTypes.DATE,
          date: event.fireAt,
          channelId: CHANNEL_ID,
        },
      });
      scheduled += 1;
    } catch (e) {
      return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) };
    }
  }
  return { ok: true, scheduled, lead };
}

/** 调试/设置页用：现在排了多少条 */
export async function pendingReminderCount(): Promise<number> {
  const N = notifications();
  if (!N) return 0;
  const list = await N.getAllScheduledNotificationsAsync();
  return list.length;
}
