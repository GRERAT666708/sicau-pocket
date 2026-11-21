import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DUR, SPRING } from '@/components/motion';
import { useTheme } from '@/hooks/useTheme';

// 选中态滑块与每个 tab 的内容框共用同一个宽度，保证滑块永远正好包住内容且居中
const PILL_W = 78;

const ICONS: Record<string, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap; label: string }> = {
  index: { on: 'sunny', off: 'sunny-outline', label: '今天' },
  schedule: { on: 'calendar', off: 'calendar-outline', label: '课表' },
  focus: { on: 'timer', off: 'timer-outline', label: '专注' },
  me: { on: 'person', off: 'person-outline', label: '我的' },
};

function TabIcon({ name, color, focused }: { name: keyof typeof Ionicons.glyphMap; color: string; focused: boolean }) {
  const scale = useSharedValue(focused ? 1.12 : 1);

  useEffect(() => {
    scale.value = focused
      ? withSpring(1.12, SPRING.light)
      : withTiming(1, { duration: DUR.fast, easing: Easing.out(Easing.quad) });
  }, [focused]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <Ionicons name={name} size={19} color={color} />
    </Animated.View>
  );
}

export function TabBar({ state, descriptors, navigation, emitter, navigateToTab }: any) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [innerWidth, setInnerWidth] = React.useState(0);
  const count = Math.max(state.routes.length, 1);
  const segW = innerWidth / count;
  const indicatorX = useSharedValue(0);

  useEffect(() => {
    if (segW <= 0) return;
    // 每段都用固定宽度 PILL_W 居中：几何上不可能偏
    indicatorX.value = withSpring(state.index * segW + (segW - PILL_W) / 2, SPRING.light);
  }, [state.index, segW]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    opacity: segW > 0 ? 1 : 0,
  }));

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
        {/* 滑块：跟着当前 tab 弹簧滑动，比每个 tab 各自染色更连贯 */}
        {/* 绝对定位以 padding box 为原点，所以这里补回 paddingHorizontal，才能和内容行对齐 */}
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 8, right: 8 }} pointerEvents="none">
          <Animated.View style={[{ position: 'absolute', top: 6, bottom: 6, width: PILL_W }, indicatorStyle]}>
            <View
              style={{
                flex: 1,
                borderRadius: 999,
                backgroundColor: t.primarySoft,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: t.glassBorder,
              }}
            />
          </Animated.View>
        </View>
        <View style={{ flex: 1, flexDirection: 'row' }} onLayout={(e) => setInnerWidth(e.nativeEvent.layout.width)}>
          {state.routes.map((route: any, index: number) => {
            const focused = state.index === index;
            const meta = ICONS[route.name] ?? { on: 'ellipse', off: 'ellipse-outline', label: route.name };
            const onPress = () => {
              // expo-router 58 的 Tabs 传下来的是 emitter + navigateToTab（没有 navigation）
              const event = emitter?.emit?.({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (focused || event?.defaultPrevented) return;
              void Haptics.selectionAsync().catch(() => {});
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
                    width: PILL_W,
                    height: 40,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <TabIcon
                    name={focused ? meta.on : meta.off}
                    color={focused ? t.primary : t.textTertiary}
                    focused={focused}
                  />
                  <Text
                    allowFontScaling={false}
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: t.primary,
                      opacity: focused ? 1 : 0,
                    }}
                  >
                    {meta.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
