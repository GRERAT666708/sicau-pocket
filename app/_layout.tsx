import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { hydrate, useAppState } from '@/lib/store';
import { hydrateClassrooms } from '@/lib/classroom';
import { hydrateGrades } from '@/lib/grades';
import { startWidgetSync } from '@/lib/widgetSync';
import { ensureMaintenanceTask, startReminderSync } from '@/lib/backgroundTasks';
import { startNotificationTapRouting } from '@/lib/reminders';
import { md5SelfTestEnabled, runMd5SelfTest } from '@/lib/selfTest';
import { takeWhatsNew, type WhatsNewInfo } from '@/lib/whatsNew';
import { WhatsNewModal } from '@/components/WhatsNew';
import { useTheme } from '@/hooks/useTheme';

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { hydrated } = useAppState();
  const t = useTheme();
  const [ready, setReady] = useState(false);
  const [whatsNew, setWhatsNew] = useState<WhatsNewInfo | null>(null);

  useEffect(() => {
    hydrate().finally(() => setReady(true));
    void hydrateClassrooms();
    void hydrateGrades();
  }, []);

  useEffect(() => {
    if (ready && hydrated) void SplashScreen.hideAsync().catch(() => {});
  }, [ready, hydrated]);

  // 打包时给 EXPO_PUBLIC_MD5_SELFTEST=1 才会跑：真机上验证下载+md5 校验链路
  useEffect(() => {
    if (md5SelfTestEnabled()) void runMd5SelfTest();
  }, []);

  // 更新后第一次启动：弹一次「这次更新了什么」
  useEffect(() => {
    if (!ready || !hydrated) return;
    void takeWhatsNew().then(setWhatsNew);
  }, [ready, hydrated]);

  // 课表变化时把「今天」写进 widget.json，供桌面小组件读取
  useEffect(() => {
    if (!ready || !hydrated) return;
    return startWidgetSync();
  }, [ready, hydrated]);

  // 上课提醒：课表/设置一变就重排（前台兜底，后台任务不保证准点）
  useEffect(() => {
    if (!ready || !hydrated) return;
    return startReminderSync();
  }, [ready, hydrated]);

  // 注册后台维护任务（小组件数据 + 提醒补排，系统决定多久跑一次，最短 15 分钟）
  useEffect(() => {
    if (!ready || !hydrated) return;
    void ensureMaintenanceTask();
  }, [ready, hydrated]);

  // 点上课提醒的通知 → 打开课表
  useEffect(() => {
    if (!ready || !hydrated) return;
    return startNotificationTapRouting((route) => router.push(route as never));
  }, [ready, hydrated]);

  if (!ready || !hydrated) {
    return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="course/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="course/edit" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="campus/[kind]" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="import" />
        <Stack.Screen name="web-import" />
        <Stack.Screen name="grades" />
        <Stack.Screen name="grade-import" options={{ presentation: 'card' }} />
        <Stack.Screen name="calendar" />
        <Stack.Screen name="privacy" options={{ headerShown: false }} />
        <Stack.Screen name="about" />
      </Stack>
      <WhatsNewModal info={whatsNew} onClose={() => setWhatsNew(null)} />
    </SafeAreaProvider>
  );
}
