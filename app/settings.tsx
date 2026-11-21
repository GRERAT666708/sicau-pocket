import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Card, ListRow, SectionTitle } from '@/components/UIKit';
import { radius, spacing } from '@/constants/theme';
import { currentWeek } from '@/lib/store';
import { actions, useAppState } from '@/lib/store';
import { CAMPUSES, MAJOR_SUGGESTIONS, campusOfMajor, collegesOf } from '@/lib/major';
import type { Campus } from '@/lib/types';
import { useTheme } from '@/hooks/useTheme';
import { campusSourceText, effectiveCampus } from '@/lib/campusState';
import { APP_VERSION } from '@/lib/version';
import { exportIcs, shareIcs } from '@/lib/ics';
import { DEFAULT_REMINDER_LEAD, REMINDER_LEADS, ensureReminderPermission, pendingReminderCount, syncClassReminders } from '@/lib/reminders';

const THEMES: { key: 'system' | 'light' | 'dark'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'system', label: '跟随系统', icon: 'phone-portrait-outline' },
  { key: 'light', label: '浅色', icon: 'sunny-outline' },
  { key: 'dark', label: '深色', icon: 'moon-outline' },
];

export default function SettingsScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, sessions, semesters, courses } = useAppState();
  const [icsBusy, setIcsBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [icsNotice, setIcsNotice] = useState<string | null>(null);
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);
  const [reminderBusy, setReminderBusy] = useState(false);
  const campus = effectiveCampus(settings);
  const byMajorCampus = settings.major ? campusOfMajor(settings.major) : null;
  const [confirm, setConfirm] = useState<null | 'courses' | 'sessions' | 'all'>(null);
  const [major, setMajor] = useState(settings.major ?? '');
  const [termDate, setTermDate] = useState(settings.termStart);
  const week = currentWeek(settings);

  const dateInvalid = !/^\d{4}-\d{2}-\d{2}$/.test(termDate) || Number.isNaN(new Date(termDate).getTime());

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={t.text} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>设置</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <SectionTitle title="外观" />
        <Card style={{ paddingVertical: 2, paddingHorizontal: 16 }}>
          {THEMES.map((x, i) => (
            <View key={x.key}>
              <ListRow
                icon={x.icon}
                title={x.label}
                onPress={() => actions.updateSettings({ theme: x.key })}
                right={
                  settings.theme === x.key ? (
                    <Ionicons name="checkmark-circle" size={20} color={t.primary} />
                  ) : (
                    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: t.border }} />
                  )
                }
              />
              {i < THEMES.length - 1 ? <View style={{ height: 1, backgroundColor: t.border }} /> : null}
            </View>
          ))}
        </Card>

        <View style={{ height: spacing.xl }} />
        <SectionTitle title="校区与专业" />
        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: 11.5, color: t.textTertiary }}>姓名（首页问候语用，可留空）</Text>
          <TextInput
            value={settings.userName ?? ''}
            onChangeText={(text) => actions.updateSettings({ userName: text.trim() || undefined })}
            placeholder="例如：张三"
            placeholderTextColor={t.textTertiary}
            style={{
              backgroundColor: t.surfaceAlt,
              borderRadius: radius.sm,
              paddingHorizontal: 12,
              paddingVertical: 11,
              fontSize: 13.5,
              color: t.text,
            }}
          />

          <Text style={{ fontSize: 11.5, color: t.textTertiary }}>专业（学院名也行，用来推断校区）</Text>
          <TextInput
            value={major}
            onChangeText={(text) => {
              setMajor(text);
              const campus = campusOfMajor(text);
              if (campus) actions.updateSettings({ major: text, campus, campusSource: 'major' });
              else actions.updateSettings({ major: text });
            }}
            placeholder="例如：动物医学 / 计算机科学与技术 / 土木工程"
            placeholderTextColor={t.textTertiary}
            style={{
              backgroundColor: t.surfaceAlt,
              borderRadius: radius.sm,
              paddingHorizontal: 12,
              paddingVertical: 11,
              fontSize: 13.5,
              color: t.text,
            }}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {MAJOR_SUGGESTIONS.map((m) => (
              <Pressable
                key={m}
                onPress={() => {
                  const short = m.includes('·') ? m.split('·')[1] : m;
                  setMajor(m);
                  const campus = campusOfMajor(m) ?? campusOfMajor(short);
                  if (campus) actions.updateSettings({ major: m, campus, campusSource: 'major' });
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: radius.pill,
                  backgroundColor: settings.major === m ? t.primary : t.surfaceAlt,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: settings.major === m ? t.onPrimary : t.textSecondary,
                  }}
                >
                  {m}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ fontSize: 11.5, color: t.textTertiary }}>所在校区</Text>
            <Badge text={campusSourceText(settings)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {CAMPUSES.map((c) => (
              <Pressable
                key={c}
                onPress={() => actions.updateSettings({ campus: c as Campus, campusSource: 'manual' })}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: radius.sm,
                  alignItems: 'center',
                  backgroundColor: campus === c ? t.primary : t.surfaceAlt,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: campus === c ? t.onPrimary : t.textSecondary,
                  }}
                >
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>
          {byMajorCampus && byMajorCampus !== campus ? (
            <Pressable
              onPress={() =>
                actions.updateSettings({ campus: byMajorCampus, campusSource: 'major' })
              }
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                padding: 10,
                borderRadius: radius.sm,
                backgroundColor: t.primarySoft,
              }}
            >
              <Ionicons name="location-outline" size={14} color={t.primary} />
              <Text style={{ flex: 1, fontSize: 11.5, color: t.primary, lineHeight: 17 }}>
                「{settings.major}」在{byMajorCampus}校区，当前却是{campus}。点这里按专业改过来
              </Text>
            </Pressable>
          ) : null}
          <Text style={{ fontSize: 10.5, color: t.textTertiary, lineHeight: 16 }}>
            {collegesOf(campus).slice(0, 6).join('、')} 等学院在{campus}校区。
            改校区会同时切换「空闲教室」的默认范围。
          </Text>
        </Card>

        <View style={{ height: spacing.xl }} />
        <SectionTitle title="学期与周次" />
        <Card>
          <ListRow
            icon="albums-outline"
            title="学期管理与备份"
            subtitle={`已归档 ${semesters.length} 个历史学期 · 新建/切换学期时自动备份`}
            onPress={() => router.push('/semesters')}
          />
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />
          <Text style={{ fontSize: 11.5, color: t.textTertiary }}>学期名称</Text>
          <TextInput
            value={settings.termName}
            onChangeText={(text) => actions.updateSettings({ termName: text })}
            style={{
              backgroundColor: t.surfaceAlt,
              borderRadius: radius.sm,
              paddingHorizontal: 12,
              paddingVertical: 11,
              fontSize: 13.5,
              color: t.text,
              marginTop: 6,
            }}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
            <Text style={{ fontSize: 11.5, color: t.textTertiary }}>第 1 教学周周一</Text>
            <Badge text={`当前第 ${week} 周`} />
          </View>
          <TextInput
            value={termDate}
            onChangeText={(text) => {
              setTermDate(text);
              if (_validDate(text)) actions.updateSettings({ termStart: text });
            }}
            placeholder="2026-09-07"
            placeholderTextColor={t.textTertiary}
            style={{
              backgroundColor: t.surfaceAlt,
              borderRadius: radius.sm,
              paddingHorizontal: 12,
              paddingVertical: 11,
              fontSize: 13.5,
              color: dateInvalid ? t.danger : t.text,
              marginTop: 6,
            }}
          />
          <Text style={{ fontSize: 10.5, color: t.textTertiary, marginTop: 6 }}>
            通过教务校历确认开学日期，课表周次会自动重算
          </Text>

          <Text style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 14, marginBottom: 8 }}>学期总周数</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[16, 18, 20].map((n) => (
              <Pressable
                key={n}
                onPress={() => actions.updateSettings({ totalWeeks: n })}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: radius.sm,
                  alignItems: 'center',
                  backgroundColor: settings.totalWeeks === n ? t.primary : t.surfaceAlt,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: settings.totalWeeks === n ? t.onPrimary : t.textSecondary }}>
                  {n} 周
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <View style={{ height: spacing.xl }} />
        <SectionTitle title="上课提醒" />
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>课前提醒</Text>
              <Text style={{ fontSize: 11, color: t.textTertiary, marginTop: 3, lineHeight: 17 }}>
                在手机本地排通知，不联网、不上传课表。手机重启或长时间没打开 App 后，开一次 App 会自动补排。
              </Text>
            </View>
            <Switch
              value={settings.classReminder === true}
              onValueChange={async (v) => {
                if (!v) {
                  actions.updateSettings({ classReminder: false });
                  setReminderNotice('已关闭，之前排的通知也清掉了。');
                  return;
                }
                setReminderBusy(true);
                const granted = await ensureReminderPermission();
                setReminderBusy(false);
                if (!granted) {
                  setReminderNotice('系统没给通知权限，去「设置 → 应用 → 川农口袋 → 通知」里允许后再来打开。');
                  return;
                }
                actions.updateSettings({ classReminder: true });
                const res = await syncClassReminders(courses, { ...settings, classReminder: true });
                setReminderNotice(
                  res.ok
                    ? `已开启，提前 ${res.lead} 分钟提醒，排了 ${res.scheduled} 条，覆盖未来两周。`
                    : '开启失败，稍后再试一次。',
                );
              }}
              trackColor={{ true: t.primary, false: t.border }}
            />
          </View>

          <Text style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 14 }}>提前多久提醒</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {REMINDER_LEADS.map((n) => {
              const active = (settings.classReminderLead ?? DEFAULT_REMINDER_LEAD) === n;
              return (
                <Pressable
                  key={n}
                  onPress={async () => {
                    actions.updateSettings({ classReminderLead: n });
                    if (settings.classReminder) {
                      const res = await syncClassReminders(courses, {
                        ...settings,
                        classReminderLead: n,
                      });
                      if (res.ok) setReminderNotice(`已改成提前 ${n} 分钟，重新排了 ${res.scheduled} 条。`);
                    }
                  }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: radius.sm,
                    alignItems: 'center',
                    backgroundColor: active ? t.primary : t.surfaceAlt,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: active ? t.onPrimary : t.textSecondary,
                    }}
                  >
                    {n} 分钟
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={async () => {
              setReminderBusy(true);
              const count = await pendingReminderCount();
              setReminderBusy(false);
              setReminderNotice(
                count > 0
                  ? `现在手机里排着 ${count} 条提醒，会在对应时间弹出。`
                  : '现在没有排上的提醒：确认开关已打开、课表不是空的、开学日期填对了。',
              );
            }}
            style={{ marginTop: 12 }}
          >
            <Text style={{ fontSize: 12, color: t.primary, fontWeight: '600' }}>
              {reminderBusy ? '检查中…' : '检查已排的提醒'}
            </Text>
          </Pressable>

          {reminderNotice ? (
            <Text style={{ fontSize: 11.5, color: t.textSecondary, marginTop: 10, lineHeight: 17 }}>
              {reminderNotice}
            </Text>
          ) : null}
        </Card>

        <View style={{ height: spacing.xl }} />
        <SectionTitle title="数据" />
        <Card style={{ paddingVertical: 2, paddingHorizontal: 16 }}>
          <ListRow
            icon="calendar-outline"
            title={icsBusy ? '正在生成日历…' : '导出到系统日历（.ics）'}
            subtitle="鸿蒙 / 安卓 / iOS 通用：导入后系统日历自带桌面卡片和上课提醒"
            onPress={async () => {
              if (icsBusy) return;
              setIcsBusy(true);
              setIcsNotice(null);
              const res = await exportIcs({
                termName: settings.termName,
                termStart: settings.termStart,
                courses,
              });
              setIcsBusy(false);
              if (res.ok) {
                setIcsNotice(`已生成 ${res.events} 条日程，正在打开系统日历；在日历里确认导入即可。`);
              } else if (res.reason === 'no-courses') {
                setIcsNotice('课表还是空的，先导入自己的课表再导出。');
              } else if (res.reason === 'no-term-start') {
                setIcsNotice('开学日期不是有效日期，先在上面「学期与周次」里改一下。');
              } else if (res.savedTo) {
                setIcsNotice('日历没能直接打开，已把 .ics 存到你选的文件夹；用文件管理器点开它即可导入。');
              } else {
                setIcsNotice('没找到能打开 .ics 的日历 App；可以装一个系统日历，或从文件管理器导入。');
              }
            }}
          />
          <View style={{ height: 1, backgroundColor: t.border }} />
          <ListRow
            icon="share-outline"
            title={shareBusy ? '正在打包 .ics…' : '分享 .ics 文件'}
            subtitle="发到微信 / QQ / 邮箱，对方或你的鸿蒙日历打开就能导入"
            onPress={async () => {
              if (shareBusy) return;
              setShareBusy(true);
              setIcsNotice(null);
              const res = await shareIcs({
                termName: settings.termName,
                termStart: settings.termStart,
                courses,
              });
              setShareBusy(false);
              if (res.ok) {
                setIcsNotice(`已把 ${res.events} 条日程分享出去；在微信里发给自己，再在电脑/平板上用日历打开也行。`);
              } else if (res.reason === 'no-courses') {
                setIcsNotice('课表还是空的，先导入自己的课表再分享。');
              } else if (res.reason === 'no-term-start') {
                setIcsNotice('开学日期不是有效日期，先在上面「学期与周次」里改一下。');
              } else if (res.savedTo) {
                setIcsNotice('这台设备没有系统分享面板，已把 .ics 存到你选的文件夹。');
              } else {
                setIcsNotice('分享面板没打开成功，换个方式再试一次。');
              }
            }}
          />
          <View style={{ height: 1, backgroundColor: t.border }} />
          <ListRow
            icon="download-outline"
            title="导入示例课表"
            subtitle="动物医学专业大一示例，覆盖 8 门课"
            onPress={() => actions.loadDemoCourses()}
          />
          <View style={{ height: 1, backgroundColor: t.border }} />
          <ListRow icon="trash-outline" title="清空课表" danger onPress={() => setConfirm('courses')} />
          <View style={{ height: 1, backgroundColor: t.border }} />
          <ListRow
            icon="timer-outline"
            title="清空专注记录"
            subtitle={`当前 ${sessions.length} 条`}
            danger
            onPress={() => setConfirm('sessions')}
          />
          <View style={{ height: 1, backgroundColor: t.border }} />
          <ListRow icon="refresh-outline" title="恢复初始状态" danger onPress={() => setConfirm('all')} />
        </Card>

        {icsNotice ? (
          <Text style={{ fontSize: 11.5, color: t.textSecondary, marginTop: 8, lineHeight: 17 }}>{icsNotice}</Text>
        ) : null}

        <Card style={{ marginTop: 12, backgroundColor: t.accentSoft, borderColor: 'transparent' }}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: t.text }}>鸿蒙（卓易通）没有安卓小组件</Text>
          <Text style={{ fontSize: 11.5, color: t.textSecondary, marginTop: 6, lineHeight: 18 }}>
            安卓小组件要靠桌面宿主才能显示，鸿蒙桌面不承载安卓控件，所以在卓易通里装的本 App
            挂不出小组件。用上面的「导出到系统日历」代替：导入后到桌面加一个「日历」卡片，效果≈课表卡片，还有上课提醒。
          </Text>
        </Card>

        {confirm ? (
          <Card style={{ marginTop: 12, backgroundColor: t.accentSoft, borderColor: 'transparent' }}>
            <Text style={{ fontSize: 13, color: t.text, fontWeight: '600' }}>
              {confirm === 'courses' ? '确定清空全部课程？' : confirm === 'sessions' ? '确定清空专注记录？' : '确定恢复初始状态？'}
            </Text>
            <Text style={{ fontSize: 11.5, color: t.textSecondary, marginTop: 5 }}>该操作不可撤销。</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable
                onPress={() => setConfirm(null)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: t.surface, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, color: t.text }}>取消</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (confirm === 'courses') actions.clearCourses();
                  else if (confirm === 'sessions') actions.clearSessions();
                  else {
                    void actions.resetAll();
                    // 引导也一起重置，下次进各板块会重新提示
                    void import('@/lib/guides').then((m) => m.resetGuides());
                  }
                  setConfirm(null);
                }}
                style={{ flex: 1, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: t.danger, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600' }}>确定</Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        <View style={{ height: spacing.xl }} />
        <SectionTitle title="关于" />
        <Card style={{ paddingVertical: 2, paddingHorizontal: 16 }}>
          <ListRow icon="information-circle-outline" title="关于川农口袋" onPress={() => router.push('/about')} />
          <View style={{ height: 1, backgroundColor: t.border }} />
          <ListRow
            icon="shield-checkmark-outline"
            title="隐私说明"
            subtitle="存了什么、什么时候联网"
            onPress={() => router.push('/privacy')}
          />
          <View style={{ height: 1, backgroundColor: t.border }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
            <Ionicons name="cloud-download-outline" size={20} color={t.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: t.text, fontWeight: '500' }}>自动检查更新</Text>
              <Text style={{ fontSize: 12, color: t.textTertiary, marginTop: 2 }}>
                {settings.autoUpdateCheck === false
                  ? '已关闭：只有你手动点「检查更新」时才联网'
                  : '每 12 小时最多一次，只取一个版本号文件，不带任何标识'}
              </Text>
            </View>
            <Switch
              value={settings.autoUpdateCheck !== false}
              onValueChange={(v) => actions.updateSettings({ autoUpdateCheck: v })}
              trackColor={{ true: t.primary, false: t.border }}
            />
          </View>
        </Card>

        <Text style={{ textAlign: 'center', fontSize: 11, color: t.textTertiary, marginTop: spacing.xl }}>
          v{APP_VERSION} · 数据保存在本机
        </Text>
      </ScrollView>
    </View>
  );
}

function _validDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

