import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView as RNWebView } from 'react-native-webview';
import { Badge, Chip, GhostButton, PrimaryButton } from '@/components/UIKit';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { cookieAssignments, hostOf, loadWebSession } from '@/lib/webSession';
import { JIAOWU, VPN } from '@/lib/jiaowu';
import { parseGrades, saveGrades, type GradeItem } from '@/lib/grades';

/** react-native-webview 14 的类型是 React 18 的，和 React 19 的 JSX 不兼容 */
const Browser = RNWebView as unknown as React.ComponentType<any>;

const GRAB_JS = `
(function () {
  try {
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
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'html',
      url: location.href,
      frames: frameCount,
      html: parts.join(String.fromCharCode(10))
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
})();
true;
`;

const OPEN_IN_PLACE_JS = `
(function () {
  var open = window.open;
  window.open = function (url) { if (url) location.href = String(url); return null; };
  void open;
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[target="_blank"]') : null;
    if (a && a.href) { e.preventDefault(); location.href = a.href; }
  }, true);
})();
true;
`;

type Channel = 'vpn' | 'direct';

export default function GradeImportScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const webRef = useRef<any>(null);
  const mountedRef = useRef(true);
  const grabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [channel, setChannel] = useState<Channel>('vpn');
  const startUrl = channel === 'vpn' ? VPN.home : JIAOWU.loginPage;
  const [bootJs, setBootJs] = useState(OPEN_IN_PLACE_JS);

  // 复用课表导入里记住的登录 Cookie，二级页面不用再登一次
  useEffect(() => {
    let alive = true;
    loadWebSession()
      .then((session) => {
        if (!alive) return;
        const host = hostOf(startUrl);
        const assigns = cookieAssignments(session.cookiesByHost?.[host], host);
        if (assigns.length) setBootJs(`${assigns.join('\n')}\n${OPEN_IN_PLACE_JS}`);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [startUrl]);
  const [browserKey, setBrowserKey] = useState(0);
  const [grabbing, setGrabbing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<GradeItem[] | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (grabTimerRef.current) clearTimeout(grabTimerRef.current);
    };
  }, []);

  const goBack = useCallback(() => {
    if (preview) {
      setPreview(null);
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/me');
  }, [preview, router]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [goBack]);

  function inject(js: string) {
    if (!mountedRef.current) return;
    try {
      webRef.current?.injectJavaScript(js);
    } catch {
      // WebView 已销毁
    }
  }

  function grab() {
    setGrabbing(true);
    setMessage(null);
    inject(GRAB_JS);
    if (grabTimerRef.current) clearTimeout(grabTimerRef.current);
    grabTimerRef.current = setTimeout(() => {
      setGrabbing(false);
      setMessage('没读到页面内容：先确认这一页已经正常打开（不是错误页），再点一次');
    }, 8000);
  }

  function handleMessage(data: string) {
    let payload: any;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }

    if (payload.type === 'html') {
      setGrabbing(false);
      if (grabTimerRef.current) clearTimeout(grabTimerRef.current);
      const result = parseGrades(payload.html ?? '');
      if (!result.ok) {
        setPreview(null);
        setMessage(result.message);
        return;
      }
      setMessage(null);
      setPreview(result.items);
      return;
    }
    if (payload.type === 'error') {
      setGrabbing(false);
      if (grabTimerRef.current) clearTimeout(grabTimerRef.current);
      setMessage(`抓取出错：${payload.message ?? '未知错误'}`);
    }
  }

  async function apply() {
    if (!preview) return;
    await saveGrades(preview);
    router.replace('/grades');
  }

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
        <Pressable onPress={goBack} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: t.text }}>导入成绩</Text>
          <Text style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 1 }}>
            登录教务系统 → 打开成绩查询 → 点底部导入
          </Text>
        </View>
        <Badge text="内置浏览器" />
      </View>

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, paddingBottom: 6 }}>
        <Chip label="校园 VPN" active={channel === 'vpn'} onPress={() => { setChannel('vpn'); setBrowserKey((k) => k + 1); }} />
        <Chip label="直连教务网" active={channel === 'direct'} onPress={() => { setChannel('direct'); setBrowserKey((k) => k + 1); }} />
      </View>

      <View style={{ flex: 1, borderTopWidth: 1, borderTopColor: t.border }}>
        <Browser
          key={browserKey}
          ref={webRef}
          source={{ uri: startUrl }}
          style={{ flex: 1, backgroundColor: '#fff' }}
          javaScriptEnabled
          domStorageEnabled
          injectedJavaScriptBeforeContentLoaded={bootJs}
          onMessage={(event: { nativeEvent: { data: string } }) => handleMessage(event.nativeEvent.data)}
          onError={() => setMessage('页面加载失败，检查网络后重试')}
          setSupportMultipleWindows={false}
        />
      </View>

      {preview ? (
        <View style={{ padding: spacing.lg, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border }}>
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: t.text }}>
            解析到 {preview.length} 门课的成绩
          </Text>
          <Text style={{ fontSize: 11.5, color: t.textSecondary, marginTop: 4 }}>
            {preview.slice(0, 3).map((it) => `${it.course} ${it.score}`).join(' · ')}
            {preview.length > 3 ? ' …' : ''}
          </Text>
          <PrimaryButton label="保存到本机" icon="download-outline" onPress={apply} style={{ marginTop: 12 }} />
          <View style={{ marginTop: 8 }}>
            <GhostButton label="不保存，继续看页面" onPress={() => setPreview(null)} />
          </View>
        </View>
      ) : (
        <View style={{ padding: spacing.lg, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border }}>
          {message ? (
            <Text style={{ fontSize: 12, color: '#C0392B', marginBottom: 8, lineHeight: 18 }}>{message}</Text>
          ) : (
            <Text style={{ fontSize: 11.5, color: t.textTertiary, marginBottom: 8, lineHeight: 17 }}>
              进到「成绩查询 / 我的成绩」页面，等成绩表格显示出来再点下面。
            </Text>
          )}
          <PrimaryButton
            label={grabbing ? '读取中…' : '导入这个页面'}
            icon="cloud-download-outline"
            loading={grabbing}
            onPress={grab}
          />
        </View>
      )}
    </View>
  );
}

void radius;
