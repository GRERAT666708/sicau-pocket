import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Card, GhostButton, ListRow, SectionTitle } from '@/components/UIKit';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { APP_VERSION } from '@/lib/version';

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string }[] = [
  { icon: 'sunny-outline', title: '今天', desc: '一眼看清现在上什么课、还有多久下课' },
  { icon: 'calendar-outline', title: '课表', desc: '10 节次网格（按教务处作息）、单双周、多时段课程' },
  { icon: 'timer-outline', title: '专注', desc: '番茄钟 + 热力图，记录每天的专注时长' },
  { icon: 'flash-outline', title: '校园服务', desc: '电费/一卡通（真实数据）、图书馆座位、空闲教室（教务真实课表）' },
];

export default function AboutScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={t.text} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>关于</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 24,
              backgroundColor: t.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="leaf" size={36} color={t.onPrimary} />
          </View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: t.text, marginTop: 14 }}>川农口袋</Text>
          <Text style={{ fontSize: 12, color: t.textTertiary, marginTop: 4 }}>{`四川农业大学校园助手 · v${APP_VERSION}`}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Badge text="iOS / Android / Web" />
            <Badge text="MIT" />
          </View>
        </View>

        <Card>
          <Text style={{ fontSize: 13, color: t.textSecondary, lineHeight: 21 }}>
            一个为川农同学做的轻量校园 App：查课表、算空闲、记专注、看电费和饭卡。
            参考了开源项目 ZZUPocket 的产品思路，用 Expo + React Native 重写为跨平台版本。
          </Text>
        </Card>

        <View style={{ marginTop: spacing.xl }}>
          <SectionTitle title="功能" />
          <Card style={{ paddingVertical: 6 }}>
            {FEATURES.map((f, i) => (
              <View key={f.title}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 12,
                      backgroundColor: t.primarySoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name={f.icon} size={17} color={t.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>{f.title}</Text>
                    <Text style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 2 }}>{f.desc}</Text>
                  </View>
                </View>
                {i < FEATURES.length - 1 ? <View style={{ height: 1, backgroundColor: t.border }} /> : null}
              </View>
            ))}
          </Card>
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <SectionTitle title="隐私" />
          <Card>
            <Text style={{ fontSize: 12.5, color: t.textSecondary, lineHeight: 20 }}>
              所有课程、专注记录与个人设置都保存在本机（AsyncStorage），不会上传。
              登录都在学校自己的网页里完成，App 不接触密码。
            </Text>
            <GhostButton
              label="查看完整隐私说明"
              icon="shield-checkmark-outline"
              onPress={() => router.push('/privacy')}
              style={{ marginTop: 10 }}
            />
          </Card>
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <SectionTitle title="链接" />
          <Card style={{ paddingVertical: 2, paddingHorizontal: 16 }}>
            <ListRow
              icon="logo-github"
              title="ZZUPocket（参考项目）"
              subtitle="3beuml/ZZUPocket · Kotlin + Compose"
              onPress={() => Linking.openURL('https://github.com/3beuml/ZZUPocket').catch(() => {})}
            />
            <View style={{ height: 1, backgroundColor: t.border }} />
            <ListRow
              icon="school-outline"
              title="四川农业大学"
              subtitle="www.sicau.edu.cn"
              onPress={() => Linking.openURL('https://www.sicau.edu.cn').catch(() => {})}
            />
            <View style={{ height: 1, backgroundColor: t.border }} />
            <ListRow
              icon="shield-checkmark-outline"
              title="川农e认证"
              subtitle="auth.sicau.edu.cn"
              onPress={() => Linking.openURL('https://auth.sicau.edu.cn').catch(() => {})}
            />
          </Card>
        </View>

        <Text style={{ textAlign: 'center', fontSize: 10.5, color: t.textTertiary, marginTop: spacing.xl, lineHeight: 17 }}>
          本项目为个人学习作品，与四川农业大学官方无关{'\n'}如涉及数据接口，请遵守学校相关管理规定
        </Text>
      </ScrollView>
    </View>
  );
}
