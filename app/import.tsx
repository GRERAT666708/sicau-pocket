import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Card, PrimaryButton, SectionTitle } from '@/components/UIKit';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAppState } from '@/lib/store';

const STEPS = [
  '打开教务系统（校外走校园 VPN，校内哪条都行）',
  '用统一身份认证 / 学号登录，身份选「学生」',
  '进到「我的课表 / 课表查询」，停在课表页',
  '点底部「导入这个页面」，确认课程无误后导入',
];

export default function ImportScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings } = useAppState();

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingHorizontal: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={t.text} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>导入课表</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
      >
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 13,
                backgroundColor: t.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="globe-outline" size={19} color={t.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>在 App 里登录教务网导入</Text>
              <Text style={{ fontSize: 12, color: t.textSecondary, marginTop: 2 }}>
                打开真实页面自己登录，教务改版也不受影响
              </Text>
            </View>
            <Badge text="推荐" tone="primary" />
          </View>

          <Text style={{ fontSize: 12.5, color: t.textTertiary, lineHeight: 19 }}>
            密码只在你面前那个网页里输入，不经过 App 的代码，也不会被保存。进到课表页后点一下底部的「导入这个页面」，
            解析出来的课可以逐条核对，确认后再覆盖本机课表。
          </Text>

          <PrimaryButton
            label="打开教务网并导入"
            icon="open-outline"
            onPress={() => router.push('/web-import')}
          />
        </Card>

        <SectionTitle title="更省事：截图导入" />
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: t.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="image-outline" size={19} color={t.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>用课表截图导入</Text>
              <Text style={{ fontSize: 12, color: t.textSecondary, marginTop: 2 }}>
                不用登录：把教务网整周课表截一张图，本机识别后生成课表
              </Text>
            </View>
            <Badge text="新" tone="warn" />
          </View>
          <Text style={{ fontSize: 12.5, color: t.textTertiary, lineHeight: 19 }}>
            识别全在手机本地完成，图片不上传。识别完先给你一份清单，核对无误再覆盖本机课表。
          </Text>
          <PrimaryButton label="选一张课表截图" icon="image-outline" onPress={() => router.push('/import-image')} />
        </Card>

        <SectionTitle title="大概四步" />
        <Card style={{ gap: 12 }}>
          {STEPS.map((text, i) => (
            <View key={text} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: t.primarySoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 1,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: t.primary }}>{i + 1}</Text>
              </View>
              <Text style={{ flex: 1, fontSize: 13, color: t.textSecondary, lineHeight: 20 }}>{text}</Text>
            </View>
          ))}
        </Card>

        <Card
          style={{
            marginTop: spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: t.surfaceAlt,
          }}
          onPress={() => router.push('/settings')}
        >
          <Ionicons name="location-outline" size={18} color={t.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: t.text }}>
              当前校区：{settings.campus}校区
              {settings.campusSource === 'timetable' ? '（按课表识别）' : ''}
              {settings.campusSource === 'major' ? '（按专业推断）' : ''}
              {settings.campusSource === 'manual' ? '（手动设置）' : ''}
            </Text>
            <Text style={{ fontSize: 12, color: t.textTertiary, marginTop: 2 }}>
              导入时也会顺带核对校区，对不上就去设置里改
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={t.textTertiary} />
        </Card>

        <View
          style={{
            marginTop: spacing.lg,
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: t.primarySoft,
            flexDirection: 'row',
            gap: 8,
          }}
        >
          <Ionicons name="information-circle-outline" size={16} color={t.primary} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 12, color: t.primary, lineHeight: 18 }}>
            导入会覆盖当前课表（示例课表也会被替换）。解析结果里如果有「教室借用 / 活动」这类记录，默认不会导入。
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
