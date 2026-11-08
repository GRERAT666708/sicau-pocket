import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView as RNWebView } from 'react-native-webview';
import { Badge, PrimaryButton } from '@/components/UIKit';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { importFromHtml, JIAOWU, VPN } from '@/lib/jiaowu';
import { actions, uid } from '@/lib/store';
import type { Campus } from '@/lib/types';
import { detectCampus, groupParsedSlots, timetableDiagnostics, toCourses, type ParsedCourse } from '@/lib/timetable';
import { campusOfMajor } from '@/lib/major';
import { detectMajor, detectPersonName } from '@/lib/person';
import {
  clearWebSession,
  cookieAssignments,
  hostOf,
  loadWebSession,
  saveWebSession,
  type WebChannel,
  type WebSession,
} from '@/lib/webSession';

/**
 * 在 App 里直接打开教务网，让同学自己登录，登录完停在课表页，
 * 点一下「导入这个页面」就把当前页面的表格解析成课程。
 *
 * 为什么这么做：教务系统是老 ASP + GB2312 + 一堆隐藏 token，
 * 用真实浏览器（WebView）登录最不容易被改版整死，也不用把密码交给我们的代码。
 */

const PROBE_JS = `
(function () {
  try {
    // 课表页的特征：某个 table 里同时出现「星期一」…「星期日」和「节」
    var tables = document.getElementsByTagName('table');
    var looksLikeTimetable = false;
    for (var i = 0; i < tables.length; i += 1) {
      var text = tables[i].innerText || '';
      if (text.indexOf('星期一') >= 0 && text.indexOf('星期日') >= 0 && text.indexOf('节') >= 0) {
        looksLikeTimetable = true;
        break;
      }
    }
    var body = document.body ? document.body.innerText || '' : '';
    var hasLogout = /退出|注销|安全退出/.test(body);
    var hasPassword = !!document.querySelector('input[type=password]');
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'probe',
      url: location.href,
      title: document.title,
      looksLikeTimetable: looksLikeTimetable,
      loggedIn: hasLogout && !hasPassword,
      cookies: document.cookie || ''
    }));
  } catch (e) {}
})();
true;
`;

const GO_SSO_JS = `
(function () {
  location.href = 'https://jiaowu.sicau.edu.cn/jiaoshi/aspsso/caslogin.asp';
})();
true;
`;

const GRAB_HTML_JS = `
(function () {
  try {
    // 有些教务页面把课表放在 iframe 里，主文档抓不到，这里把同源子框架的 HTML 也拼上
    var parts = [document.documentElement.outerHTML];
    var frameCount = 0;
    try {
      for (var i = 0; i < window.frames.length; i += 1) {
        var frame = window.frames[i];
        var doc = frame && frame.document;
        if (doc && doc.documentElement) {
          parts.push('<!--frame-->');
          parts.push(doc.documentElement.outerHTML);
          frameCount += 1;
        }
      }
    } catch (e) {}
    var html = parts.join(String.fromCharCode(10));
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'html',
      url: location.href,
      frames: frameCount,
      html: html
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
})();
true;
`;

/** 在 WebVPN 门户里自动点「教务系统」入口 */
const GO_JIAOWU_JS = `
(function () {
  try {
    var links = document.getElementsByTagName('a');
    for (var i = 0; i < links.length; i += 1) {
      var text = (links[i].innerText || '').trim();
      var href = links[i].href || '';
      if (/教务/.test(text) || /jiaowu/i.test(href)) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'jiaowu-clicked', href: href }));
        links[i].click();
        return;
      }
    }
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'jiaowu-missing' }));
  } catch (e) {}
})();
true;
`;

const CHANNELS: { key: WebChannel; label: string; hint: string }[] = [
  { key: 'vpn', label: '校园 VPN', hint: '校外也能用，先登一次统一身份认证' },
  { key: 'direct', label: '直连教务网', hint: '在校园网里用，最快' },
];

/** 判断这个网址属于哪条通道 */
function channelOf(url: string | undefined): WebChannel {
  const host = hostOf(url);
  if (host.includes('webvpn')) return 'vpn';
  return 'direct';
}

type Probe = {
  type: 'probe';
  url?: string;
  title?: string;
  looksLikeTimetable?: boolean;
  loggedIn?: boolean;
  cookies?: string;
};

/** 找页面里的「退出/注销」链接点掉，真正的服务端登出 */
const LOGOUT_JS = `
(function () {
  try {
    var links = document.getElementsByTagName('a');
    for (var i = 0; i < links.length; i += 1) {
      var text = (links[i].innerText || '').trim();
      if (/^(退出|注销|安全退出|退出登录)$/.test(text) || /logout|exit/i.test(links[i].href || '')) {
        links[i].click();
        return;
      }
    }
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'logout-missing' }));
  } catch (e) {}
})();
true;
`;

/**
 * react-native-webview 14 的类型是按 React 18 写的，和 React 19 的 JSX 类型对不上
 * （props 会被推断成 never），这里退化成宽松类型，运行时行为不变。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Browser = RNWebView as unknown as React.ComponentType<any>;

export default function WebImportScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ url?: string }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webRef = useRef<any>(null);
  const mountedRef = useRef(true);
  /** WebView 能不能在网页历史里后退（安卓返回键优先走网页历史） */
  const canGoBackRef = useRef(false);

  /** 页面卸载后再碰 WebView 会抛错，所有注入都走这里 */
  const inject = useCallback((js: string) => {
    if (!mountedRef.current) return;
    try {
      webRef.current?.injectJavaScript(js);
    } catch {
      // WebView 已经销毁，忽略
    }
  }, []);

  /** 返回上一页；没有历史（比如从深链直接进来）就回导入页，避免 GO_BACK 报错 */
  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/import');
  }, [router]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBackRef.current) {
        try {
          webRef.current?.goBack();
        } catch {
          canGoBackRef.current = false;
        }
        return true;
      }
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [goBack]);

  // 支持从外部带一个课表链接进来（比如同学把教室课表链接发给自己）
  const explicitUrl = typeof params.url === 'string' && /^https?:\/\//.test(params.url) ? params.url : null;

  const [session, setSession] = useState<WebSession>({});
  const [sessionReady, setSessionReady] = useState(Boolean(explicitUrl));
  const [channel, setChannel] = useState<WebChannel>('vpn');

  const homeOf = useCallback(
    (target: WebChannel) => (target === 'vpn' ? VPN.home : JIAOWU.loginPage),
    [],
  );

  // 上次停在课表页 → 直接回到那一页（会话失效的话网站会自己把我们弹回登录页）
  //
  // 唯一例外：VPN 通道不能回放 `/https/<加密域名>/...` 这种代理深链——它绑着当时的 ticket，
  // 过期或换出口 IP 就变成 500「内部服务器错误」，所以 VPN 只回到门户首页。
  const startUrl = useMemo(() => {
    if (explicitUrl) return explicitUrl;
    const saved = session.lastUrl;
    if (saved && channelOf(saved) === channel) {
      if (channel === 'vpn' && saved.includes('/https/')) return homeOf('vpn');
      return saved;
    }
    return homeOf(channel);
  }, [channel, explicitUrl, homeOf, session.lastUrl]);

  const [loggedIn, setLoggedIn] = useState(Boolean(session.loggedIn));

  useEffect(() => {
    let alive = true;
    loadWebSession().then((saved) => {
      if (!alive) return;
      setSession(saved);
      setLoggedIn(Boolean(saved.loggedIn));
      if (saved.channel) setChannel(saved.channel);
      setSessionReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const [browserKey, setBrowserKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pageUrl, setPageUrl] = useState<string>(startUrl);
  const [looksLikeTimetable, setLooksLikeTimetable] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCourse[] | null>(null);
  const [campusHint, setCampusHint] = useState<Campus | null>(null);
  const [majorHint, setMajorHint] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [httpError, setHttpError] = useState<string | null>(null);

  /**
   * 页面脚本跑之前注入：回填上次的 Cookie + 把 target="_blank" / window.open 拦在当前 WebView 里。
   *
   * 校园 VPN 门户里「教务系统」这类入口常用 target=_blank 或 window.open 打开，
   * 安卓上会被当成「外部 URL」甩给系统浏览器——App 里就断了。这里强制同窗口打开。
   */
  const injectedBeforeLoad = useMemo(() => {
    const host = hostOf(startUrl);
    const saved = host ? session.cookiesByHost?.[host] : undefined;
    const assignments = cookieAssignments(saved, host);
    const restore = assignments.length ? `try{${assignments.join('')}}catch(e){}` : '';
    const keepInside = `
try {
  window.open = function (url) {
    if (url) { location.href = String(url); }
    return null;
  };
  document.addEventListener('click', function (event) {
    var node = event.target;
    while (node && node.tagName !== 'A') { node = node.parentElement; }
    if (node && (node.target === '_blank' || node.target === '_new')) {
      event.preventDefault();
      if (node.href) { location.href = node.href; }
    }
  }, true);
} catch (e) {}
`;
    return `(function(){${restore}${keepInside}})();true;`;
  }, [session.cookiesByHost, startUrl]);

  function handleMessage(raw: string) {
    if (!mountedRef.current) return;
    let payload: Probe & { type: string; html?: string; frames?: number; message?: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    if (payload.type === 'probe') {
      const nextUrl = payload.url ?? pageUrl;
      setPageUrl(nextUrl);
      setLooksLikeTimetable(Boolean(payload.looksLikeTimetable));
      if (__DEV__) {
        console.log('[sicau] probe', nextUrl, 'loggedIn=', payload.loggedIn, 'cookies=', payload.cookies);
      }
      const isLoggedIn = Boolean(payload.loggedIn);
      setLoggedIn(isLoggedIn);
      const host = hostOf(nextUrl);
      const cookiesByHost = { ...(session.cookiesByHost ?? {}) };
      if (host && payload.cookies) cookiesByHost[host] = payload.cookies;
      const isVpnProxyUrl = nextUrl.includes('webvpn.sicau.edu.cn/https/');
      const patch: WebSession = {
        loggedIn: isLoggedIn,
        channel,
        cookiesByHost,
        // 只有课表页才值得记住，登录页/公告页记住没意义；VPN 代理深链会过期，不记
        lastUrl:
          payload.looksLikeTimetable && !isVpnProxyUrl ? nextUrl : (session.lastUrl ?? homeOf(channel)),
      };
      setSession((prev) => ({ ...prev, ...patch }));
      void saveWebSession(patch);
      return;
    }

    if (payload.type === 'jiaowu-missing') {
      setMessage('还没在网页里找到「教务系统」入口，先登录校园 VPN，再点一下页面的教务系统图标');
      return;
    }

    if (payload.type === 'logout-missing') {
      setMessage('没找到「退出」链接，用「刷新」重新打开登录页试试');
      return;
    }

    if (payload.type === 'html') {
      setGrabbing(false);
      if (grabTimerRef.current) clearTimeout(grabTimerRef.current);
      setPageUrl(payload.url ?? pageUrl);
      if (__DEV__) {
        const raw = payload.html ?? '';
        const tables = (raw.match(/<table/gi) ?? []).length;
        const dayHits = (raw.match(/星期[一二三四五六日]/g) ?? []).length;
        console.log('[sicau] grab', { len: raw.length, tables, dayHits, frames: payload.frames ?? 0 });
        if (process.env.EXPO_PUBLIC_DUMP_HTML === '1') {
          for (let i = 0; i < raw.length; i += 1200) {
            console.log(`[sicau] html ${i}`, raw.slice(i, i + 1200));
          }
        }
      }
      const personName = detectPersonName(payload.html ?? '');
      if (personName) actions.updateSettings({ userName: personName });
      const majorName = detectMajor(payload.html ?? '');
      if (majorName) {
        const campusOfIt = campusOfMajor(majorName);
        actions.updateSettings({
          major: majorName,
          ...(campusOfIt ? { campus: campusOfIt, campusSource: 'major' as const } : {}),
        });
        setMajorHint(majorName);
      }
      const result = importFromHtml(payload.html ?? '');
      if (!result.ok) {
        setMessage(result.message);
        setParsed(null);
        return;
      }
      const grouped = groupParsedSlots(result.slots);
      const courses = grouped.filter((c) => !c.booking);
      const bookings = grouped.length - courses.length;
      if (!courses.length) {
        setMessage(
          `这个页面解析到 ${grouped.length} 条记录，但都像教室借用/活动（${timetableDiagnostics(payload.html ?? '')}），确认你停在「我的课表」页`,
        );
        setParsed(null);
        return;
      }
      const hint = detectCampus(payload.html ?? '');
      const campusNote = hint ? `识别到校区：${hint}校区` : null;
      setCampusHint(hint);
      setMessage(
        [bookings ? `另有 ${bookings} 条教室借用/活动记录，已自动忽略` : null, campusNote]
          .filter(Boolean)
          .join(' · ') || null,
      );
      setParsed(courses);
      return;
    }

    if (payload.type === 'error') {
      setGrabbing(false);
      if (grabTimerRef.current) clearTimeout(grabTimerRef.current);
      setMessage(payload.message ?? '读取页面失败');
    }
  }

  const grabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function grab() {
    setGrabbing(true);
    setMessage(null);
    inject(GRAB_HTML_JS);
    // 页面是 500/空白页时注入的脚本不会回消息，别让按钮一直转圈
    if (grabTimerRef.current) clearTimeout(grabTimerRef.current);
    grabTimerRef.current = setTimeout(() => {
      setGrabbing(false);
      setMessage('没读到页面内容：先确认这一页已经正常打开（不是错误页），再点一次');
    }, 8000);
  }

  function apply() {
    if (!parsed?.length) return;
    actions.replaceCourses(toCourses(parsed, () => uid('c')));
    if (campusHint) {
      actions.updateSettings({ campus: campusHint, campusSource: 'timetable' });
    }
    setDone(true);
  }

  const header = (
    <View
      style={{
        paddingTop: insets.top + 6,
        paddingHorizontal: spacing.md,
        paddingBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: t.bg,
      }}
    >
      <Pressable onPress={goBack} hitSlop={10} style={{ padding: 6 }}>
        <Ionicons name="chevron-back" size={22} color={t.text} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>在 App 里登录教务网</Text>
        <Text style={{ fontSize: 11, color: t.textTertiary }} numberOfLines={1}>
          {pageUrl.replace(/^https?:\/\//, '')}
        </Text>
      </View>
      <Pressable onPress={() => setBrowserKey((k) => k + 1)} hitSlop={10} style={{ padding: 6 }}>
        <Ionicons name="refresh" size={20} color={t.textSecondary} />
      </Pressable>
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {header}
        <View style={{ flex: 1, padding: spacing.lg, gap: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>网页版用不了内置浏览器</Text>
          <Text style={{ fontSize: 13, color: t.textSecondary, lineHeight: 20 }}>
            这里依赖手机上的 WebView。请在手机上用这个 App，或者在「导入课表」里改用「网页源码」粘贴导入。
          </Text>
        </View>
      </View>
    );
  }

  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: 6 }}>
          <Pressable onPress={goBack} hitSlop={10} style={{ padding: 6 }}>
            <Ionicons name="chevron-back" size={22} color={t.text} />
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>导入完成</Text>
        </View>
        <View style={{ padding: spacing.lg, gap: 14, alignItems: 'center' }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: t.primarySoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="checkmark" size={30} color={t.primary} />
          </View>
          <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>已导入 {parsed?.length ?? 0} 门课</Text>
          {majorHint ? (
            <Text style={{ fontSize: 12.5, color: t.primary }}>
              专业已识别为 {majorHint}
            </Text>
          ) : null}
          {campusHint ? (
            <Text style={{ fontSize: 12.5, color: t.primary }}>校区已按课表设为 {campusHint}校区</Text>
          ) : null}
          <Text style={{ fontSize: 13, color: t.textSecondary, textAlign: 'center', lineHeight: 20 }}>
            学期周次不对的话，去「设置 → 学期与周次」把开学日期改成你们这学期的第一天。
          </Text>
          <PrimaryButton label="去课表看看" icon="calendar-outline" onPress={() => router.replace('/schedule')} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {header}

      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <Browser
          key={browserKey}
          ref={webRef}
          source={{ uri: startUrl }}
          onLoadStart={() => {
            setLoading(true);
            setHttpError(null);
          }}
          onLoadEnd={() => {
            setLoading(false);
            inject(PROBE_JS);
          }}
          onMessage={(event: { nativeEvent: { data: string } }) => handleMessage(event.nativeEvent.data)}
          onNavigationStateChange={(nav: { canGoBack?: boolean }) => {
            canGoBackRef.current = Boolean(nav.canGoBack);
          }}
          onError={(event: { nativeEvent: { description?: string } }) => {
            setLoading(false);
            setMessage(event.nativeEvent?.description ?? '网页打不开，检查一下网络');
          }}
          onHttpError={(event: { nativeEvent: { statusCode?: number } }) => {
            setLoading(false);
            const code = event.nativeEvent?.statusCode ?? 0;
            if (!code || code >= 400) {
              setHttpError(`HTTP ${code || '错误'}`);
              setMessage('这页打不开，多半是 VPN 会话过期了，点下面「回到 VPN 首页」重新进一次');
            }
          }}
          injectedJavaScriptBeforeContentLoaded={injectedBeforeLoad}
          startInLoadingState
          cacheEnabled
          domStorageEnabled
          javaScriptEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          /* 门户里的 target=_blank 链接必须在同一个 WebView 里打开 */
          setSupportMultipleWindows={false}
          incognito={false}
          style={{ flex: 1 }}
        />
        {loading ? (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.85)',
              gap: 10,
            }}
          >
            <ActivityIndicator size="large" color={t.primary} />
            <Text style={{ fontSize: 13, color: t.textSecondary }}>正在打开教务系统…</Text>
          </View>
        ) : null}
      </View>

      <View
        style={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.md,
          backgroundColor: t.bg,
          borderTopWidth: 1,
          borderTopColor: t.border,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {CHANNELS.map((item) => {
            const active = item.key === channel;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  if (active) return;
                  setChannel(item.key);
                  setParsed(null);
                  setMessage(null);
                  setBrowserKey((k) => k + 1);
                }}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  backgroundColor: active ? t.primarySoft : t.surfaceAlt,
                  borderWidth: 1,
                  borderColor: active ? t.primary : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: active ? t.primary : t.textSecondary,
                    textAlign: 'center',
                  }}
                >
                  {item.label}
                </Text>
                <Text
                  style={{ fontSize: 10, color: t.textTertiary, textAlign: 'center', marginTop: 2 }}
                  numberOfLines={1}
                >
                  {item.hint}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Badge
            text={
              looksLikeTimetable
                ? '看起来是课表页'
                : loggedIn
                  ? '已登录'
                  : sessionReady && session.loggedIn
                    ? '用上次的登录状态'
                    : '登录后打开课表页'
            }
            tone={looksLikeTimetable || loggedIn ? 'primary' : 'soft'}
          />
          <Text style={{ flex: 1, fontSize: 12, color: t.textSecondary }} numberOfLines={2}>
            {parsed
              ? `解析到 ${parsed.length} 门课，点下面的按钮写入`
              : looksLikeTimetable
                ? '确认是你要的课表后，点「导入这个页面」'
                : channel === 'vpn'
                  ? '先登录校园 VPN，再点「进入教务系统」，进去后找「我的课表」'
                  : '在上面登录（选「学生」），进到「我的课表 / 课表查询」页'}
          </Text>
        </View>

        {message ? <Text style={{ fontSize: 12, color: t.accent }}>{message}</Text> : null}

        {parsed ? (
          <PrimaryButton label={`导入这 ${parsed.length} 门课`} icon="download-outline" onPress={apply} />
        ) : (
          <>
            <PrimaryButton
              label={grabbing ? '正在读取页面…' : '导入这个页面'}
              icon="cloud-download-outline"
              loading={grabbing}
              disabled={grabbing}
              onPress={grab}
            />
            {httpError ? (
              <Pressable
                onPress={() => {
                  setMessage(null);
                  setHttpError(null);
                  setParsed(null);
                  setChannel('vpn');
                  void saveWebSession({ channel: 'vpn', lastUrl: VPN.home });
                  setSession((prev) => ({ ...prev, lastUrl: VPN.home }));
                  setBrowserKey((k) => k + 1);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 9,
                  borderRadius: 12,
                  backgroundColor: t.primarySoft,
                }}
              >
                <Ionicons name="refresh-outline" size={15} color={t.primary} />
                <Text style={{ fontSize: 12, color: t.primary }}>回到 VPN 首页（{httpError}）</Text>
              </Pressable>
            ) : null}

            {channel === 'vpn' && !parsed ? (
              <Pressable
                onPress={() => inject(GO_JIAOWU_JS)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 9,
                  borderRadius: 12,
                  backgroundColor: t.surfaceAlt,
                }}
              >
                <Ionicons name="school-outline" size={15} color={t.primary} />
                <Text style={{ fontSize: 12, color: t.primary }}>进入教务系统（VPN 门户里点也行）</Text>
              </Pressable>
            ) : null}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
              {loggedIn ? (
                <Pressable
                  onPress={() => {
                    setMessage(null);
                    inject(LOGOUT_JS);
                    void clearWebSession();
                    setSession({});
                    setLoggedIn(false);
                  }}
                  style={{ paddingVertical: 6 }}
                >
                  <Text style={{ fontSize: 12, color: t.textTertiary }}>退出登录</Text>
                </Pressable>
              ) : channel === 'direct' ? (
                <Pressable onPress={() => inject(GO_SSO_JS)} style={{ paddingVertical: 6 }}>
                  <Text style={{ fontSize: 12, color: t.primary }}>走「川农e认证」登录</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => setBrowserKey((k) => k + 1)}
                  style={{ paddingVertical: 6 }}
                >
                  <Text style={{ fontSize: 12, color: t.primary }}>重新打开 VPN 登录页</Text>
                </Pressable>
              )}
              {Object.keys(session.cookiesByHost ?? {}).length || session.lastUrl ? (
                <Pressable
                  onPress={() => {
                    void clearWebSession();
                    setSession({});
                    setLoggedIn(false);
                    setMessage('已清除本机记住的登录信息');
                  }}
                  style={{ paddingVertical: 6 }}
                >
                  <Text style={{ fontSize: 12, color: t.textTertiary }}>清除记住的会话</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

/**
 * 路由级兜底：内置浏览器出什么问题都别给同学看红屏，
 * 直接给一个能退回导入页的卡片。
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top + 8, padding: spacing.lg, gap: 12 }}>
      <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>内置浏览器出错了</Text>
      <Text style={{ fontSize: 13, color: t.textSecondary, lineHeight: 20 }}>
        {error?.message ?? '未知错误'}
      </Text>
      <Text style={{ fontSize: 13, color: t.textSecondary, lineHeight: 20 }}>
        可以点「再试一次」；还是不行就用「导入课表」里的「课表链接」或「网页源码」，效果一样。
      </Text>
      <PrimaryButton label="再试一次" icon="refresh-outline" onPress={retry} />
      <PrimaryButton label="回到导入课表" icon="arrow-back-outline" onPress={() => router.replace('/import')} />
    </View>
  );
}
