import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Badge, Card, Chip, GhostButton, PrimaryButton, SectionTitle } from '@/components/UIKit';
import { radius, spacing } from '@/constants/theme';
import { CAMPUS_BUILDINGS, demoEcard, demoElectricity } from '@/lib/campus';
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
        ) : (
          <Badge text="演示数据" tone="warn" />
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 60, paddingTop: 6 }}
        showsVerticalScrollIndicator={false}
      >
        {kind === 'electricity' ? <Electricity /> : null}
        {kind === 'ecard' ? <Ecard /> : null}
        {kind === 'classroom' ? <Classroom /> : null}
        <DataNote />
      </ScrollView>
    </View>
  );
}

function Electricity() {
  const t = useTheme();
  const router = useRouter();
  const data = useMemo(() => demoElectricity(), []);
  const max = Math.max(...data.dailyUsage.map((d) => d.kwh), 1);
  const today = data.dailyUsage[data.dailyUsage.length - 1];
  return (
    <>
      <LinearGradient
        colors={[t.primary, t.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: radius.lg, padding: 20, overflow: 'hidden' }}
      >
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{data.dorm}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
          <Text style={{ color: '#fff', fontSize: 15 }}>¥</Text>
          <Text style={{ color: '#fff', fontSize: 38, fontWeight: '700', letterSpacing: 0.5 }}>{data.balance.toFixed(2)}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>可用余额</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 20, marginTop: 14 }}>
          <View>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>今日用电</Text>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 2 }}>{today.kwh} kWh</Text>
          </View>
          <View>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>近 14 天</Text>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 2 }}>
              {data.dailyUsage.reduce((s, d) => s + d.kwh, 0).toFixed(1)} kWh
            </Text>
          </View>
        </View>
      </LinearGradient>

      <View style={{ marginTop: spacing.xl }}>
        <SectionTitle title="近 14 天用电" />
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 110 }}>
            {data.dailyUsage.map((d, i) => (
              <View key={d.date} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
                <View
                  style={{
                    width: '100%',
                    height: Math.max(6, (d.kwh / max) * 90),
                    borderRadius: 4,
                    backgroundColor: i === data.dailyUsage.length - 1 ? t.primary : `${t.primary}55`,
                  }}
                />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <Text style={{ fontSize: 10, color: t.textTertiary }}>{data.dailyUsage[0].date.slice(5)}</Text>
            <Text style={{ fontSize: 10, color: t.textTertiary }}>今天</Text>
          </View>
        </Card>
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <ListRowCard
          icon="wallet-outline"
          title="缴费充值"
          sub="学校一卡通页面里直接充"
          onPress={() => router.push('/ecard')}
        />
      </View>

      <EcardEntryCard what="宿舍电费" />
    </>
  );
}

function Ecard() {
  const t = useTheme();
  const data = useMemo(() => demoEcard(), []);
  return (
    <>
      <LinearGradient
        colors={['#3A4C6E', '#22304A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: radius.lg, padding: 20, overflow: 'hidden' }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>校园一卡通 · 川农</Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{isoDate(new Date())}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 14 }}>
          <Text style={{ color: '#fff', fontSize: 15 }}>¥</Text>
          <Text style={{ color: '#fff', fontSize: 38, fontWeight: '700' }}>{data.balance.toFixed(2)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 28, marginTop: 16 }}>
          <View>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>今日消费</Text>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 2 }}>¥{data.todaySpent.toFixed(2)}</Text>
          </View>
          <View>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>本月消费</Text>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 2 }}>¥{data.monthSpent.toFixed(2)}</Text>
          </View>
        </View>
      </LinearGradient>

      <EcardEntryCard what="校园一卡通" />


      <View style={{ marginTop: spacing.xl }}>
        <SectionTitle title="最近消费" />
        <Card style={{ paddingVertical: 2, paddingHorizontal: 16 }}>
          {data.transactions.map((tx, i) => (
            <View
              key={tx.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 12,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: t.border,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: t.text }}>{tx.place}</Text>
                <Text style={{ fontSize: 11, color: t.textTertiary, marginTop: 2 }}>
                  {new Date(tx.time).getMonth() + 1}月{new Date(tx.time).getDate()}日 {fmtTime(tx.time)}
                </Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>{tx.amount.toFixed(2)}</Text>
            </View>
          ))}
        </Card>
      </View>
    </>
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

function PerfectCampusNotice({ what }: { what: string }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Card style={{ marginTop: spacing.xl, backgroundColor: t.surfaceAlt, borderColor: 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="wallet-outline" size={15} color={t.textSecondary} />
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.textSecondary }}>{what}在「完美校园」里</Text>
      </View>
      <Text style={{ fontSize: 11.5, color: t.textTertiary, lineHeight: 18, marginTop: 8 }}>
        真实余额和充值都在完美校园（新开普）里。它的接口没有公开文档、App 还带加固（检测到代理/证书会直接拒登录），
        微信里的一卡通又走微信私有通道，所以这里暂时只能用演示数据。为什么接不了，点下面看详细原因。
      </Text>
      <GhostButton
        label="为什么接不了完美校园"
        icon="help-circle-outline"
        onPress={() => router.push('/perfectcampus')}
        style={{ marginTop: 12 }}
      />
    </Card>
  );
}

function DataNote({ text }: { text?: string }) {
  const t = useTheme();
  return (
    <Card style={{ marginTop: spacing.xl, backgroundColor: t.surfaceAlt, borderColor: 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="information-circle-outline" size={15} color={t.textSecondary} />
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.textSecondary }}>数据说明</Text>
      </View>
      <Text style={{ fontSize: 11.5, color: t.textTertiary, lineHeight: 18, marginTop: 8 }}>
        {text ??
          '当前展示的是本地演示数据，用于预览界面与交互。真实数据需要接入四川农业大学相关系统：统一身份认证 auth.sicau.edu.cn（川农e认证，CAS）、教务处 jiaowu.sicau.edu.cn、一卡通与后勤平台。接入方式见项目文档 docs/sicau-api.md。'}
      </Text>
    </Card>
  );
}

function ListRowCard({
  icon,
  title,
  sub,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Card onPress={onPress} style={{ paddingVertical: 15 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: t.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={18} color={t.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>{title}</Text>
          <Text style={{ fontSize: 11, color: t.textTertiary, marginTop: 2 }}>{sub}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={t.textTertiary} />
      </View>
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
