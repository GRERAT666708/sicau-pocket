import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { hydrate, useAppState } from '@/lib/store';
import { hydrateClassrooms } from '@/lib/classroom';
import { hydrateGrades } from '@/lib/grades';
import { useTheme } from '@/hooks/useTheme';

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { hydrated } = useAppState();
  const t = useTheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrate().finally(() => setReady(true));
    void hydrateClassrooms();
    void hydrateGrades();
  }, []);

  useEffect(() => {
    if (ready && hydrated) void SplashScreen.hideAsync().catch(() => {});
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
        <Stack.Screen name="perfectcampus" options={{ presentation: 'card' }} />
        <Stack.Screen name="grades" />
        <Stack.Screen name="grade-import" options={{ presentation: 'card' }} />
        <Stack.Screen name="calendar" />
        <Stack.Screen name="privacy" options={{ headerShown: false }} />
        <Stack.Screen name="about" />
      </Stack>
    </SafeAreaProvider>
  );
}
