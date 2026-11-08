import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Card, ListRow, SectionTitle } from '@/components/UIKit';
import { radius, spacing } from '@/constants/theme';
import { currentWeek, useAppState } from '@/lib/store';
import { APP_VERSION } from '@/lib/version';
import { effectiveCampus } from '@/lib/campusState';
import { useTheme } from '@/hooks/useTheme';
import { AppBackground } from '@/components/AppBackground';
import { GlassPressable } from '@/components/Glass';

const ROUTES: Record<string, Href> = {
  grades: '/grades',
  calendar: '/calendar',
};

const SERVICES: {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  soon?: boolean;
  /** 入口下方的小字状态，比如「暂不可用」 */
  hint?: string;
}[] = [
  { key: 'electricity', label: '宿舍电费', icon: 'flash-outline', color: '#C97B2E', hint: '已接入 · 可充值' },
  { key: 'ecard', label: '校园一卡通', icon: 'card-outline', color: '#9A2F47', hint: '已接入 · 看余额' },
  { key: 'library', label: '图书馆座位', icon: 'library-outline', color: '#3E3A99', hint: '暂不可用' },
  { key: 'classroom', label: '空闲教室', icon: 'school-outline', color: '#0E7A43' },
  { key: 'grades', label: '成绩查询', icon: 'ribbon-outline', color: '#2F7A9A' },
  { key: 'calendar', label: '校历', icon: 'calendar-outline', color: '#8A5A2B' },
];

export default function MeScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, settings, courses, sessions } = useAppState();
  const week = currentWeek(settings);

  const campus = effectiveCampus(settings);
  const name = settings.major || user?.name || '未设置专业';
  const initial = name.slice(0, 1);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: spacing.lg, paddingBottom: 130 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={{ fontSize: 24, fontWeight: '700', color: t.text }}>我的</Text>

      <LinearGradient
        colors={[t.primary, t.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 22, padding: 18, marginTop: spacing.md }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.22)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: '#fff', fontSize: 19, fontWeight: '700' }}>{name}</Text>
              <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.22)' }}>
                <Text style={{ color: '#fff', fontSize: 10 }}>{campus}校区</Text>
              </View>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 5 }}>
              {`四川农业大学 · 第 ${week} 教学周`}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.2)' }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>设置</Text>
          </Pressable>
        </View>

        <View
          style={{
            flexDirection: 'row',
            marginTop: 18,
            paddingTop: 14,
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.18)',
          }}
        >
          {[
            { label: '课程', value: courses.length },
            { label: '教学周', value: `第 ${week} 周` },
            { label: '专注次数', value: sessions.length },
          ].map((s, i) => (
            <View key={s.label} style={{ flex: 1, alignItems: i === 1 ? 'center' : i === 2 ? 'flex-end' : 'flex-start' }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{s.value}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10.5, marginTop: 2 }}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <View style={{ marginTop: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Ionicons name="sparkles-outline" size={13} color={t.textTertiary} />
          <Text style={{ fontSize: 11.5, color: t.textTertiary }}>
            空闲教室是教务真实课表；电费 / 一卡通已接入学校一卡通页面
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {SERVICES.map((s) => (
            <GlassPressable
              key={s.key}
              disabled={s.soon}
              onPress={() => router.push(ROUTES[s.key] ?? (`/campus/${s.key}` as Href))}
              style={{ width: '31.5%', flexGrow: 1, opacity: s.soon ? 0.55 : 1 }}
              radiusValue={radius.md}
              intensity={18}
              contentStyle={{ paddingVertical: 15, paddingHorizontal: 12, gap: 9 }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  backgroundColor: `${s.color}18`,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={s.icon} size={18} color={s.color} />
              </View>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.text }}>{s.label}</Text>
              {s.hint ? (
                <Text style={{ fontSize: 9.5, color: t.textTertiary, marginTop: -3 }}>{s.hint}</Text>
              ) : null}
              {s.soon ? <Badge text="即将开放" /> : null}
            </GlassPressable>
          ))}
        </View>
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <SectionTitle title="设置" />
        <Card style={{ paddingVertical: 2, paddingHorizontal: 16 }}>
          <ListRow
            icon="color-palette-outline"
            title="外观"
            subtitle={settings.theme === 'system' ? '跟随系统' : settings.theme === 'dark' ? '深色' : '浅色'}
            onPress={() => router.push('/settings')}
          />
          <View style={{ height: 1, backgroundColor: t.border }} />
          <ListRow
            icon="calendar-outline"
            title="学期与周次"
            subtitle={`${settings.termName} · 共 ${settings.totalWeeks} 周`}
            onPress={() => router.push('/settings')}
          />
          <View style={{ height: 1, backgroundColor: t.border }} />
          <ListRow
            icon="cloud-download-outline"
            title="教务课表导入"
            subtitle="导入学校教务系统的课程"
            onPress={() => router.push('/import')}
          />
          <View style={{ height: 1, backgroundColor: t.border }} />
          <ListRow icon="information-circle-outline" title="关于川农口袋" onPress={() => router.push('/about')} />
        </Card>
      </View>

      <Text style={{ textAlign: 'center', fontSize: 11, color: t.textTertiary, marginTop: spacing.xl }}>
        {`川农口袋 v${APP_VERSION} · 四川农业大学校园助手`}
      </Text>
    </ScrollView>
  );
}
