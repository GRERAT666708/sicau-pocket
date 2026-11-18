import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useGuide, type GuideId } from '@/lib/guides';
import { Card } from './UIKit';

/**
 * 板块首次引导：第一次进到某个页面时在顶部出现一张说明卡，
 * 点「知道了」落盘，之后不再出现；「设置 → 恢复初始状态」可以重置。
 */
export function GuideCard({
  id,
  icon,
  title,
  points,
}: {
  id: GuideId;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  points: string[];
}) {
  const t = useTheme();
  const { show, dismiss } = useGuide(id);
  if (!show) return null;

  return (
    <Card
      style={{
        marginTop: spacing.md,
        padding: 14,
        borderWidth: 1,
        borderColor: t.primarySoft,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 9,
            backgroundColor: t.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={15} color={t.primary} />
        </View>
        <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: t.text }}>{title}</Text>
        <Pressable onPress={dismiss} hitSlop={10}>
          <Text style={{ fontSize: 12, color: t.primary, fontWeight: '600' }}>知道了</Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 8, gap: 5 }}>
        {points.map((line) => (
          <View key={line} style={{ flexDirection: 'row', gap: 6 }}>
            <View
              style={{
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: t.primary,
                marginTop: 7,
              }}
            />
            <Text style={{ flex: 1, fontSize: 12, color: t.textSecondary, lineHeight: 19 }}>
              {line}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={dismiss}
        style={{
          marginTop: 10,
          alignSelf: 'flex-start',
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: radius.pill,
          backgroundColor: t.surfaceAlt,
        }}
      >
        <Text style={{ fontSize: 11.5, color: t.textSecondary }}>不再提示</Text>
      </Pressable>
    </Card>
  );
}
