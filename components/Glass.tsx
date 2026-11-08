import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Animated, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

/**
 * 液态玻璃材质（Apple Liquid Glass 风格）。
 *
 * 三层叠出来：模糊层（BlurView）→ 半透明染色层 → 顶部镜面高光 + 1px 亮边。
 * 安卓上 BlurView 是近似的（真实模糊只有 iOS 有），所以染色更实一点保证可读性。
 */
export function GlassSurface({
  children,
  style,
  radiusValue = radius.lg,
  intensity = 28,
  strong = false,
  highlight = true,
  contentStyle,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radiusValue?: number;
  intensity?: number;
  /** 更高不透明度（浮层、按钮用） */
  strong?: boolean;
  highlight?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const tint = strong ? t.glassStrong : t.glassTint;

  return (
    <View
      style={[
        {
          borderRadius: radiusValue,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.glassBorder,
          backgroundColor: Platform.OS === 'android' ? tint : 'transparent',
          shadowColor: '#08251A',
          shadowOpacity: t.scheme === 'dark' ? 0.5 : 0.1,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 4,
        },
        style,
      ]}
    >
      <BlurView
        intensity={Platform.OS === 'android' ? intensity * 0.55 : intensity}
        tint={t.scheme === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
      {highlight ? (
        <LinearGradient
          colors={[t.glassHighlight, 'transparent']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 0.55 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

/**
 * 可点的玻璃卡片：按下时轻微缩放（弹性回弹）+ 触点涟漪高光 + 一层短暂"结霜"过渡。
 * 涟漪用一张放大的白色圆片模拟，配合 scale/opacity 动画，比纯透明度变化更有"玻璃被按下"的质感。
 */
export function GlassPressable({
  children,
  onPress,
  style,
  radiusValue = radius.lg,
  intensity = 28,
  strong = false,
  contentStyle,
  disabled,
}: {
  children?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  radiusValue?: number;
  intensity?: number;
  strong?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const glow = React.useRef(new Animated.Value(0)).current;
  const ripple = React.useRef(new Animated.Value(0)).current;
  const [point, setPoint] = React.useState({ x: 120, y: 60, id: 0 });

  const pressIn = (e: any) => {
    const { locationX, locationY } = e?.nativeEvent ?? {};
    setPoint((p) => ({ x: locationX ?? p.x, y: locationY ?? p.y, id: p.id + 1 }));
    ripple.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 0.965, useNativeDriver: true, speed: 45, bounciness: 0 }),
      Animated.timing(glow, { toValue: 1, duration: 110, useNativeDriver: true }),
      Animated.timing(ripple, { toValue: 1, duration: 520, useNativeDriver: true }),
    ]).start();
  };

  const pressOut = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }),
      Animated.timing(glow, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} disabled={disabled}>
        <GlassSurface radiusValue={radiusValue} intensity={intensity} strong={strong}>
          <View style={contentStyle}>{children}</View>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { opacity: glow }]}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0.04)', 'transparent']}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.View
            key={point.id}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: point.x - 110,
              top: point.y - 110,
              width: 220,
              height: 220,
              borderRadius: 110,
              backgroundColor: 'rgba(255,255,255,0.55)',
              opacity: ripple.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.45, 0] }),
              transform: [
                { scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1.6] }) },
              ],
            }}
          />
        </GlassSurface>
      </Pressable>
    </Animated.View>
  );
}
