import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { AppBackground } from '@/components/AppBackground';
import { Card, Chip, EmptyState, SectionTitle } from '@/components/UIKit';
import { Heatmap } from '@/components/Heatmap';
import { radius, spacing } from '@/constants/theme';
import { fmtClock, fmtTime } from '@/lib/date';
import { focusSummary, heatmap, todaySessions } from '@/lib/stats';
import { timerActions, useTimer } from '@/lib/timer';
import { useAppState } from '@/lib/store';
import { useTheme } from '@/hooks/useTheme';

const DURATIONS = [15, 25, 45, 60];
const TAGS = ['学习', '阅读', '写作业', '复习', '其他'];

const SIZE = 262;
const STROKE = 10;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

export default function FocusScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { sessions } = useAppState();
  const { state, remaining, progress } = useTimer();

  const stats = focusSummary(sessions);
  const today = todaySessions(sessions);
  const cells = useMemo(() => heatmap(sessions, 17), [sessions]);

  const running = state.phase === 'running';
  const idle = state.phase === 'idle';
  const paused = state.phase === 'paused';
  const display = idle ? state.durationMin * 60 : remaining;

  return (
    <AppBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: spacing.lg, paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: t.text }}>专注</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: t.surfaceAlt }}>
            <Ionicons name="leaf-outline" size={12} color={t.primary} />
            <Text style={{ fontSize: 11.5, color: t.textSecondary }}>番茄工作法</Text>
          </View>
        </View>

        <View style={{ alignItems: 'center', marginTop: 26 }}>
          <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={SIZE} height={SIZE} style={{ position: 'absolute' }}>
              <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={t.primarySoft} strokeWidth={STROKE} fill="none" />
              <Circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                stroke={t.primary}
                strokeWidth={STROKE}
                fill="none"
                strokeDasharray={`${CIRC}`}
                strokeDashoffset={CIRC * (1 - progress)}
                strokeLinecap="round"
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              />
            </Svg>
            <Text style={{ fontSize: 46, fontWeight: '300', color: t.text, letterSpacing: 1, fontVariant: ['tabular-nums'] }}>
              {fmtClock(display)}
            </Text>
            <Text style={{ fontSize: 12.5, color: t.textTertiary, marginTop: 8 }}>
              {idle ? '准备开始' : paused ? '已暂停' : `专注 · ${state.tag}`}
            </Text>
            {!idle ? (
              <Text style={{ fontSize: 11, color: t.textTertiary, marginTop: 4 }}>
                计划 {state.durationMin} 分钟
              </Text>
            ) : null}
          </View>
        </View>

        {idle ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 18 }}>
              {DURATIONS.map((d) => (
                <Chip key={d} label={`${d} 分钟`} active={state.durationMin === d} onPress={() => timerActions.setDuration(d)} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {TAGS.map((tag) => (
                <Chip key={tag} label={tag} active={state.tag === tag} tone="primary" onPress={() => timerActions.setTag(tag)} />
              ))}
            </View>
          </>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
          {idle ? (
            <Pressable
              onPress={() => timerActions.start(state.durationMin, state.tag)}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: t.primary,
                borderRadius: 18,
                paddingVertical: 16,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <Ionicons name="play" size={18} color={t.onPrimary} />
              <Text style={{ color: t.onPrimary, fontSize: 16, fontWeight: '700' }}>开始专注</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={() => (running ? timerActions.pause() : timerActions.resume())}
                style={({ pressed }) => ({
                  flex: 1.4,
                  backgroundColor: t.primary,
                  borderRadius: 18,
                  paddingVertical: 16,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 8,
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <Ionicons name={running ? 'pause' : 'play'} size={18} color={t.onPrimary} />
                <Text style={{ color: t.onPrimary, fontSize: 16, fontWeight: '700' }}>{running ? '暂停' : '继续'}</Text>
              </Pressable>
              <Pressable
                onPress={() => timerActions.cancel()}
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: t.surfaceAlt,
                  borderRadius: 18,
                  paddingVertical: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ color: t.textSecondary, fontSize: 15, fontWeight: '600' }}>结束</Text>
              </Pressable>
            </>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.xl }}>
          {[
            { label: '今日', value: stats.todayMinutes },
            { label: '本周', value: stats.weekMinutes },
            { label: '累计', value: stats.totalMinutes },
          ].map((s) => (
            <Card key={s.label} style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 12 }}>
              <Text style={{ fontSize: 11, color: t.textTertiary }}>{s.label}</Text>
              <Text style={{ fontSize: 20, fontWeight: '700', color: t.text, marginTop: 4 }}>
                {s.value}
                <Text style={{ fontSize: 10.5, fontWeight: '400', color: t.textTertiary }}> 分钟</Text>
              </Text>
            </Card>
          ))}
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <SectionTitle title="今日记录" action={today.length ? `${today.length} 次` : undefined} />
          {today.length === 0 ? (
            <Card>
              <EmptyState icon="timer-outline" title="还没有专注记录" desc="选一个时长，开始今天的第一个番茄" />
            </Card>
          ) : (
            <Card style={{ paddingVertical: 4 }}>
              {today.map((s, i) => (
                <View
                  key={s.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 11,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: t.border,
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: s.completed ? t.primary : t.accent,
                    }}
                  />
                  <Text style={{ flex: 1, fontSize: 13.5, color: t.text }}>{s.tag}</Text>
                  <Text style={{ fontSize: 12, color: t.textTertiary }}>
                    {fmtTime(s.startedAt)} – {fmtTime(s.endedAt)}
                  </Text>
                  <View style={{ minWidth: 54, alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: t.text }}>{s.minutes} 分钟</Text>
                    <Text style={{ fontSize: 10, color: s.completed ? t.primary : t.accent }}>
                      {s.completed ? '已完成' : '提前结束'}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          )}
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <SectionTitle title="专注热力图" />
          <Card>
            <Heatmap cells={cells} />
          </Card>
        </View>

        <View style={{ marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="flame-outline" size={13} color={t.accent} />
          <Text style={{ fontSize: 11.5, color: t.textTertiary }}>已连续专注 {stats.streak} 天，继续保持</Text>
        </View>
      </ScrollView>
    </AppBackground>
  );
}
