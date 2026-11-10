import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge, Card, GhostButton, PrimaryButton, SectionTitle } from '@/components/UIKit';
import { radius, spacing } from '@/constants/theme';
import { isoDate, mondayOf } from '@/lib/date';
import { actions, currentWeek, useAppState } from '@/lib/store';
import { useTheme } from '@/hooks/useTheme';

/** 下一个学期的名称与开学日（第一学期 → 次年第二学期，第二学期 → 同年第一学期） */
function nextTerm(termStart: string) {
  const start = new Date(termStart);
  const y = start.getFullYear();
  const isFall = start.getMonth() >= 6;
  if (isFall) {
    const d = mondayOf(new Date(y + 1, 1, 20));
    return { termName: `${y}-${y + 1} 学年第二学期`, termStart: isoDate(d) };
  }
  const d = mondayOf(new Date(y, 7, 25));
  return { termName: `${y}-${y + 1} 学年第一学期`, termStart: isoDate(d) };
}

export default function SemestersScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, courses, semesters } = useAppState();

  const week = currentWeek(settings);
  const [creating, setCreating] = useState(false);
  const suggested = useMemo(() => nextTerm(settings.termStart), [settings.termStart]);
  const [name, setName] = useState(suggested.termName);
  const [start, setStart] = useState(suggested.termStart);
  const [weeks, setWeeks] = useState<16 | 18 | 20>(settings.totalWeeks >= 20 ? 20 : settings.totalWeeks >= 18 ? 18 : 16);

  const startInvalid = !/^\d{4}-\d{2}-\d{2}$/.test(start) || Number.isNaN(new Date(start).getTime());

  const openCreator = () => {
    setName(suggested.termName);
    setStart(suggested.termStart);
    setCreating(true);
  };

  const create = () => {
    if (startInvalid) return;
    actions.startNewSemester({ termName: name.trim() || suggested.termName, termStart: start, totalWeeks: weeks }, true);
    setCreating(false);
    router.replace('/(tabs)/schedule');
  };

  const confirmDelete = (id: string, termName: string) => {
    Alert.alert('删除这个学期？', `「${termName}」的课表会被永久删除，无法恢复。`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => actions.removeSemester(id) },
    ]);
  };

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
        <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>学期</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <SectionTitle title="当前学期" />
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: t.text }}>{settings.termName}</Text>
            <Badge text={week >= 1 ? `第 ${week} 周` : '未开学'} tone="primary" />
          </View>
          <Text style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 6 }}>
            {settings.termStart} 开学 · 共 {settings.totalWeeks} 周 · {courses.length} 门课
          </Text>
          <Text style={{ fontSize: 11.5, color: t.textSecondary, marginTop: 10, lineHeight: 18 }}>
            新建学期或切换到历史学期时，当前课表会自动存成一份备份，不会丢。
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <GhostButton
              label="改开学日期"
              icon="calendar-outline"
              onPress={() => router.push('/settings')}
              style={{ flex: 1 }}
            />
            <PrimaryButton label="新建学期" icon="add" onPress={openCreator} style={{ flex: 1 }} />
          </View>
        </Card>

        {creating ? (
          <>
            <View style={{ height: spacing.xl }} />
            <SectionTitle title="创建新学期" />
            <Card>
              <Text style={{ fontSize: 11.5, color: t.textTertiary }}>学期名称</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="如 2026-2027 学年第二学期"
                placeholderTextColor={t.textTertiary}
                style={{
                  marginTop: 8,
                  borderRadius: radius.md,
                  backgroundColor: t.surfaceAlt,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: t.text,
                }}
              />
              <Text style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 14 }}>第 1 教学周周一</Text>
              <TextInput
                value={start}
                onChangeText={setStart}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={t.textTertiary}
                autoCapitalize="none"
                style={{
                  marginTop: 8,
                  borderRadius: radius.md,
                  backgroundColor: t.surfaceAlt,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: startInvalid ? t.danger : t.text,
                }}
              />
              <Text style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 14 }}>学期总周数</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {([16, 18, 20] as const).map((w) => (
                  <Pressable
                    key={w}
                    onPress={() => setWeeks(w)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: radius.md,
                      alignItems: 'center',
                      backgroundColor: weeks === w ? t.primary : t.surfaceAlt,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: weeks === w ? t.onPrimary : t.text }}>
                      {w} 周
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <GhostButton label="取消" onPress={() => setCreating(false)} style={{ flex: 1 }} />
                <PrimaryButton
                  label={courses.length > 0 ? '归档当前学期并新建' : '创建空学期'}
                  onPress={create}
                  disabled={startInvalid}
                  style={{ flex: courses.length > 0 ? 1.6 : 1 }}
                />
              </View>
            </Card>
          </>
        ) : null}

        <View style={{ height: spacing.xl }} />
        <SectionTitle title={`历史学期${semesters.length > 0 ? ` · ${semesters.length}` : ''}`} />
        {semesters.length === 0 ? (
          <Card>
            <Text style={{ fontSize: 13, fontWeight: '600', color: t.text }}>还没有历史学期</Text>
            <Text style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 6, lineHeight: 18 }}>
              点上面的「新建学期」，当前课表就会存成一份备份出现在这里；以后想翻某一学期的课，
              点「切换到这个学期」即可切回去看。
            </Text>
          </Card>
        ) : (
          semesters.map((s) => (
            <Card key={s.id} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: t.text }}>{s.termName}</Text>
                <Badge text={`${s.courses.length} 门课`} />
              </View>
              <Text style={{ fontSize: 11, color: t.textTertiary, marginTop: 6 }}>
                {s.termStart} 开学 · 共 {s.totalWeeks} 周 · 备份于 {new Date(s.archivedAt).toLocaleDateString('zh-CN')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <GhostButton
                  label="切换到这个学期"
                  icon="swap-horizontal-outline"
                  onPress={() => {
                    actions.switchSemester(s.id);
                    router.replace('/(tabs)/schedule');
                  }}
                  style={{ flex: 1 }}
                />
                <Pressable
                  onPress={() => confirmDelete(s.id, s.termName)}
                  hitSlop={8}
                  style={{
                    width: 46,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: t.surfaceAlt,
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color={t.danger} />
                </Pressable>
              </View>
            </Card>
          ))
        )}

        <Text style={{ fontSize: 11, color: t.textTertiary, marginTop: spacing.lg, lineHeight: 17 }}>
          学期备份只存在这台手机上，不会上传。卸载 App 会一起清掉，重要课表建议截图留档。
        </Text>
      </ScrollView>
    </View>
  );
}
