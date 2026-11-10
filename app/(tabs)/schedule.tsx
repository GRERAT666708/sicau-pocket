import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBackground } from '@/components/AppBackground';
import { Card, PrimaryButton } from '@/components/UIKit';
import { courseColors, radius, spacing } from '@/constants/theme';
import { dayIndex, formatMD, isoDate, weekDates } from '@/lib/date';

const COL_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
import { PERIODS, PERIOD_GROUPS } from '@/lib/periods';
import { currentWeek, useAppState } from '@/lib/store';
import { mergeEntries, slotSpan } from '@/lib/schedule';
import { useTheme } from '@/hooks/useTheme';

const TIME_COL = 32;
const GROUP_COL = 12;
const HEADER_H = 48;
const ROW_H = 52;

export default function ScheduleScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  // 先按窗口估一个，拿到网格实际宽度后再用它均分 7 列（保证刚好好铺满，不留白）
  const [gridW, setGridW] = useState(0);
  const colW = gridW > 0
    ? Math.floor(gridW / 7)
    : Math.floor((winW - spacing.lg * 2 - TIME_COL - GROUP_COL) / 7);
  const { settings, courses } = useAppState();
  const [now] = useState(() => new Date());
  const rawWeek = currentWeek(settings, now);
  // 新学期还没开学时 rawWeek 会是负数，钳到第 1 周避免出现「第 -13 周」
  const thisWeek = Math.min(Math.max(rawWeek, 1), settings.totalWeeks);
  const [week, setWeek] = useState(thisWeek);
  // 换了学期（termStart 变）后自动跳到新学期的当前周
  useEffect(() => {
    setWeek(thisWeek);
  }, [settings.termStart, thisWeek]);

  const dates = useMemo(() => weekDates(settings.termStart, week), [settings.termStart, week]);
  const today = dayIndex(now);

  // 本周所有上课记录（按单双周筛过），同一门课相邻节次合并成一块
  const weekEntries = useMemo(
    () =>
      courses.flatMap((c) =>
        c.slots.filter((s) => s.weeks.includes(week)).map((s) => ({ course: c, slot: s })),
      ),
    [courses, week],
  );
  const blocks = useMemo(() => mergeEntries(weekEntries), [weekEntries]);
  // 这周不上、但课表里有的课：画成灰色虚线占位，避免误以为漏排
  const offWeek = useMemo(
    () =>
      courses.flatMap((c) =>
        c.slots.filter((s) => !s.weeks.includes(week)).map((s) => ({ course: c, slot: s })),
      ),
    [courses, week],
  );
  const total = weekEntries.reduce((n, e) => n + (e.slot.end - e.slot.start + 1), 0);

  return (
    <AppBackground>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: '700', color: t.text }}>课表</Text>
            <Text style={{ fontSize: 12, color: t.textTertiary, marginTop: 3 }}>{settings.termName}</Text>
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: t.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="options-outline" size={18} color={t.textSecondary} />
          </Pressable>
        </View>

        {settings.demoSeeded ? (
          <Pressable
            onPress={() => router.push('/import')}
            style={{
              marginTop: spacing.md,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingVertical: 11,
              paddingHorizontal: 12,
              borderRadius: radius.md,
              backgroundColor: t.primarySoft,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: t.border,
            }}
          >
            <Ionicons name="sparkles-outline" size={16} color={t.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: t.text }}>当前是演示课表</Text>
              <Text style={{ fontSize: 10.5, color: t.textSecondary, marginTop: 2 }}>
                这几门课是示例，导入你自己的课表后会自动替换
              </Text>
            </View>
            <Text style={{ fontSize: 12, fontWeight: '700', color: t.primary }}>去导入</Text>
            <Ionicons name="chevron-forward" size={14} color={t.primary} />
          </Pressable>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: spacing.lg,
            backgroundColor: t.surface,
            borderRadius: radius.md,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.border,
            paddingHorizontal: 6,
            paddingVertical: 6,
          }}
        >
          <Pressable onPress={() => setWeek((w) => Math.max(1, w - 1))} style={navBtn} hitSlop={6}>
            <Ionicons name="chevron-back" size={18} color={t.text} />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>
              第 {week} 周{week === thisWeek ? ' · 本周' : ''}
            </Text>
            <Text style={{ fontSize: 11, color: t.textTertiary, marginTop: 1 }}>
              {formatMD(dates[0])} ~ {formatMD(dates[6])}
            </Text>
          </View>
          <Pressable onPress={() => setWeek((w) => Math.min(settings.totalWeeks, w + 1))} style={navBtn} hitSlop={6}>
            <Ionicons name="chevron-forward" size={18} color={t.text} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <Text style={{ fontSize: 12, color: t.textTertiary }}>本周 {total} 节课</Text>
          {week !== thisWeek ? (
            <Pressable onPress={() => setWeek(thisWeek)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="today-outline" size={13} color={t.primary} />
              <Text style={{ fontSize: 12, color: t.primary, fontWeight: '600' }}>回到本周</Text>
            </Pressable>
          ) : (
            <Text style={{ fontSize: 12, color: t.textTertiary }}>一周一览</Text>
          )}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, marginTop: 10 }}
        contentContainerStyle={{ paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: GROUP_COL, paddingTop: HEADER_H }}>
            {PERIOD_GROUPS.map((g) => (
              <View
                key={g.label}
                style={{
                  height: (g.to - g.from + 1) * ROW_H,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 9,
                    letterSpacing: 1,
                    color: t.textTertiary,
                    transform: [{ rotate: '-90deg' }],
                    width: (g.to - g.from + 1) * ROW_H,
                    textAlign: 'center',
                  }}
                >
                  {g.label}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ width: TIME_COL, paddingTop: HEADER_H }}>
            {PERIODS.map((p) => (
              <View key={p.index} style={{ height: ROW_H, alignItems: 'center', paddingTop: 3 }}>
                <Text style={{ fontSize: 9.5, fontWeight: '700', color: t.textTertiary }}>{p.index}</Text>
                <Text style={{ fontSize: 7, color: t.textTertiary, marginTop: 2 }}>{p.start}</Text>
                <Text style={{ fontSize: 7, color: t.textTertiary, marginTop: 1 }}>{p.end}</Text>
              </View>
            ))}
          </View>

          <View style={{ flex: 1 }} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', height: HEADER_H, paddingBottom: 6, alignItems: 'flex-end' }}>
                {dates.map((d, i) => {
                  const isToday = isoDate(d) === isoDate(now);
                  return (
                    <View key={i} style={{ width: colW, alignItems: 'center', justifyContent: 'flex-end' }}>
                      <Text style={{ fontSize: 9.5, color: isToday ? t.primary : t.textTertiary }}>{COL_LABELS[i] ?? ''}</Text>
                      <View
                        style={{
                          marginTop: 3,
                          minWidth: 20,
                          height: 20,
                          paddingHorizontal: 3,
                          borderRadius: 8,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isToday ? t.primary : 'transparent',
                        }}
                      >
                        <Text style={{ fontSize: 10.5, fontWeight: isToday ? '700' : '500', color: isToday ? t.onPrimary : t.textSecondary }}>
                          {d.getDate()}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              <View style={{ height: PERIODS.length * ROW_H, position: 'relative' }}>
                {PERIODS.map((p, i) => (
                  <View
                    key={p.index}
                    style={{
                      position: 'absolute',
                      top: i * ROW_H,
                      left: 0,
                      right: 0,
                      height: ROW_H,
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: i % 4 === 0 ? t.border : `${t.border}99`,
                    }}
                  />
                ))}
                <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' }}>
                  {Array.from({ length: 7 }).map((_, i) => (
                    <View
                      key={i}
                      style={{
                        width: colW,
                        borderLeftWidth: StyleSheet.hairlineWidth,
                        borderLeftColor: i === 0 ? 'transparent' : `${t.border}80`,
                        backgroundColor: i + 1 === today ? `${t.primary}08` : 'transparent',
                      }}
                    />
                  ))}
                </View>

                {offWeek.map(({ course, slot }) => {
                  const { top, span } = slotSpan(slot.start, slot.end);
                  return (
                    <View
                      key={`off-${slot.id}`}
                      style={{
                        position: 'absolute',
                        top: top * ROW_H + 3,
                        height: span * ROW_H - 6,
                        left: (slot.day - 1) * colW + 2,
                        width: colW - 4,
                        borderRadius: 9,
                        paddingHorizontal: 3,
                        paddingVertical: 3,
                        overflow: 'hidden',
                        backgroundColor: `${t.surfaceAlt}CC`,
                        borderWidth: 1,
                        borderStyle: 'dashed',
                        borderColor: t.border,
                      }}
                    >
                      <Text style={{ fontSize: 8, fontWeight: '700', color: t.textTertiary }}>非本周</Text>
                      <Text
                        style={{ fontSize: 8.5, lineHeight: 11, color: t.textTertiary, marginTop: 2 }}
                        numberOfLines={span > 1 ? 5 : 1}
                      >
                        {course.name}
                      </Text>
                    </View>
                  );
                })}

                {blocks.map(({ course, slot }) => {
                  const { top, span } = slotSpan(slot.start, slot.end);
                  const c = courseColors(course.colorIndex, t.scheme);
                  const width = colW - 6;
                  return (
                    <Pressable
                      key={slot.id}
                      onPress={() => router.push(`/course/${course.id}`)}
                      style={({ pressed }) => ({
                        position: 'absolute',
                        top: top * ROW_H + 3,
                        height: span * ROW_H - 6,
                        left: (slot.day - 1) * colW + 3,
                        width,
                        backgroundColor: c.bg,
                        borderRadius: 9,
                        paddingHorizontal: 3,
                        paddingVertical: 3,
                        overflow: 'hidden',
                        opacity: pressed ? 0.75 : 1,
                        borderLeftWidth: 2,
                        borderLeftColor: c.fg,
                      })}
                    >
                      <Text style={{ fontSize: 9, lineHeight: 11.5, fontWeight: '700', color: c.fg }} numberOfLines={span > 1 ? 5 : 2}>
                        {course.name}
                      </Text>

                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </View>

        {courses.length === 0 ? (
          <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl }}>
            <Card>
              <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>课表还是空的</Text>
              <Text style={{ fontSize: 12.5, color: t.textSecondary, marginTop: 6, lineHeight: 19 }}>
                可以手动添加课程，也可以先导入一份示例课表（动物医学专业大一课表）看看效果。
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <PrimaryButton label="添加课程" icon="add" onPress={() => router.push('/course/edit')} style={{ flex: 1 }} />
                <Pressable
                  onPress={() => router.push('/settings')}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: t.surfaceAlt }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>导入示例</Text>
                </Pressable>
              </View>
            </Card>
          </View>
        ) : (
          <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="information-circle-outline" size={13} color={t.textTertiary} />
              <Text style={{ fontSize: 11.5, color: t.textTertiary }}>
                连排课程会自动合并单元格，点击课程查看详情
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={() => router.push('/course/edit')}
        style={({ pressed }) => ({
          position: 'absolute',
          right: 18,
          bottom: 100,
          width: 52,
          height: 52,
          borderRadius: 20,
          backgroundColor: t.primary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#04301B',
          shadowOpacity: 0.25,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Ionicons name="add" size={26} color={t.onPrimary} />
      </Pressable>
    </AppBackground>
  );
}

const navBtn = {
  width: 34,
  height: 34,
  borderRadius: 10,
  alignItems: 'center',
  justifyContent: 'center',
} as const;
