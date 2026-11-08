import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Card, GhostButton, PrimaryButton, SectionTitle } from '@/components/UIKit';
import { courseColors, radius, spacing } from '@/constants/theme';
import { WEEKDAY_LABELS, weeksToText } from '@/lib/date';
import { periodRangeText } from '@/lib/periods';
import { actions, useAppState } from '@/lib/store';
import { useTheme } from '@/hooks/useTheme';

export default function CourseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { courses } = useAppState();
  const [confirming, setConfirming] = useState(false);
  const course = courses.find((c) => c.id === id);

  if (!course) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <Text style={{ fontSize: 15, color: t.textSecondary }}>课程不存在或已被删除</Text>
        <GhostButton label="返回" onPress={() => router.back()} />
      </View>
    );
  }

  const c = courseColors(course.colorIndex, t.scheme);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: spacing.md, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: 8 }}>
          <Ionicons name="close" size={22} color={t.text} />
        </Pressable>
        <Pressable onPress={() => router.push(`/course/edit?id=${course.id}`)} hitSlop={10} style={{ padding: 8 }}>
          <Text style={{ fontSize: 14, color: t.primary, fontWeight: '600' }}>编辑</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <View style={{ backgroundColor: c.bg, borderRadius: 20, padding: 20 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: c.fg }}>{course.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}>
            {course.teacher ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="person-outline" size={13} color={c.fg} />
                <Text style={{ fontSize: 12.5, color: c.fg, opacity: 0.85 }}>{course.teacher}</Text>
              </View>
            ) : null}
            {course.room ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="location-outline" size={13} color={c.fg} />
                <Text style={{ fontSize: 12.5, color: c.fg, opacity: 0.85 }}>{course.room}</Text>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Badge text={`${course.slots.length} 个上课时段`} />
            <Badge text={weeksToText(Array.from(new Set(course.slots.flatMap((s) => s.weeks))))} />
          </View>
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <SectionTitle title="上课时间" />
          <View style={{ gap: 10 }}>
            {course.slots
              .slice()
              .sort((a, b) => a.day - b.day || a.start - b.start)
              .map((slot) => (
                <Card key={slot.id} style={{ paddingVertical: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        backgroundColor: `${c.fg}14`,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 15, fontWeight: '700', color: c.fg }}>周{WEEKDAY_LABELS[slot.day - 1]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>
                        第 {slot.start}-{slot.end} 节
                      </Text>
                      <Text style={{ fontSize: 12, color: t.textTertiary, marginTop: 2 }}>
                        {periodRangeText(slot.start, slot.end)} · {slot.room ?? course.room ?? '地点待定'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, color: t.textTertiary }}>{weeksToText(slot.weeks)}</Text>
                  </View>
                </Card>
              ))}
          </View>
        </View>

        {course.note ? (
          <View style={{ marginTop: spacing.xl }}>
            <SectionTitle title="备注" />
            <Card>
              <Text style={{ fontSize: 13, color: t.textSecondary, lineHeight: 21 }}>{course.note}</Text>
            </Card>
          </View>
        ) : null}

        <View style={{ marginTop: spacing.xl, gap: 10 }}>
          <PrimaryButton label="编辑课程" icon="create-outline" onPress={() => router.push(`/course/edit?id=${course.id}`)} />
          {confirming ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <GhostButton label="取消" style={{ flex: 1 }} onPress={() => setConfirming(false)} />
              <Pressable
                onPress={() => {
                  actions.removeCourse(course.id);
                  router.back();
                }}
                style={{
                  flex: 1,
                  borderRadius: radius.md,
                  backgroundColor: t.danger,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 13,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>确认删除</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setConfirming(true)}
              style={{ alignItems: 'center', paddingVertical: 12 }}
            >
              <Text style={{ fontSize: 13.5, color: t.danger }}>删除这门课</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
