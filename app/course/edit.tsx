import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, PrimaryButton } from '@/components/UIKit';
import { courseColors, coursePalette, radius, spacing } from '@/constants/theme';
import { parseWeeks, WEEKDAY_LABELS, weeksToText } from '@/lib/date';
import { PERIOD_COUNT } from '@/lib/periods';
import { actions, uid, useAppState } from '@/lib/store';
import type { Course, CourseSlot } from '@/lib/types';
import { useTheme } from '@/hooks/useTheme';

export default function CourseEdit() {
  const params = useLocalSearchParams<{ id?: string; day?: string; start?: string }>();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { courses, settings } = useAppState();
  const editing = params.id ? courses.find((c) => c.id === params.id) : undefined;

  const [name, setName] = useState(editing?.name ?? '');
  const [teacher, setTeacher] = useState(editing?.teacher ?? '');
  const [room, setRoom] = useState(editing?.room ?? '');
  const [colorIndex, setColorIndex] = useState(editing?.colorIndex ?? Math.floor(Math.random() * coursePalette.length));
  const [note, setNote] = useState(editing?.note ?? '');
  const [slots, setSlots] = useState<CourseSlot[]>(
    editing?.slots ?? [
      {
        id: uid('slot'),
        day: Number(params.day) || 1,
        start: Number(params.start) || 1,
        end: Math.min(PERIOD_COUNT, (Number(params.start) || 1) + 1),
        weeks: Array.from({ length: settings.totalWeeks }, (_, i) => i + 1),
      },
    ],
  );
  const [weekTexts, setWeekTexts] = useState<Record<string, string>>(
    Object.fromEntries((editing?.slots ?? []).map((s) => [s.id, weeksToText(s.weeks)])),
  );
  const [error, setError] = useState('');

  const patchSlot = (id: string, patch: Partial<CourseSlot>) =>
    setSlots((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const onSave = () => {
    if (!name.trim()) {
      setError('请填写课程名称');
      return;
    }
    if (slots.length === 0) {
      setError('至少需要一个上课时段');
      return;
    }
    const finalSlots = slots.map((s) => {
      const text = weekTexts[s.id];
      const weeks = text ? parseWeeks(text) : s.weeks;
      return { ...s, weeks: weeks.length ? weeks : s.weeks, start: Math.min(s.start, s.end), end: Math.max(s.start, s.end) };
    });
    const course: Course = {
      id: editing?.id ?? uid('course'),
      name: name.trim(),
      teacher: teacher.trim() || undefined,
      room: room.trim() || undefined,
      colorIndex,
      slots: finalSlots,
      note: note.trim() || undefined,
    };
    if (editing) actions.updateCourse(course);
    else actions.addCourse(course);
    router.back();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: t.bg }}
    >
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingHorizontal: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: 8 }}>
          <Ionicons name="close" size={22} color={t.text} />
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>{editing ? '编辑课程' : '添加课程'}</Text>
        <Pressable onPress={onSave} hitSlop={10} style={{ padding: 8 }}>
          <Text style={{ fontSize: 15, color: t.primary, fontWeight: '700' }}>保存</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
        <Field label="课程名称">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="例如：动物解剖学"
            placeholderTextColor={t.textTertiary}
            style={inputStyle(t)}
          />
        </Field>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="任课教师">
              <TextInput
                value={teacher}
                onChangeText={setTeacher}
                placeholder="选填"
                placeholderTextColor={t.textTertiary}
                style={inputStyle(t)}
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="上课地点">
              <TextInput
                value={room}
                onChangeText={setRoom}
                placeholder="例如：A101"
                placeholderTextColor={t.textTertiary}
                style={inputStyle(t)}
              />
            </Field>
          </View>
        </View>

        <Field label="课程颜色">
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {coursePalette.map((_, i) => {
              const active = colorIndex === i;
              const c = courseColors(i, t.scheme);
              return (
                <Pressable
                  key={i}
                  onPress={() => setColorIndex(i)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 12,
                    backgroundColor: c.bg,
                    borderWidth: 2,
                    borderColor: active ? c.fg : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {active ? <Ionicons name="checkmark" size={16} color={c.fg} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Field>

        <View style={{ marginTop: spacing.lg, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.text }}>上课时段</Text>
          <Pressable
            onPress={() =>
              setSlots((list) => [
                ...list,
                { id: uid('slot'), day: 1, start: 1, end: 2, weeks: Array.from({ length: settings.totalWeeks }, (_, i) => i + 1) },
              ])
            }
            style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
          >
            <Ionicons name="add-circle-outline" size={15} color={t.primary} />
            <Text style={{ fontSize: 12.5, color: t.primary, fontWeight: '600' }}>增加时段</Text>
          </Pressable>
        </View>

        {slots.map((slot, index) => (
          <Card key={slot.id} style={{ marginBottom: 10, padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12.5, color: t.textTertiary }}>时段 {index + 1}</Text>
              {slots.length > 1 ? (
                <Pressable onPress={() => setSlots((list) => list.filter((s) => s.id !== slot.id))} hitSlop={8}>
                  <Ionicons name="trash-outline" size={16} color={t.textTertiary} />
                </Pressable>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
              {WEEKDAY_LABELS.map((w, i) => {
                const active = slot.day === i + 1;
                return (
                  <Pressable
                    key={w}
                    onPress={() => patchSlot(slot.id, { day: i + 1 })}
                    style={{
                      flex: 1,
                      paddingVertical: 7,
                      borderRadius: 9,
                      alignItems: 'center',
                      backgroundColor: active ? t.primary : t.surfaceAlt,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? t.onPrimary : t.textSecondary }}>{w}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <Stepper label="开始" value={slot.start} onChange={(v) => patchSlot(slot.id, { start: v })} t={t} />
              <Stepper label="结束" value={slot.end} onChange={(v) => patchSlot(slot.id, { end: v })} t={t} />
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 11.5, color: t.textTertiary, marginBottom: 5 }}>上课周次</Text>
              <TextInput
                value={weekTexts[slot.id] ?? weeksToText(slot.weeks)}
                onChangeText={(text) => setWeekTexts((m) => ({ ...m, [slot.id]: text }))}
                placeholder="1-16 或 1-8,10-16，加“单/双”表示单双周"
                placeholderTextColor={t.textTertiary}
                style={[inputStyle(t), { paddingVertical: 10 }]}
              />
            </View>
          </Card>
        ))}

        <Field label="备注">
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="选填，例如考试安排"
            placeholderTextColor={t.textTertiary}
            style={[inputStyle(t), { minHeight: 60, textAlignVertical: 'top' }]}
            multiline
          />
        </Field>

        {error ? <Text style={{ color: t.danger, fontSize: 12.5, marginBottom: 8 }}>{error}</Text> : null}

        <PrimaryButton label={editing ? '保存修改' : '添加到课表'} icon="checkmark" onPress={onSave} style={{ marginTop: 6 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ fontSize: 11.5, color: t.textTertiary, marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );
}

function Stepper({
  label,
  value,
  onChange,
  t,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11.5, color: t.textTertiary, marginBottom: 5 }}>{label}节</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: t.surfaceAlt,
          borderRadius: radius.sm,
          paddingHorizontal: 4,
        }}
      >
        <Pressable onPress={() => onChange(Math.max(1, value - 1))} style={{ padding: 7 }}>
          <Ionicons name="remove" size={15} color={t.textSecondary} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 13.5, fontWeight: '600', color: t.text }}>{value}</Text>
        <Pressable onPress={() => onChange(Math.min(PERIOD_COUNT, value + 1))} style={{ padding: 7 }}>
          <Ionicons name="add" size={15} color={t.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>) {
  return {
    backgroundColor: t.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: t.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  } as const;
}
