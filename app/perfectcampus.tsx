import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Card, GhostButton, PrimaryButton, SectionTitle } from '@/components/UIKit';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

/**
 * 完美校园（宿舍电费 / 校园卡）说明页。
 *
 * 这一页不是「还没做完」，是「做不了」：三条路都试过了，写清楚原因，免得以后
 * 又有人花时间重试。
 *  1. 接口：api.17wanxiao.com 公网不可访问（两个 A 记录 443 全超时），
 *     App 真正用的 app.17wanxiao.com 没有公开文档。
 *  2. 抓包：App 有加固，检测到系统代理/自签证书就弹「安全环境未配置成功」，
 *     请求在本地就被拦住，一条都没发出来。
 *  3. 微信「智慧川农」里的一卡通：全部走微信私有加密通道（抓到的只有
 *     szextshort.weixin.qq.com/mmtls 这类混淆请求），拆不开。
 */

const TRIED = [
  {
    title: '直接调它的接口',
    detail: 'api.17wanxiao.com 公网连不上（两个 IP 的 443 都超时），App 实际用的 app.17wanxiao.com 没有公开文档。',
  },
  {
    title: '抓包逆向',
    detail: 'App 带加固，检测到系统代理或自签证书就直接弹「安全环境未配置成功」，请求在本地就被拦下，一条也不会发出来。',
  },
  {
    title: '借用微信里的一卡通',
    detail: '「智慧川农」里的一卡通页面走微信自己的加密通道，抓到的只有 wx.qq.com/mmtls 这类混淆流量，拆不开。',
  },
];

export default function PerfectCampusScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  function open(url: string) {
    void Linking.openURL(url).catch(() => {});
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: spacing.lg,
          paddingTop: 8,
          paddingBottom: 6,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: t.text }}>完美校园</Text>
          <Text style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 1 }}>宿舍电费 / 校园卡</Text>
        </View>
        <Badge text="在 App 内查看" tone="warn" />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: 6, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <Card style={{ backgroundColor: t.primarySoft, borderColor: 'transparent' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.primaryDark }}>
            电费和校园卡目前只能在完美校园里看
          </Text>
          <Text style={{ fontSize: 12.5, color: t.text, lineHeight: 20, marginTop: 8 }}>
            我们试了三种自动取数的办法，都被挡住了（下面写了具体原因）。所以本 App 里的电费余额、
            一卡通流水都是演示数据，真实数据请到完美校园 App 里查；点下面的按钮可以直接打开。
          </Text>
        </Card>

        <SectionTitle title="试过、但走不通的三条路" />
        <Card style={{ paddingVertical: 4 }}>
          {TRIED.map((item, i) => (
            <View
              key={item.title}
              style={{
                paddingVertical: 12,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: t.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="close-circle" size={16} color="#C0392B" />
                <Text style={{ fontSize: 13.5, fontWeight: '600', color: t.text }}>{item.title}</Text>
              </View>
              <Text style={{ fontSize: 11.5, color: t.textSecondary, lineHeight: 18, marginTop: 5, paddingLeft: 24 }}>
                {item.detail}
              </Text>
            </View>
          ))}
        </Card>

        <SectionTitle title="去完美校园查" />
        <PrimaryButton
          label="打开完美校园官网"
          icon="open-outline"
          onPress={() => open('https://www.17wanxiao.com/')}
        />
        <View style={{ marginTop: 10 }}>
          <GhostButton
            label="在 App Store 里搜「完美校园」"
            icon="logo-apple"
            onPress={() => open('https://apps.apple.com/cn/search?term=%E5%AE%8C%E7%BE%8E%E6%A0%A1%E5%9B%AD')}
          />
        </View>

        <Card style={{ marginTop: spacing.xl, backgroundColor: t.surfaceAlt, borderColor: 'transparent' }}>
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.textSecondary }}>什么情况可以再试</Text>
          <Text style={{ fontSize: 11.5, color: t.textTertiary, lineHeight: 18, marginTop: 8 }}>
            1. 完美校园哪天开放了接口文档，或者学校把一卡通查询页做成公开页面（像教务处的教室课表那样）；
            {'\n'}
            2. 学校信息中心愿意给第三方授权（走正式申请，不是抓包）；
            {'\n'}
            3. 你自己拿到接口说明（URL + 请求头 + 返回样例），发给我就能接，接入方式见 docs/sicau-api.md。
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}
