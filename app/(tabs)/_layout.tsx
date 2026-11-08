import { Tabs } from 'expo-router';
import React from 'react';
import { TabBar } from '@/components/TabBar';
import { useTheme } from '@/hooks/useTheme';

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: t.bg },
      }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: '今天' }} />
      <Tabs.Screen name="schedule" options={{ title: '课表' }} />
      <Tabs.Screen name="focus" options={{ title: '专注' }} />
      <Tabs.Screen name="me" options={{ title: '我的' }} />
    </Tabs>
  );
}
