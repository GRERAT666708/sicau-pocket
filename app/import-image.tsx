import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, PrimaryButton, SectionTitle } from '@/components/UIKit';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { recognizeImage, recognizeRegion, releaseImage } from '@/modules/mlkit-ocr';
import type { OcrLine } from '@/modules/mlkit-ocr';
import { assignBands, columnBounds, detectLayout, mergeOcrCourses, parseColumn, type OcrLayout } from '@/lib/ocrTimetable';
import { toCourses, type ParsedCourse } from '@/lib/timetable';
import { actions, uid } from '@/lib/store';

const DAY_LABEL = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 周次写成「1-16周」这种区间；全是单/双周时补一个标记 */
function weeksLabel(weeks: number[]): string {
  if (!weeks.length) return '';
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const odd = weeks.every((w) => w % 2 === 1);
  const even = weeks.every((w) => w % 2 === 0);
  const base = first === last ? `${first}周` : `${first}-${last}周`;
  if (weeks.length >= 3 && odd) return `${base}(单)`;
  if (weeks.length >= 3 && even) return `${base}(双)`;
  return base;
}

export default function ImportImageScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [image, setImage] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [courses, setCourses] = useState<ParsedCourse[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const total = useMemo(
    () => (courses ?? []).reduce((n, c) => n + c.slots.length, 0),
    [courses],
  );

  async function pick() {
    setError(null);
    setCourses(null);
    setWarnings([]);
    setDone(false);

    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (picked.canceled || !picked.assets?.length) return;
    const asset = picked.assets[0];
    setImage({ uri: asset.uri, width: asset.width ?? 0, height: asset.height ?? 0 });
    setBusy(true);
    setStep('正在识别表格结构…');
    try {
      // 1) 整图一次，找出「星期几」的列和左侧节次
      const whole = await recognizeImage(asset.uri);
      const layout: OcrLayout = detectLayout(whole);
      if (!layout.centers[1] || !layout.bands.length) {
        setWarnings(layout.warnings);
        setError('这张图没认出课表结构：请截完整的一周课表（保留表头和左侧节次），别裁太紧。');
        return;
      }

      // 2) 逐列再识别，避免相邻两列的文字被连成一句
      const width = asset.width || Math.max(...whole.map((l) => l.x + l.w));
      const height = asset.height || Math.max(...whole.map((l) => l.y + l.h));
      const bounds = columnBounds(layout, width);
      const perDay: { day: number; lines: OcrLine[] }[] = [];
      for (const b of bounds) {
        setStep(`正在识别${DAY_LABEL[b.day]}…`);
        const lines = await recognizeRegion(asset.uri, b.left, layout.headerBottom, b.right, height);
        const dump = JSON.stringify({ day: b.day, lines });
        for (let i = 0; i < dump.length; i += 500) console.log('[colchunk]', b.day, i, dump.slice(i, i + 500));
        perDay.push({ day: b.day, lines });
      }
      releaseImage();

      // 左侧节次标签的高度和真实单元格对不齐，用整张表的内容行重新划分节次带
      const bands = assignBands(layout.bands, perDay.map((p) => p.lines));
      const collected: ParsedCourse[] = [];
      for (const p of perDay) collected.push(...parseColumn(p.day, bands, p.lines));

      const merged = mergeOcrCourses(collected).filter((c) => c.slots.length > 0);
      setCourses(merged);
      setWarnings(layout.warnings);
      if (!merged.length) setError('识别出来了文字，但没拼成课程。把截图发我，我按这张图再调一版。');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStep('');
    }
  }

  function apply() {
    if (!courses?.length) return;
    actions.replaceCourses(toCourses(courses, () => uid('c')));
    setDone(true);
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingHorizontal: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: '700', color: t.text }}>截图导入课表</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 120, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
      >
        {!done ? (
          <Card style={{ gap: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>选一张教务课表截图</Text>
            <Text style={{ fontSize: 13, lineHeight: 20, color: t.textSecondary }}>
              在教务系统里截整周课表（别裁掉星期表头和左侧节次）。识别全在本机完成，图片不会上传。
            </Text>
            <PrimaryButton
              label={busy ? step || '识别中…' : '选择图片'}
              icon="image-outline"
              onPress={pick}
              disabled={busy}
            />
          </Card>
        ) : null}

        {image && !done ? (
          <Card style={{ padding: 8 }}>
            <Image
              source={{ uri: image.uri }}
              style={{ width: '100%', height: 220, borderRadius: radius.md }}
              resizeMode="contain"
            />
          </Card>
        ) : null}

        {busy ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={t.primary} />
            <Text style={{ fontSize: 13, color: t.textSecondary }}>{step || '识别中…'}</Text>
          </View>
        ) : null}

        {error ? <Text style={{ color: t.danger, fontSize: 13, lineHeight: 20 }}>{error}</Text> : null}

        {!!warnings.length && !done ? (
          <Card style={{ gap: 4 }}>
            {warnings.map((w, i) => (
              <Text key={i} style={{ fontSize: 12, color: t.textSecondary }}>
                · {w}
              </Text>
            ))}
          </Card>
        ) : null}

        {courses?.length && !done ? (
          <>
            <SectionTitle title={`识别到 ${courses.length} 门课 / ${total} 个时段`} />
            <Card style={{ gap: 10 }}>
              {courses.map((c, i) => (
                <View key={`${c.name}-${i}`} style={{ gap: 2 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>
                    {c.name}
                    {c.teacher ? <Text style={{ color: t.textSecondary }}>  {c.teacher}</Text> : null}
                  </Text>
                  <Text style={{ fontSize: 12, color: t.textSecondary }}>
                    {c.slots
                      .map(
                        (s) =>
                          `${DAY_LABEL[s.day]} ${s.start}-${s.end}节` +
                          (s.room ? ` ${s.room}` : '') +
                          (s.weeks.length ? ` · ${weeksLabel(s.weeks)}` : ''),
                      )
                      .join('　')}
                  </Text>
                </View>
              ))}
            </Card>
            <PrimaryButton label="写入课表（覆盖现有）" icon="download-outline" onPress={apply} />
            <Text style={{ fontSize: 12, color: t.textSecondary, textAlign: 'center' }}>
              会覆盖当前课表（示例课表也会被替换）。导入后回「课表」核对一遍。
            </Text>
          </>
        ) : null}

        {done ? (
          <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 26 }}>
            <Ionicons name="checkmark-circle" size={44} color={t.primary} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>已导入 {courses?.length ?? 0} 门课</Text>
            <Text style={{ fontSize: 13, color: t.textSecondary, textAlign: 'center', lineHeight: 20 }}>
              回「课表」就能看到；有课没认出来或教室不对，告诉我哪一门，我按那张图再调。
            </Text>
            <PrimaryButton label="去课表看看" icon="calendar-outline" onPress={() => router.replace('/(tabs)/schedule')} />
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}
