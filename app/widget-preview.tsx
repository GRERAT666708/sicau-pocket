import { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/useTheme';
import { buildWidgetPayload, type WidgetFocus, type WidgetPayload } from '@/lib/widgetSync';
import { radius, spacing } from '@/constants/theme';

/**
 * iOS 小组件版式预览。
 *
 * iPhone 上真的组件由 WidgetKit（targets/widget/index.swift）渲染，读的是 App Group 里那份
 * widget.json。模拟器没法把组件摆到桌面，所以这里用同一份数据、同一套配色把两种尺寸画出来，
 * 方便在手机上看效果、调字号。
 */

const BAR = 3;

const EMBLEM = {
  light: require('@/assets/images/emblem-green.png'),
  dark: require('@/assets/images/emblem-white.png'),
};

/** 和 SwiftUI 里 .overlay(alignment: .topTrailing) 的那张校徽水印一致 */
function Watermark({ small, scheme }: { small: boolean; scheme: 'light' | 'dark' }) {
  const size = small ? 72 : 96;
  return (
    <Image
      source={scheme === 'dark' ? EMBLEM.dark : EMBLEM.light}
      resizeMode="contain"
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        top: small ? -10 : -16,
        right: small ? -26 : -30,
        opacity: scheme === 'dark' ? 0.09 : 0.1,
      }}
    />
  );
}

function mediumRows(payload: WidgetPayload) {
  return payload.courses.slice(0, 3);
}

function FocusRow({ item }: { item: WidgetFocus }) {
  const t = useTheme();
  const tag = item.state === 'class' ? '正在上课' : item.state === 'next' ? '下一节' : null;

  return (
    <View style={styles.focusRow}>
      <View style={[styles.focusBar, { backgroundColor: item.color }]} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text numberOfLines={1} style={[styles.focusName, { color: t.text }]}>
            {item.name}
          </Text>
          {tag ? <Text style={[styles.focusTag, { color: t.primary }]}>{tag}</Text> : null}
        </View>
        <Text numberOfLines={1} style={[styles.focusMeta, { color: t.textSecondary }]}>
          <Text style={{ color: t.textTertiary }}>{item.time}</Text>
          {item.room ? ` · ${item.room}` : ''}
        </Text>
      </View>
    </View>
  );
}

function SmallCard({ payload }: { payload: WidgetPayload }) {
  const t = useTheme();
  const small = true;
  const focus = (payload.focus ?? []).slice(0, 2);
  const first = payload.courses[0];

  return (
    <View style={[styles.widget, styles.small, { backgroundColor: t.surface }]}>
      <Watermark small={small} scheme={t.scheme} />
      <View style={styles.head}>
        <Text style={[styles.datePill, { color: t.primary, backgroundColor: t.primarySoft }]}>
          {payload.dateLabel}
        </Text>
      </View>
      {payload.done ? (
        <View style={styles.smallDone}>
          <Text numberOfLines={2} style={[styles.doneText, { color: t.text }]}>
            {payload.doneText ?? '今日课程已经上完了'}
          </Text>
          <Text style={[styles.tiny, { color: t.textSecondary }]}>
            今天共 {payload.courses.length} 门课
          </Text>
        </View>
      ) : focus.length > 0 ? (
        <View style={styles.focusList}>
          {focus.map((f) => (
            <FocusRow key={`${f.name}-${f.time}`} item={f} />
          ))}
          {payload.courses.length > focus.length ? (
            <Text style={[styles.focusMore, { color: t.textTertiary }]}>
              今天共 {payload.courses.length} 门课
            </Text>
          ) : null}
        </View>
      ) : first ? (
        <View style={styles.smallBody}>
          <Text numberOfLines={2} style={[styles.smallName, { color: t.text }]}>
            {first.name}
          </Text>
          <Text style={[styles.tiny, { color: t.textSecondary }]}>{first.time}</Text>
          <Text numberOfLines={1} style={[styles.tiny, { color: t.textTertiary }]}>
            {first.room}
          </Text>
        </View>
      ) : (
        <Text style={[styles.smallEmpty, { color: t.textSecondary }]}>
          {payload.emptyText ?? '今天没课'}
        </Text>
      )}
    </View>
  );
}

function MediumCard({ payload }: { payload: WidgetPayload }) {
  const t = useTheme();
  const rows = mediumRows(payload);

  return (
    <View style={[styles.widget, styles.medium, { backgroundColor: t.surface }]}>
      <Watermark small={false} scheme={t.scheme} />
      <View style={styles.head}>
        <Text style={[styles.datePill, { color: t.primary, backgroundColor: t.primarySoft }]}>
          {payload.dateLabel}
        </Text>
        <Text style={[styles.tiny, { color: t.textTertiary }]}>刷新 {payload.updatedAt}</Text>
      </View>

      <View style={styles.rows}>
        {rows.length === 0 ? (
          <Text style={[styles.empty, { color: t.textSecondary }]}>
            {payload.emptyText ?? '今天没课'}
          </Text>
        ) : (
          rows.map((c, i) => (
            <View key={`${c.name}-${i}`} style={styles.row}>
              <View style={[styles.bar, { backgroundColor: c.color }]} />
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text numberOfLines={1} style={[styles.rowName, { color: t.text }]}>
                    {c.name}
                  </Text>
                  <Text numberOfLines={1} style={[styles.rowMeta, { color: t.textTertiary }]}>
                    {c.time}
                  </Text>
                </View>
                {c.room ? (
                  <Text numberOfLines={1} style={[styles.tiny, { color: t.textSecondary }]}>
                    {c.room}
                  </Text>
                ) : null}
              </View>
            </View>
          ))
        )}
      </View>

      <Text style={[styles.more, { color: t.textTertiary }]}>
        {payload.done
          ? (payload.doneText ?? '今日课程已经上完了')
          : payload.courses.length > 3
            ? `还有 ${payload.courses.length - 3} 门`
            : `共 ${payload.courses.length} 门`}
      </Text>
    </View>
  );
}

const DEMO_FOCUS: WidgetFocus[] = [
  {
    time: '10:10-11:50',
    name: '动物组织与胚胎学实验',
    room: '科技园 B 区 C402 室',
    color: '#7C5CD6',
    state: 'class',
  },
  {
    time: '14:20-16:00',
    name: '兽医微生物学',
    room: '2-教 401',
    color: '#2F9E6B',
    state: 'next',
  },
];

export default function WidgetPreviewScreen() {
  const t = useTheme();
  const payload = useMemo(() => buildWidgetPayload(), []);

  // 今天可能只剩一两门课，光看真实数据看不到「两门课」「已上完」两种状态，
  // 这里按同一套版式补两个演示 payload，方便一次看全。
  const focusDemo = useMemo<WidgetPayload>(
    () => ({ ...payload, done: false, doneText: undefined, focus: DEMO_FOCUS }),
    [payload],
  );
  const doneDemo = useMemo<WidgetPayload>(
    () => ({ ...payload, done: true, doneText: '今日课程已经上完了' }),
    [payload],
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <Text style={[styles.title, { color: t.text }]}>iOS 桌面小组件</Text>
        <Text style={[styles.note, { color: t.textSecondary }]}>
          小组件同款版式预览（配色、字号、留白都跟真组件一致）。长按桌面左上角「+」，搜「川农口袋」即可添加。
        </Text>

        <Text style={[styles.label, { color: t.textTertiary }]}>小尺寸 · 两门课</Text>
        <View style={styles.row2}>
          <SmallCard payload={focusDemo} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Text style={[styles.note, { color: t.textSecondary }]}>
              「正在上课 / 下一节」两门一起排，右上角是校徽水印。
            </Text>
          </View>
        </View>

        <Text style={[styles.label, { color: t.textTertiary }]}>小尺寸 · 今天的课上完了</Text>
        <View style={styles.row2}>
          <SmallCard payload={doneDemo} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Text style={[styles.note, { color: t.textSecondary }]}>
              最后一节下课之后，卡片改成「今日课程已经上完了」。
            </Text>
          </View>
        </View>

        <Text style={[styles.label, { color: t.textTertiary }]}>中尺寸 · 今天（真实数据）</Text>
        <MediumCard payload={payload} />

        <Text style={[styles.note, { color: t.textTertiary }]}>
          真实数据：第 {payload.week} 周 · 今天 {payload.courses.length} 门课 · 更新于 {payload.updatedAt}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  note: { fontSize: 13, lineHeight: 20 },
  row2: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  widget: {
    borderRadius: radius.xl,
    padding: spacing.md,
    overflow: 'hidden',
    shadowColor: '#07200F',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  small: { width: 162, height: 162 },
  medium: { height: 162, flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  datePill: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  smallBody: { flex: 1, justifyContent: 'center', gap: 2 },
  smallName: { fontSize: 16, fontWeight: '800', lineHeight: 21 },
  smallEmpty: { marginTop: spacing.md, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  smallDone: { flex: 1, justifyContent: 'center', gap: 4 },
  doneText: { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  focusList: { marginTop: 8, gap: 8, flex: 1 },
  focusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  focusBar: { width: BAR, height: 27, borderRadius: 2 },
  focusName: { flex: 1, fontSize: 12.5, fontWeight: '700' },
  focusTag: { fontSize: 9, fontWeight: '700' },
  focusMeta: { fontSize: 9.5, fontWeight: '500' },
  focusMore: { fontSize: 9.5 },
  rows: { marginTop: 9, gap: 7 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  rowBody: { flex: 1, gap: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  bar: { width: BAR, height: 26, borderRadius: 2 },
  rowName: { flex: 1, fontSize: 13, fontWeight: '600' },
  rowMeta: { fontSize: 10, fontWeight: '500' },
  more: { marginTop: 6, fontSize: 11 },
  empty: { fontSize: 14, fontWeight: '600' },
  tiny: { fontSize: 11 },
});
