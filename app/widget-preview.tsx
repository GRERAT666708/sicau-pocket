import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/useTheme';
import { buildWidgetPayload, type WidgetPayload } from '@/lib/widgetSync';
import { radius, spacing } from '@/constants/theme';

/**
 * iOS 小组件版式预览。
 *
 * iPhone 上真的组件由 WidgetKit（targets/widget/index.swift）渲染，读的是 App Group 里那份
 * widget.json。模拟器没法把组件摆到桌面，所以这里用同一份数据、同一套配色把两种尺寸画出来，
 * 方便在手机上看效果、调字号。
 */

const BAR = 3;

function mediumRows(payload: WidgetPayload) {
  return payload.courses.slice(0, 3);
}

function SmallCard({ payload }: { payload: WidgetPayload }) {
  const t = useTheme();
  const hl = payload.highlight;
  const first = payload.courses[0];

  return (
    <View style={[styles.widget, styles.small, { backgroundColor: t.surface }]}>
      <View style={styles.head}>
        <Text style={[styles.datePill, { color: t.primary, backgroundColor: t.primarySoft }]}>
          {payload.dateLabel}
        </Text>
      </View>
      {hl ? (
        <View style={styles.smallBody}>
          <Text style={[styles.tiny, { color: t.textTertiary }]}>
            {hl.state === 'class' ? '正在上课' : '下一节'}
          </Text>
          <Text numberOfLines={2} style={[styles.smallName, { color: t.text }]}>
            {hl.name}
          </Text>
          <Text numberOfLines={1} style={[styles.tiny, { color: t.textSecondary }]}>
            {hl.time}
          </Text>
          <Text numberOfLines={1} style={[styles.tiny, { color: t.textTertiary }]}>
            {hl.room}
          </Text>
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

      {payload.courses.length > 3 ? (
        <Text style={[styles.more, { color: t.textTertiary }]}>
          还有 {payload.courses.length - 3} 门
        </Text>
      ) : null}
    </View>
  );
}

export default function WidgetPreviewScreen() {
  const t = useTheme();
  const payload = useMemo(() => buildWidgetPayload(), []);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <Text style={[styles.title, { color: t.text }]}>iOS 桌面小组件</Text>
        <Text style={[styles.note, { color: t.textSecondary }]}>
          这是小组件的同款版式预览（数据、配色、字号都跟真组件一致）。长按桌面左上角「+」，搜「川农口袋」即可添加。
        </Text>

        <View style={styles.row2}>
          <SmallCard payload={payload} />
          <View style={{ flex: 1 }}>
            <MediumCard payload={payload} />
          </View>
        </View>

        <Text style={[styles.note, { color: t.textTertiary }]}>
          当前数据：第 {payload.week} 周 · {payload.courses.length} 节课 · 更新于 {payload.updatedAt}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800' },
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
