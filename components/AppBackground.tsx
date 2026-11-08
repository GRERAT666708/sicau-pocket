import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

const EMBLEM_LIGHT = require('../assets/images/emblem-green.png');
const EMBLEM_DARK = require('../assets/images/emblem-white.png');

/**
 * 页面统一背景：柔和渐变 + 校徽水印。
 *
 * 水印在正中间（水平垂直都居中），浅色 9%、深色 7% 透明度，不抢内容，只给页面一点"学校感"。
 */
export function AppBackground({
  children,
  style,
  watermark = true,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  watermark?: boolean;
}) {
  const t = useTheme();

  return (
    <View style={[{ flex: 1, backgroundColor: t.bg }, style]}>
      <LinearGradient
        colors={t.bgGradient}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {watermark ? (
        <View style={styles.watermarkWrap} pointerEvents="none">
          <Image
            source={t.scheme === 'dark' ? EMBLEM_DARK : EMBLEM_LIGHT}
            style={[styles.watermark, { opacity: t.scheme === 'dark' ? 0.07 : 0.09 }]}
          />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  watermarkWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watermark: {
    width: 620,
    height: 620,
    resizeMode: 'contain',
  },
});
