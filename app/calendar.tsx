import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Card, SectionTitle } from '@/components/UIKit';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { addDays, formatMD, weekDates, weekdayCN } from '@/lib/date';
import { currentWeek, useAppState } from '@/lib/store';
import { entriesForWeek } from '@/lib/schedule';

/** 教务处校历图片（公开，不用登录）：xl<学年>.png，学年按开学日期推 */
function xiaoliRange(termStart: string): string {
  const d = new Date(termStart);
  const y = Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  const startYear = d.getMonth() + 1 >= 8 ? y : y - 1;
  return `${startYear}-${startYear + 1}`;
}

const XIAOLI_LOCAL = require('../assets/images/xiaoli-2026-2027.png');
const XIAOLI_ASPECT = 1275 / 899;

/**
 * 校历（学期周历）。
 *
 * 学校的正式校历是 PDF/表格，节假日每年不同；这里按「开学日期 + 总周数」推算每一周的
 * 起止日期，并把每周的课程数算出来，用来定位"现在是第几周、这周有什么课"。
 */
export default function CalendarScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, courses } = useAppState();

  const now = new Date();
  const thisWeek = currentWeek(settings);
  const weeks = useMemo(() => {
    const list: { week: number; start: Date; end: Date; count: number }[] = [];
    for (let w = 1; w <= settings.totalWeeks; w += 1) {
      const dates = weekDates(settings.termStart, w);
      const start = dates[0] ?? now;
      list.push({
        week: w,
        start,
        end: addDays(start, 6),
        count: entriesForWeek(courses, w).length,
      });
    }
    return list;
  }, [settings.termStart, settings.totalWeeks, courses, now]);

  const termStart = weekDates(settings.termStart, 1)[0] ?? now;
  const range = xiaoliRange(settings.termStart);
  const remoteUrl = `https://jiaowu.sicau.edu.cn/web/web/web/xl${range}.png`;
  const [zoom, setZoom] = useState(false);
  const [remoteFailed, setRemoteFailed] = useState(false);
  const { width: winWidth, height: winHeight } = useWindowDimensions();

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
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/me'))} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: t.text }}>校历</Text>
          <Text style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 1 }}>{settings.termName}</Text>
        </View>
        <Badge text={`第 ${Math.max(1, thisWeek)} 周`} tone="primary" />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: 6, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <Card style={{ backgroundColor: t.primarySoft, borderColor: 'transparent' }}>
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: t.primaryDark }}>
            开学：{formatMD(termStart)}（{weekdayCN(termStart)}）· 共 {settings.totalWeeks} 周
          </Text>
          <Text style={{ fontSize: 12, color: t.text, lineHeight: 19, marginTop: 6 }}>
            按开学日期推算的周历。学校的正式校历（含国庆、元旦调休）以教务处通知为准，
            开学日期在「设置 → 学期与周次」里可以改。
          </Text>
        </Card>

        <SectionTitle title="教务网校历" action="看大图" onAction={() => setZoom(true)} />
        <Card style={{ padding: 8 }}>
          <Pressable onPress={() => setZoom(true)}>
            <Image
              source={remoteFailed ? XIAOLI_LOCAL : { uri: remoteUrl }}
              style={{ width: '100%', aspectRatio: XIAOLI_ASPECT, borderRadius: 10 }}
              resizeMode="contain"
              onError={() => setRemoteFailed(true)}
            />
          </Pressable>
          <Text style={{ fontSize: 10.5, color: t.textTertiary, lineHeight: 16, marginTop: 6 }}>
            {remoteFailed
              ? `没连上教务网，先用随 App 打包的 ${range === '2026-2027' ? '2026-2027' : range} 学年校历`
              : `来源：教务处 xl${range}.png · 作息时间表、节假日、报到注册时间都在这张图上`}
          </Text>
        </Card>

        <SectionTitle title="每周" />
        <Card style={{ paddingVertical: 2, paddingHorizontal: 16 }}>
          {weeks.map((w, i) => {
            const isNow = w.week === thisWeek;
            return (
              <View
                key={w.week}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 11,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: t.border,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 30,
                    borderRadius: 9,
                    backgroundColor: isNow ? t.primary : t.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontWeight: '700',
                      color: isNow ? '#fff' : t.textSecondary,
                    }}
                  >
                    {w.week}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13.5, color: t.text }}>
                    {isNow ? '本周 · ' : ''}
                    {formatMD(w.start)} – {formatMD(w.end)}
                  </Text>
                  <Text style={{ fontSize: 11, color: t.textTertiary, marginTop: 2 }}>
                    {w.count > 0 ? `${w.count} 节课` : '没有课'}
                  </Text>
                </View>
                {isNow ? <Ionicons name="ellipse" size={8} color={t.primary} /> : null}
              </View>
            );
          })}
        </Card>
      </ScrollView>

      <Modal
        visible={zoom}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setZoom(false)}
      >
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#060907' }]}>
          <ScrollView
            maximumZoomScale={3}
            minimumZoomScale={1}
            contentContainerStyle={{
              paddingTop: insets.top + 8,
              paddingBottom: 48,
            }}
            style={{ flex: 1 }}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Image
                source={remoteFailed ? XIAOLI_LOCAL : { uri: remoteUrl }}
                style={{ width: winWidth * 2.4, height: (winWidth * 2.4) / XIAOLI_ASPECT }}
                resizeMode="contain"
                onError={() => setRemoteFailed(true)}
              />
            </ScrollView>
          </ScrollView>
          <Pressable
            onPress={() => setZoom(false)}
            style={{
              position: 'absolute',
              top: insets.top + 12,
              right: 18,
              width: 40,
              height: 40,
              borderRadius: 20,
              zIndex: 10,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.35)',
              backgroundColor: 'rgba(0,0,0,0.6)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <Text
            style={{
              position: 'absolute',
              bottom: 28,
              left: 0,
              right: 0,
              textAlign: 'center',
              color: 'rgba(255,255,255,0.7)',
              fontSize: 11,
            }}
          >
            左右拖动查看 · 点右上角关闭
          </Text>
        </View>
      </Modal>
    </View>
  );
}
