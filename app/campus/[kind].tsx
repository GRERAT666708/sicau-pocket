import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GuideCard } from '@/components/GuideCard';
import { Badge, Card, Chip, GhostButton, PrimaryButton, SectionTitle } from '@/components/UIKit';
import { radius, spacing } from '@/constants/theme';
import { CAMPUS_BUILDINGS } from '@/lib/campus';
import {
  busyAt,
  buildingsOf,
  getClassroomStore,
  autoSyncIfStale,
  isFresh,
  periodsOfGroup,
  roomsOf,
  syncBuilding,
  syncCatalog,
  useClassroomStore,
} from '@/lib/classroom';
import { fmtTime, isoDate } from '@/lib/date';
import { PERIOD_GROUPS } from '@/lib/periods';
import { useTheme } from '@/hooks/useTheme';
import { effectiveCampus } from '@/lib/campusState';
import { actions, currentWeek, useAppState } from '@/lib/store';
import { CAMPUSES } from '@/lib/major';
import type { Campus } from '@/lib/types';

const TITLES: Record<string, { title: string; sub: string }> = {
  electricity: { title: '宿舍电费', sub: '余额与用量' },
  ecard: { title: '校园一卡通', sub: '余额与流水' },
  classroom: { title: '空闲教室', sub: '按教学楼查询' },
};

export default function CampusScreen() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // 电费 / 一卡通已经有真实页面（/ecard），这里不再展示本地演示数据
  if (kind === 'electricity' || kind === 'ecard') {
    return <Redirect href="/ecard" />;
  }

  const meta = TITLES[kind ?? ''] ?? { title: '校园服务', sub: '' };
  const classroomStore = useClassroomStore();
  const realClassroom = kind === 'classroom' && classroomStore.rooms.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingHorizontal: spacing.md,
          paddingBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={t.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>{meta.title}</Text>
          <Text style={{ fontSize: 11, color: t.textTertiary }}>{meta.sub}</Text>
        </View>
        {kind === 'electricity' || kind === 'ecard' ? (
          <Badge text="官方页面" tone="primary" />
        ) : kind === 'classroom' ? (
          realClassroom ? (
            <Badge text="教务数据" tone="primary" />
          ) : (
            <Badge text="待同步" tone="warn" />
          )
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 60, paddingTop: 6 }}
        showsVerticalScrollIndicator={false}
      >
        {kind === 'classroom' ? (
          <GuideCard
            id="classroom"
            icon="school-outline"
            title="空教室怎么看"
            points={[
              '先同步一次教室总表（教务公开页面，不用登录），之后按楼看',
              '白色「空闲」是整段时间都没课，灰色是这间有课、数字是当天节数',
              '缓存 7 天，过期会在顶部提示重新同步',
            ]}
          />
        ) : null}
        <Classroom />
      </ScrollView>
    </View>
  );
}

function Classroom() {
  const t = useTheme();
  const { settings } = useAppState();
  const data = useClassroomStore();
  const [campus, setCampus] = useState<Campus>(effectiveCampus(settings));
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [group, setGroup] = useState(0);

  const buildings = data.rooms.length ? buildingsOf(data, campus) : CAMPUS_BUILDINGS[campus];
  const [building, setBuilding] = useState(buildings[0]);

  React.useEffect(() => {
    if (!buildings.includes(building)) setBuilding(buildings[0]);
  }, [buildings, building]);

  // 前台自动补数据：进页面 + 从后台切回来时检查过期（iOS 后台任务不准时，就用「打开就补」）
  React.useEffect(() => {
    let cancelled = false;
    const run = () => {
      void autoSyncIfStale(campus, building).then((msg) => {
        if (!cancelled && msg) setNote(msg);
      });
    };
    run();
    const sub = AppState.addEventListener('change', (state: string) => {
      if (state === 'active') run();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campus, building]);

  const rooms = useMemo(() => roomsOf(data, campus, building), [data, campus, building]);
  const g = PERIOD_GROUPS[group];
  const periods = periodsOfGroup(g.from, g.to);
  const week = currentWeek(settings);
  const day = new Date().getDay() || 7;

  const rows = useMemo(() => {
    if (!rooms.length) return [];
    return rooms.map((r) => {
      const tt = data.roomData[r.bianhao];
      const hit = busyAt(tt, day, g.from, g.to, week);
      const busyPeriods = periods.filter((p) => busyAt(tt, day, p, p, week) === true);
      return { ...r, hit, busyPeriods, synced: Boolean(tt) };
    });
  }, [rooms, data.roomData, day, g.from, g.to, week, periods]);

  const free = rows.filter((r) => r.hit === false);
  const unknown = rows.filter((r) => r.hit === null);
  const catalogAt = data.catalogAt;
  const stale = catalogAt > 0 && !isFresh(catalogAt);

  async function sync() {
    setSyncing(true);
    setNote(null);
    try {
      const cat = await syncCatalog(!isFresh(catalogAt));
      if (!cat.ok) {
        setNote(cat.message);
        return;
      }
      const b = buildingsOf(getClassroomStore(), campus).includes(building) ? building : buildingsOf(getClassroomStore(), campus)[0];
      if (b !== building) setBuilding(b);
      const res = await syncBuilding(campus, b, (done, total) => setProgress({ done, total }));
      setProgress(null);
      setNote(
        res.failed
          ? `同步完成，${res.failed} 间失败（可能是那几个页面刚好打不开），其余可用`
          : res.total
            ? `已同步 ${res.done} 间教室的课表`
            : '这些教室的课表是最新的',
      );
    } catch (error) {
      setNote(`同步失败：${String(error)}`);
    } finally {
      setSyncing(false);
      setProgress(null);
    }
  }

  function pick(next: Campus) {
    setCampus(next);
    const list = data.rooms.length ? buildingsOf(data, next) : CAMPUS_BUILDINGS[next];
    setBuilding(list[0]);
    actions.updateSettings({ campus: next, campusSource: 'manual' });
  }

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        {CAMPUSES.map((c) => (
          <Chip key={c} label={`${c}校区`} active={campus === c} onPress={() => pick(c)} tone="primary" />
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
        {buildings.map((b) => (
          <Chip key={b} label={b} active={building === b} onPress={() => setBuilding(b)} />
        ))}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {PERIOD_GROUPS.map((x, i) => (
          <Chip key={x.label} label={x.label} active={group === i} onPress={() => setGroup(i)} tone="primary" />
        ))}
      </View>

      {!data.rooms.length ? (
        <Card style={{ marginTop: spacing.lg, paddingVertical: 18 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>还没同步教室数据</Text>
          <Text style={{ fontSize: 12.5, color: t.textSecondary, marginTop: 6, lineHeight: 19 }}>
            空闲教室用的是教务处的真实课表（211 间教室，公开页面，不用登录）。先同步一次，之后每周自动提示更新。
          </Text>
          <PrimaryButton
            label={syncing ? '同步中…' : '同步教室数据'}
            icon="cloud-download-outline"
            loading={syncing}
            onPress={sync}
            style={{ marginTop: 14 }}
          />
          {progress ? (
            <Text style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 8, textAlign: 'center' }}>
              已同步 {progress.done} / {progress.total} 间
            </Text>
          ) : null}
          {note ? <Text style={{ fontSize: 11.5, color: t.danger ?? '#B3261E', marginTop: 8 }}>{note}</Text> : null}
        </Card>
      ) : null}

      {data.rooms.length ? (
        <>
          <Card style={{ marginTop: spacing.lg, paddingVertical: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: t.primary }}>{free.length}</Text>
              <Text style={{ fontSize: 12, color: t.textSecondary }}>
                间空闲 / 共 {rows.length} 间{unknown.length ? `（${unknown.length} 间未同步）` : ''}
              </Text>
            </View>
            <Text style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 4 }}>
              {campus}校区 · {building} · {g.label} · 周{'一二三四五六日'[day - 1]} · 第 {week} 周
            </Text>
            <Text style={{ fontSize: 11, color: t.textTertiary, marginTop: 2 }}>
              数据来自教务处教室课表 · {catalogAt ? `教室列表 ${new Date(catalogAt).toLocaleDateString('zh-CN')} 同步` : '未同步'}
              {stale ? ' · 已超过 7 天，建议重新同步' : ''}
            </Text>
            <GhostButton
              label={syncing ? (progress ? `同步中 ${progress.done}/${progress.total}` : '同步中…') : '同步本楼教室课表'}
              icon="refresh"
              onPress={syncing ? undefined : sync}
              style={{ marginTop: 10 }}
            />
            {note ? (
              <Text style={{ fontSize: 11.5, color: t.textSecondary, marginTop: 8 }}>{note}</Text>
            ) : null}
          </Card>

          <View style={{ marginTop: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {rows.map((r) => {
              const isFree = r.hit === false;
              const isUnknown = r.hit === null;
              return (
                <View
                  key={r.bianhao}
                  style={{
                    width: '31.5%',
                    flexGrow: 1,
                    backgroundColor: isFree ? t.surface : t.surfaceAlt,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: isFree ? `${t.primary}55` : t.border,
                    padding: 12,
                    opacity: isFree ? 1 : isUnknown ? 0.75 : 0.55,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: isFree ? t.text : t.textTertiary }}>{r.room}</Text>
                  <Text style={{ fontSize: 10.5, color: t.textTertiary, marginTop: 3 }}>{r.capacity ? `${r.capacity} 座` : r.kind}</Text>
                  <Text
                    style={{
                      fontSize: 10.5,
                      color: isFree ? t.primary : t.textTertiary,
                      marginTop: 5,
                      fontWeight: '600',
                    }}
                  >
                    {isUnknown ? '未同步' : isFree ? '空闲' : `${r.busyPeriods.length} 节有课`}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      <DataNote
        text="空闲教室来自教务处「教室课表」公开页面：先同步教室列表（211 间），再按教学楼抓每间教室的整学期课表，缓存在本机。超过 7 天会在页面顶部提示重新同步，也可以在设置里手动清空缓存。教务课表变动后重新同步一次即可。"
      />
    </>
  );
}

function DataNote({ text }: { text: string }) {
  const t = useTheme();
  return (
    <Card style={{ marginTop: spacing.xl, backgroundColor: t.surfaceAlt, borderColor: 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="information-circle-outline" size={15} color={t.textSecondary} />
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.textSecondary }}>数据说明</Text>
      </View>
      <Text style={{ fontSize: 11.5, color: t.textTertiary, lineHeight: 18, marginTop: 8 }}>{text}</Text>
    </Card>
  );
}

/** 学校一卡通页面（真实余额 / 流水 / 电费充值）的入口 */
function EcardEntryCard({ what }: { what: string }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Card>
      <SectionTitle title="已接入学校一卡通页面" action="打开" onAction={() => router.push('/ecard')} />
      <Text style={{ fontSize: 12.5, color: t.textSecondary, lineHeight: 20 }}>
        余额、消费流水和「电费充值」都在学校的一卡通服务页里。绑定一次（粘贴微信里的链接），之后在 App 里就能看真实数据、直接充值。
      </Text>
      <PrimaryButton
        label={what === '宿舍电费' ? '打开并充值电费' : '打开校园卡'}
        icon="card-outline"
        onPress={() => router.push('/ecard')}
        style={{ marginTop: 12 }}
      />
    </Card>
  );
}
