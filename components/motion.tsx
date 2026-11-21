import React, { useEffect } from 'react';
import { AccessibilityInfo, Platform, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/**
 * 动效基线（方案 A：轻量统一）
 *
 * 设计原则：
 * - 只做「入场 / 反馈」两类，不做循环动画，不遮挡内容；
 * - 一律尊重系统「减少动态效果」开关（iOS 辅助功能 / 安卓无障碍）；
 * - 时长控制在 140–260ms，延迟按阶梯排，最多叠 8 层，避免长列表拖沓。
 */
export const DUR = {
  fast: 140,
  base: 220,
  slow: 280,
} as const;

export const SPRING = {
  /** 轻：用在指示器、图标这类小元素 */
  light: { damping: 20, stiffness: 260, mass: 0.6 },
  /** 常规：卡片、按钮 */
  normal: { damping: 18, stiffness: 220, mass: 0.8 },
} as const;

type RevealProps = {
  children: React.ReactNode;
  /** 第几个出场，用于错峰；超过 8 之后不再叠加延迟 */
  index?: number;
  /** 入场位移方向，默认从下方 12px 浮起 */
  offsetY?: number;
  offsetX?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * 入场动画容器：透明度 + 位移，挂载时播放一次。
 * 只在首帧后播放，避免与导航转场叠在一起显得乱。
 */
export function Reveal({ children, index = 0, offsetY = 12, offsetX = 0, style }: RevealProps) {
  const progress = useSharedValue(0);
  const reduced = useSharedValue<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((isReduced) => {
        if (!alive) return;
        reduced.value = isReduced;
        if (isReduced) {
          progress.value = 1;
          return;
        }
        const delay = Math.min(index, 8) * 45;
        progress.value = withDelay(delay, withTiming(1, { duration: DUR.base, easing: Easing.out(Easing.cubic) }));
      });
    return () => {
      alive = false;
    };
  }, []);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * offsetY }, { translateX: (1 - progress.value) * offsetX }],
  }));

  return <Animated.View style={[animated, style]}>{children}</Animated.View>;
}

/**
 * 给导航栈用的统一转场时长（Android 上系统默认偏慢，iOS 偏快，这里对齐到 220ms 左右）。
 * 仅作用于 expo-router 的 Stack options。
 */
export const stackTransition = Platform.select({
  android: { animation: 'slide_from_right' as const, animationDuration: DUR.base },
  default: { animation: 'slide_from_right' as const },
});
