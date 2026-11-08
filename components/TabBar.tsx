import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';

const ICONS: Record<string, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap; label: string }> = {
  index: { on: 'sunny', off: 'sunny-outline', label: '今天' },
  schedule: { on: 'calendar', off: 'calendar-outline', label: '课表' },
  focus: { on: 'timer', off: 'timer-outline', label: '专注' },
  me: { on: 'person', off: 'person-outline', label: '我的' },
};

export function TabBar({ state, descriptors, navigation, emitter, navigateToTab }: any) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: Math.max(insets.bottom, 10),
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          borderRadius: 30,
          paddingVertical: 8,
          paddingHorizontal: 8,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.glassBorder,
          backgroundColor: t.glassStrong,
          shadowColor: '#07200F',
          shadowOpacity: t.scheme === 'dark' ? 0.45 : 0.16,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 10 },
          elevation: 12,
        }}
      >
        <LinearGradient
          colors={[t.glassHighlight, 'transparent']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 0.7 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {state.routes.map((route: any, index: number) => {
          const focused = state.index === index;
          const meta = ICONS[route.name] ?? { on: 'ellipse', off: 'ellipse-outline', label: route.name };
          const onPress = () => {
            // expo-router 58 的 Tabs 传下来的是 emitter + navigateToTab（没有 navigation）
            const event = emitter?.emit?.({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (focused || event?.defaultPrevented) return;
            if (typeof navigateToTab === 'function') navigateToTab(route.key);
            else navigation?.navigate(route.name);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 999,
                  overflow: 'hidden',
                  backgroundColor: focused ? t.primarySoft : 'transparent',
                  borderWidth: focused ? StyleSheet.hairlineWidth : 0,
                  borderColor: focused ? t.glassBorder : 'transparent',
                }}
              >
                <Ionicons name={focused ? meta.on : meta.off} size={19} color={focused ? t.primary : t.textTertiary} />
                {focused ? (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: t.primary }}>{meta.label}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
