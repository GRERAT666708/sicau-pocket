import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Screen, SectionTitle } from '@/components/UIKit';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

const STORED = [
  '课表（课程、时段、周次、教室）',
  '专注记录与番茄钟设置',
  '偏好设置（主题、学期、校区、专业、姓名）',
  '空闲教室缓存（教室列表 + 各教室整学期课表）',
  '一卡通的 openid（用于在内嵌网页里打开学校页面）',
];

const ONLINE = [
  ['教务系统', 'jiaowu.sicau.edu.cn', '导入课表 / 成绩、抓教室课表（公开页面）'],
  ['校园 VPN', 'webvpn.sicau.edu.cn', '校外访问教务时由它在中间转发'],
  ['一卡通服务', 'yktwechat.sicau.edu.cn', '余额、流水、电费充值（学校官方 H5）'],
  ['版本检查（本项目的静态站）', 'sicau-pocket.com', '取一份 version.json 判断有没有新版本；请求里不带设备信息、不带账号，失败也不影响任何功能'],
];

export default function PrivacyScreen() {
  const t = useTheme();
  const router = useRouter();

  return (
    <Screen background={t.bg}>
      <View style={{ paddingTop: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 20, color: t.text }}>‹</Text>
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '700', color: t.text }}>隐私说明</Text>
      </View>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ fontSize: 12.5, color: t.textSecondary, lineHeight: 21 }}>
          这个 App 没有服务器、没有账号体系，也没有任何统计埋点。你看到的所有数据要么存在本机，
          要么是直接从学校自己的系统里取回来当场展示的。
        </Text>
      </Card>

      <View style={{ marginTop: spacing.lg }}>
        <SectionTitle title="存在本机的东西" />
        <Card style={{ gap: 8 }}>
          {STORED.map((item) => (
            <View key={item} style={{ flexDirection: 'row', gap: 8 }}>
              <Ionicons name="checkmark-circle" size={15} color={t.primary} style={{ marginTop: 2 }} />
              <Text style={{ flex: 1, fontSize: 12.5, color: t.textSecondary, lineHeight: 20 }}>{item}</Text>
            </View>
          ))}
          <Text style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 4, lineHeight: 18 }}>
            全部放在 AsyncStorage 里（键前缀 @sicau-pocket/），卸载 App 就没了。
          </Text>
        </Card>
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <SectionTitle title="什么时候会联网" />
        <Card style={{ gap: 10 }}>
          {ONLINE.map(([name, host, why]) => (
            <View key={host} style={{ gap: 2 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: t.text }}>{name}</Text>
              <Text style={{ fontSize: 11.5, color: t.textTertiary }}>{host}</Text>
              <Text style={{ fontSize: 12, color: t.textSecondary, lineHeight: 19 }}>{why}</Text>
            </View>
          ))}
          <Text style={{ fontSize: 11.5, color: t.textTertiary, lineHeight: 18 }}>
            前三条是学校自己的系统，直连；最后一条是本项目的纯静态站点，只用来提示新版本。
            不想让它自动联网，可以在「设置 → 自动检查更新」关掉，之后只有你手动点「检查更新」才会请求。
          </Text>
        </Card>
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <SectionTitle title="不收集 / 不上传" />
        <Card style={{ gap: 6 }}>
          {[
            '不收集手机号、设备号、IMEI、位置',
            '不做行为统计、不接广告 SDK',
            '教务与一卡通的密码不在 App 里输入、也不保存',
            '一卡通 openid 只在打开学校网页时使用，不会发到其他地方',
          ].map((item) => (
            <View key={item} style={{ flexDirection: 'row', gap: 8 }}>
              <Ionicons name="remove-circle-outline" size={15} color={t.textTertiary} style={{ marginTop: 2 }} />
              <Text style={{ flex: 1, fontSize: 12.5, color: t.textSecondary, lineHeight: 20 }}>{item}</Text>
            </View>
          ))}
        </Card>
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <SectionTitle title="想清掉数据" />
        <Card style={{ gap: 6 }}>
          <Text style={{ fontSize: 12.5, color: t.textSecondary, lineHeight: 20 }}>
            设置 → 数据 → 「恢复初始状态」会清空课表、专注记录与全部设置；
            「校园卡 → 解除绑定」会删掉本机保存的 openid；教室缓存可以在「空闲教室 → 同步」里重取。
          </Text>
        </Card>
      </View>

      <Text style={{ fontSize: 11, color: t.textTertiary, textAlign: 'center', marginTop: spacing.xl, lineHeight: 17 }}>
        非官方客户端，仅用于个人学习与自用。{`\n`}涉及账号、金额的操作请以学校官方系统为准。
      </Text>
    </Screen>
  );
}
