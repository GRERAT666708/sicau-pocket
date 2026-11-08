import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Card, GhostButton, PrimaryButton, SectionTitle, Badge as Tone } from '@/components/UIKit';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { clearGrades, gradeSummary, useGrades } from '@/lib/grades';

export default function GradesScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, at } = useGrades();
  const [confirmClear, setConfirmClear] = useState(false);

  const summary = useMemo(() => gradeSummary(items), [items]);

  /** 按学期分组（教务系统里同一张表可能混着多个学期） */
  const groups = useMemo(() => {
    const map = new Map<string, typeof items>();
    items.forEach((it) => {
      const key = it.term || '本学期';
      const list = map.get(key) ?? [];
      list.push(it);
      map.set(key, list);
    });
    return Array.from(map.entries());
  }, [items]);

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
          <Text style={{ fontSize: 18, fontWeight: '700', color: t.text }}>成绩查询</Text>
          <Text style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 1 }}>
            {at ? `上次导入 ${new Date(at).toLocaleString('zh-CN', { hour12: false })}` : '还没有导入成绩'}
          </Text>
        </View>
        {items.length > 0 ? <Tone text="教务数据" tone="primary" /> : <Badge text="未导入" tone="warn" />}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: 6, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {items.length === 0 ? (
          <>
            <Card style={{ backgroundColor: t.primarySoft, borderColor: 'transparent' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: t.primaryDark }}>用教务系统里的真实成绩</Text>
              <Text style={{ fontSize: 12.5, color: t.text, lineHeight: 20, marginTop: 8 }}>
                在 App 里的内置浏览器登录教务系统，进到「成绩查询」，点一下底部的「导入这个页面」就行。
                密码在那个网页里输入，不经过我们的代码。
              </Text>
              <PrimaryButton
                label="打开教务系统导入"
                icon="open-outline"
                onPress={() => router.push('/grade-import')}
                style={{ marginTop: 14 }}
              />
            </Card>

            <Card style={{ marginTop: spacing.lg, backgroundColor: t.surfaceAlt, borderColor: 'transparent' }}>
              <Text style={{ fontSize: 12, color: t.textSecondary, lineHeight: 19 }}>
                支持的表格：表头里同时有「课程」和「成绩」的正方/教务系统成绩表（老版 xscjcx、新版教务管理系统都可以）。
                如果提示没找到表头，把提示截图发我，我按你的页面再适配一版。
              </Text>
            </Card>
          </>
        ) : (
          <>
            <Card style={{ paddingVertical: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Stat label="课程" value={String(summary.count)} />
                <Stat label="总学分" value={summary.totalCredit ? String(summary.totalCredit) : '—'} />
                <Stat label="加权平均" value={summary.average !== null ? String(summary.average) : '—'} />
                <Stat label="平均绩点" value={summary.gpa !== null ? summary.gpa.toFixed(2) : '—'} />
              </View>
              {summary.failed > 0 ? (
                <Text style={{ fontSize: 11.5, color: '#C0392B', marginTop: 12 }}>
                  有 {summary.failed} 门不及格
                </Text>
              ) : null}
            </Card>

            {groups.map(([term, list]) => (
              <View key={term}>
                <SectionTitle title={term} action="共 " />
                <Card style={{ paddingVertical: 2, paddingHorizontal: 16 }}>
                  {list.map((it, i) => (
                    <View
                      key={it.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingVertical: 12,
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderTopColor: t.border,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13.5, color: t.text }} numberOfLines={2}>
                          {it.course}
                        </Text>
                        <Text style={{ fontSize: 11, color: t.textTertiary, marginTop: 3 }}>
                          {[
                            it.credit ? `${it.credit} 学分` : null,
                            it.nature,
                            it.gpa !== undefined ? `绩点 ${it.gpa}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: '700',
                          color: it.numeric !== null && it.numeric < 60 ? '#C0392B' : t.primaryDark,
                          minWidth: 46,
                          textAlign: 'right',
                        }}
                      >
                        {it.score}
                      </Text>
                    </View>
                  ))}
                </Card>
              </View>
            ))}

            <View style={{ marginTop: spacing.xl }}>
              <GhostButton
                label="重新导入（覆盖当前成绩）"
                icon="refresh-outline"
                onPress={() => router.push('/grade-import')}
              />
            </View>
            <View style={{ marginTop: 10 }}>
              {confirmClear ? (
                <Card style={{ paddingVertical: 12 }}>
                  <Text style={{ fontSize: 12.5, color: t.text }}>确定清空本机的成绩记录？</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <View style={{ flex: 1 }}>
                      <PrimaryButton
                        label="清空"
                        onPress={() => {
                          void clearGrades();
                          setConfirmClear(false);
                        }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <GhostButton label="取消" onPress={() => setConfirmClear(false)} />
                    </View>
                  </View>
                </Card>
              ) : (
                <GhostButton label="清空成绩记录" icon="trash-outline" onPress={() => setConfirmClear(true)} />
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: t.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: t.textTertiary, marginTop: 3 }}>{label}</Text>
    </View>
  );
}

void radius;
