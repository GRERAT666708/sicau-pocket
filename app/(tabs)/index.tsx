import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBackground } from '@/components/AppBackground';
import { GlassPressable } from '@/components/Glass';
import { Badge, Card, SectionTitle } from '@/components/UIKit';
import { courseColors, radius, spacing } from '@/constants/theme';
import { formatCN, greeting, dayIndex, nowMinutes, weekdayCN, fmtHM } from '@/lib/date';
import { periodEnd, periodStart, periodRangeText } from '@/lib/periods';
import { currentWeek, todayCourses, useAppState } from '@/lib/store';
import { effectiveCampus } from '@/lib/campusState';
import { statusNow } from '@/lib/schedule';
import { focusSummary, todaySessions } from '@/lib/stats';
import { useTheme } from '@/hooks/useTheme';

const QUICK = [
  { key: 'focus', label: '开始专注', icon: 'timer-outline' as const, color: '#0E7A43' },
  { key: 'classroom', label: '空教室', icon: 'school-outline' as const, color: '#3E3A99' },
  { key: 'electricity', label: '电费', icon: 'flash-outline' as const, color: '#C97B2E' },
  { key: 'ecard', label: '一卡通', icon: 'card-outline' as const, color: '#9A2F47' },
];

export default function TodayScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, courses, sessions, user } = useAppState();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const week = currentWeek(settings, now);
  const today = dayIndex(now);
  const entries = useMemo(() => todayCourses(courses, today, week), [courses, today, week]);
  const totalPeriods = entries.reduce((sum, e) => sum + (e.slot.end - e.slot.start + 1), 0);
  const status = statusNow(entries, nowMinutes(now));
  const stats = focusSummary(sessions);
  const todayList = todaySessions(sessions);
  const todayMinutes = stats.todayMinutes;

  const campus = effectiveCampus(settings);

  return (
    <AppBackground>
      <LinearGradient
        colors={[t.primary, t.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 18,
          paddingBottom: 64,
          borderBottomLeftRadius: 30,
          borderBottomRightRadius: 30,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 9,
                backgroundColor: 'rgba(255,255,255,0.22)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="leaf" size={15} color="#fff" />
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '600', letterSpacing: 0.5 }}>
              川农口袋
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 99,
              backgroundColor: 'rgba(255,255,255,0.16)',
            }}
          >
            <Ionicons name="location" size={11} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 11.5 }}>{campus}校区</Text>
          </View>
        </View>

        <Text style={{ color: '#fff', fontSize: 23, fontWeight: '700', marginTop: 20, letterSpacing: 0.2 }}>
          {greeting(now)}，{settings.userName || user?.name ? `${settings.userName || user?.name}同学` : '同学'}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12.5, marginTop: 7 }}>
          {formatCN(now)} {weekdayCN(now)} · 第 {week} 教学周
        </Text>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1, marginTop: -46 }}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
      >
        <Card style={{ padding: 18 }}>
          {status.kind === 'class' ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Badge text="正在上课" tone="primary" />
                <Text style={{ fontSize: 12, color: t.textTertiary }}>距下课 {status.leftMinutes} 分钟</Text>
              </View>
              <Text style={{ fontSize: 20, fontWeight: '700', color: t.text, marginTop: 12 }}>{status.entry.course.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="time-outline" size={13} color={t.textSecondary} />
                  <Text style={{ fontSize: 12.5, color: t.textSecondary }}>
                    {periodRangeText(status.entry.slot.start, status.entry.slot.end)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="location-outline" size={13} color={t.textSecondary} />
                  <Text style={{ fontSize: 12.5, color: t.textSecondary }}>
                    {status.entry.slot.room ?? status.entry.course.room ?? '地点待定'}
                  </Text>
                </View>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surfaceAlt, marginTop: 16, overflow: 'hidden' }}>
                <View style={{ height: 6, width: `${Math.round(status.progress * 100)}%`, backgroundColor: t.primary, borderRadius: 3 }} />
              </View>
              <Text style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 8 }}>
                已进行 {Math.round(status.progress * 100)}% · 还剩 {status.leftMinutes} 分钟
              </Text>
            </>
          ) : status.kind === 'break' ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Badge text="课间休息" tone="warn" />
                <Text style={{ fontSize: 12, color: t.textTertiary }}>{status.startInMinutes} 分钟后上课</Text>
              </View>
              <Text style={{ fontSize: 20, fontWeight: '700', color: t.text, marginTop: 12 }}>{status.next.course.name}</Text>
              <Text style={{ fontSize: 12.5, color: t.textSecondary, marginTop: 6 }}>
                {periodRangeText(status.next.slot.start, status.next.slot.end)} ·{' '}
                {status.next.slot.room ?? status.next.course.room ?? '地点待定'}
              </Text>
              <Pressable
                onPress={() => router.push('/focus')}
                style={{
                  marginTop: 14,
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 99,
                  backgroundColor: t.primarySoft,
                }}
              >
                <Ionicons name="timer-outline" size={14} color={t.primary} />
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.primary }}>课间专注一会儿</Text>
              </Pressable>
            </>
          ) : status.kind === 'done' ? (
            <>
              <Badge text="今天的课已结束" />
              <Text style={{ fontSize: 18, fontWeight: '700', color: t.text, marginTop: 12 }}>今天辛苦了</Text>
              <Text style={{ fontSize: 12.5, color: t.textSecondary, marginTop: 6 }}>
                今天共 {entries.length} 门课（{totalPeriods} 节）· 今日专注 {todayMinutes} 分钟
              </Text>
            </>
          ) : (
            <>
              <Badge text="今天没课" />
              <Text style={{ fontSize: 18, fontWeight: '700', color: t.text, marginTop: 12 }}>自由安排的一天</Text>
              <Text style={{ fontSize: 12.5, color: t.textSecondary, marginTop: 6 }}>
                可以去图书馆坐坐，或者把课表补全
              </Text>
              <Pressable
                onPress={() => router.push('/schedule')}
                style={{ marginTop: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Text style={{ fontSize: 13, color: t.primary, fontWeight: '600' }}>去添加课程</Text>
                <Ionicons name="arrow-forward" size={13} color={t.primary} />
              </Pressable>
            </>
          )}
        </Card>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.lg }}>
          {QUICK.map((q) => (
            <GlassPressable
              key={q.key}
              onPress={() => {
                if (q.key === 'focus') router.push('/focus');
                else if (q.key === 'electricity' || q.key === 'ecard') router.push('/ecard');
                else router.push(`/campus/${q.key}`);
              }}
              style={{ flex: 1 }}
              radiusValue={radius.md}
              intensity={18}
              contentStyle={{ paddingVertical: 14, alignItems: 'center', gap: 8 }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: `${q.color}18`,
                }}
              >
                <Ionicons name={q.icon} size={18} color={q.color} />
              </View>
              <Text style={{ fontSize: 11.5, color: t.text, fontWeight: '500' }}>{q.label}</Text>
            </GlassPressable>
          ))}
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <SectionTitle
            title="今日日程"
            action={entries.length ? '去课表看' : undefined}
            onAction={() => router.push('/schedule')}
          />
          {entries.length === 0 ? (
            <Card>
              <Text style={{ fontSize: 13, color: t.textSecondary, textAlign: 'center', paddingVertical: 12 }}>
                今天没有安排，好好休息 🌿
              </Text>
            </Card>
          ) : (
            <View>
              {entries.map((e, i) => {
                const c = courseColors(e.course.colorIndex, t.scheme);
                const isNow = status.kind === 'class' && status.entry.slot.id === e.slot.id;
                return (
                  <Pressable
                    key={e.slot.id}
                    onPress={() => router.push(`/course/${e.course.id}`)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      gap: 12,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <View style={{ width: 44, alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: isNow ? t.primary : t.textSecondary, marginTop: 12 }}>
                        {fmtHM(periodStart(e.slot.start))}
                      </Text>
                      <View style={{ flex: 1, width: 1.5, backgroundColor: t.border, marginTop: 6 }} />
                    </View>
                    <View
                      style={{
                        flex: 1,
                        backgroundColor: isNow ? c.bg : t.surface,
                        borderRadius: radius.md,
                        padding: 14,
                        marginBottom: 10,
                        borderLeftWidth: 3,
                        borderLeftColor: c.fg,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: isNow ? c.fg : t.border,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: t.text, flex: 1 }} numberOfLines={1}>
                          {e.course.name}
                        </Text>
                        {isNow ? <Badge text="进行中" tone="primary" /> : null}
                      </View>
                      <Text style={{ fontSize: 12, color: t.textSecondary, marginTop: 5 }}>
                        {fmtHM(periodStart(e.slot.start))}–{fmtHM(periodEnd(e.slot.end))} · 第{e.slot.start}-{e.slot.end}节
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <Ionicons name="location-outline" size={12} color={t.textTertiary} />
                        <Text style={{ fontSize: 12, color: t.textTertiary }}>
                          {e.slot.room ?? e.course.room ?? '地点待定'}
                          {e.course.teacher ? ` · ${e.course.teacher}` : ''}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.md }}>
          <Card style={{ flex: 1, paddingVertical: 16 }}>
            <Text style={{ fontSize: 11.5, color: t.textTertiary }}>今日专注</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: t.text }}>{todayMinutes}</Text>
              <Text style={{ fontSize: 11.5, color: t.textTertiary }}>分钟</Text>
            </View>
            <Text style={{ fontSize: 11, color: t.textTertiary, marginTop: 4 }}>{todayList.length} 次记录</Text>
          </Card>
          <Card style={{ flex: 1, paddingVertical: 16 }}>
            <Text style={{ fontSize: 11.5, color: t.textTertiary }}>连续专注</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: t.text }}>{stats.streak}</Text>
              <Text style={{ fontSize: 11.5, color: t.textTertiary }}>天</Text>
            </View>
            <Text style={{ fontSize: 11, color: t.textTertiary, marginTop: 4 }}>本周 {stats.weekMinutes} 分钟</Text>
          </Card>
        </View>
      </ScrollView>
    </AppBackground>
  );
}
