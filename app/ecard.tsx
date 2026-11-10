import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RNWebView from 'react-native-webview';

import { Badge, Card, GhostButton, PrimaryButton, SectionTitle } from '@/components/UIKit';
import { useTheme } from '@/hooks/useTheme';
import { actions } from '@/lib/store';
import {
  clearEcard,
  clearEcardRoom,
  ecardUrl,
  elepayUrl,
  loadEcard,
  parseEcardInfo,
  parseOpenid,
  saveEcard,
  type EcardBinding,
} from '@/lib/ecard';
import { radius, spacing } from '@/constants/theme';

// react-native-webview 14 的类型是按 React 18 写的，和 React 19 的 JSX 不兼容
const Browser = RNWebView as unknown as React.ComponentType<any>;

const PROBE_JS = `
(function () {
  try {
    var text = document.body ? document.body.innerText : '';
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'text', text: text, url: location.href }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
})();
true;
`;


/** 在「电费充值」页里抓一次房间选择（四个下拉都选好后回传） */
const CAPTURE_ROOM_JS = `
(function () {
  try {
    var ids = ['factorycode', 'buildid', 'floorid', 'roomid'];
    var vals = {};
    for (var i = 0; i < ids.length; i += 1) {
      var el = document.getElementById(ids[i]);
      if (!el || !el.value) return;
      vals[ids[i]] = el.value;
    }
    var labels = [];
    for (var j = 0; j < ids.length; j += 1) {
      var e = document.getElementById(ids[j]);
      var t = e && e.options && e.selectedIndex >= 0 ? e.options[e.selectedIndex].text : '';
      if (t) labels.push(t);
    }
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'room', room: vals, label: labels.join(' · ') }));
  } catch (err) {}
})();
true;
`;

/** 选好房间后，页面会显示「电费余额」，抓一次整页文字回来解析 */
const CAPTURE_ELEC_JS = `
(function () {
  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'elecText', text: document.body.innerText }));
  } catch (e) {}
})();
true;
`;

/** 下次进电费页时，把记住的四个值依次填回去（必须等上一级 loading 完才有选项） */
function autofillRoomJs(room: NonNullable<EcardBinding['room']>) {
  const payload = JSON.stringify({
    factorycode: room.factorycode,
    buildid: room.buildid,
    floorid: room.floorid,
    roomid: room.roomid,
  });
  return `
(function () {
  var target = ${payload};
  var order = ['factorycode', 'buildid', 'floorid', 'roomid'];
  function pick(id) {
    var el = document.getElementById(id);
    if (!el) return false;
    if (el.value) return true;
    var want = target[id];
    if (!want) return false;
    for (var i = 0; i < el.options.length; i += 1) {
      if (el.options[i].value === want) {
        el.value = want;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }
  var i = 0;
  var timer = setInterval(function () {
    if (i >= order.length) { clearInterval(timer); return; }
    if (pick(order[i])) i += 1;
  }, 600);
  setTimeout(function () { clearInterval(timer); }, 15000);
})();
true;
`;
}

export default function EcardScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const webRef = useRef<any>(null);
  const mountedRef = useRef(true);

  const [binding, setBinding] = useState<EcardBinding | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ name?: string; studentId?: string; balance?: string }>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [roomLabel, setRoomLabel] = useState<string | null>(null);
  const params = useLocalSearchParams<{ elepay?: string; openid?: string; autopick?: string }>();
  const [showElepay, setShowElepay] = useState(params.elepay === '1');
  const [roomDirty, setRoomDirty] = useState(false);
  // 直接深链进电费页时，先落在首页拿到会话 cookie，再跳到电费页，否则会被拦
  const pendingElepayRef = useRef(params.elepay === '1');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ignoreRoomUntilRef = useRef(0);
  const bindingRef = useRef<EcardBinding | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    // 支持深链直接带 openid（方便一次性把链接甩进来就绑好）
    const fromLink = params.openid ? parseOpenid(String(params.openid)) : null;
    if (fromLink) {
      saveEcard({ openid: fromLink })
        .then((b) => {
          if (!mountedRef.current) return;
          setBinding(b);
          bindingRef.current = b;
          setReloadKey((k) => k + 1);
        })
        .catch(() => {});
    }
    loadEcard().then((b) => {
      if (!mountedRef.current) return;
      setBinding(b);
      bindingRef.current = b;
      if (b) {
        setInfo({ name: b.name, studentId: b.studentId, balance: b.balance });
        setRoomLabel(b.room?.label ?? null);
      }
      setLoading(false);
    });
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [params.openid]);

  const bind = useCallback(async () => {
    const openid = parseOpenid(input);
    if (!openid) {
      setError('没找到 openid。请在微信里打开「智慧川农 → 一卡通服务」，点右上角「…」→「复制链接」，整段粘进来。');
      return;
    }
    setError(null);
    const next = await saveEcard({ openid });
    setBinding(next);
    setInput('');
    setReloadKey((k) => k + 1);
  }, [input]);

  const onMessage = useCallback(
    (event: any) => {
      let payload: any;
      try {
        payload = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      const b0 = bindingRef.current;
      if (payload.type === 'room' && payload.room && b0 && Date.now() > ignoreRoomUntilRef.current) {
        const label = String(payload.label ?? '');
        setRoomLabel(label || null);
        setRoomDirty(false);
        saveEcard({
          openid: b0.openid,
          room: {
            factorycode: payload.room.factorycode,
            buildid: payload.room.buildid,
            floorid: payload.room.floorid,
            roomid: payload.room.roomid,
            label,
            savedAt: Date.now(),
          },
        })
          .then((next) => setBinding(next))
          .catch(() => {});
        return;
      }
      if (
        payload.type === 'elecText' &&
        payload.text &&
        b0 &&
        b0.room?.roomid && // 没选全房间时页面上没有真正的电费余额，别抓
        Date.now() > ignoreRoomUntilRef.current
      ) {
        const text = String(payload.text);
        // 优先取带小数的金额；页面上「电费余额」后面偶尔先出现 1 之类的脏字，没有小数就不认
        const m =
          text.match(/电费余额[\s\S]{0,40}?([0-9]+\.[0-9]{1,2})/) ??
          text.match(/电费余额\s*[:：]?\s*([0-9]{2,}\.[0-9]{1,2})/);
        if (m) {
          const elecBalance = m[1];
          saveEcard({ openid: b0.openid, elecBalance, elecUpdatedAt: Date.now() })
            .then((next) => setBinding(next))
            .catch(() => {});
        }
        return;
      }
      if (payload.type === 'text' && payload.text) {
        const parsed = parseEcardInfo(payload.text);
        if (parsed.name) actions.updateSettings({ userName: parsed.name });
        if (parsed.name || parsed.studentId || parsed.balance) {
          setInfo((prev) => {
            const merged = { ...prev, ...parsed };
            if (binding) {
              saveEcard({ openid: binding.openid, ...merged }).catch(() => {});
            }
            return merged;
          });
        }
      }
    },
    [],
  );

  const changeRoom = useCallback(async () => {
    const b = bindingRef.current;
    if (!b) return;
    // 先停抓取、先挂上忽略窗口，避免旧页面把旧房间又写回去
    if (pollRef.current) clearInterval(pollRef.current);
    ignoreRoomUntilRef.current = Date.now() + 10000;
    setRoomLabel(null);
    const next = await clearEcardRoom(b.openid);
    if (next) {
      bindingRef.current = next;
      setBinding(next);
    }
    // 回到一卡通首页（保住会话），用户再点「充宿舍电费」进去选新房
    setShowElepay(false);
    setRoomDirty(true);
    setReloadKey((k) => k + 1);
  }, []);

  const unbind = useCallback(async () => {
    await clearEcard();
    setBinding(null);
    setInfo({});
  }, []);

  const header = (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg }}>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={{ fontSize: 20, color: t.text }}>‹</Text>
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>校园卡</Text>
        <Badge text={binding ? '已绑定' : '未绑定'} tone={binding ? 'primary' : 'warn'} />
      </View>
      <Text style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 4 }}>
        余额、流水、电费充值都在学校的「一卡通服务」页面里
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: t.bg }]}>
        {header}
        <Text style={{ marginTop: 40, textAlign: 'center', color: t.textTertiary }}>读取本机绑定…</Text>
      </View>
    );
  }

  if (!binding) {
    return (
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: t.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {header}
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
          <Card>
            <SectionTitle title="先把微信里的链接粘进来" />
            <Text style={{ fontSize: 12.5, color: t.textSecondary, lineHeight: 20 }}>
              学校的一卡通页面只在微信里打开，链接里带着你的身份标识（openid）。复制一次，之后这里就能直接看余额、查流水、充宿舍电费。
            </Text>
            <View style={[styles.steps, { backgroundColor: t.surfaceAlt }]}>
              <Text style={{ fontSize: 12, color: t.textSecondary, lineHeight: 21 }}>
                1. 微信搜「智慧川农」→ 一卡通服务，进「电费充值」页面{'\n'}
                2. 点右上角「…」→「用其他应用打开」→ 选 {Platform.OS === 'android' ? 'Chrome 等浏览器' : 'Safari'}{'\n'}
                3. 复制浏览器地址栏里的整条链接，回这里粘贴（只粘 openid 那串也行）
              </Text>
            </View>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="粘贴 https://yktwechat.sicau.edu.cn/home/openHomePage?openid=…"
              placeholderTextColor={t.textTertiary}
              multiline
              style={[styles.input, { backgroundColor: t.surfaceAlt, color: t.text }]}
            />
            {error ? (
              <Text style={{ fontSize: 11.5, color: t.danger, marginTop: 8, lineHeight: 18 }}>{error}</Text>
            ) : null}
            {Platform.OS === 'android' ? (
              <View style={{ marginTop: 10, padding: 12, borderRadius: radius.sm, backgroundColor: t.surfaceAlt }}>
                <Text style={{ fontSize: 11.5, color: t.textSecondary, lineHeight: 18, fontWeight: '600' }}>
                  安卓微信拿不到链接？
                </Text>
                <Text style={{ fontSize: 11, color: t.textTertiary, marginTop: 6, lineHeight: 18 }}>
                  一卡通是「智慧川农」小程序里的内嵌网页，微信的「…」菜单对这类页面不一定给「复制链接」。稳妥的拿法是先把它交给系统浏览器：
                  {'\n'}1. iOS：进「电费充值」→ 右上角「…」→「用其他应用打开」→ 选 Safari → 复制地址栏；
                  {'\n'}2. 安卓：同一步里菜单项可能叫「用其他应用打开」（不叫「在浏览器打开」），选 Chrome 后复制地址栏；
                  {'\n'}3. 都没有的话借 iPhone 或电脑微信取一次，之后把那串 openid 粘进来即可（各页面通用，不限电费页）。
                </Text>
              </View>
            ) : null}
            <PrimaryButton label="绑定这张卡" icon="card-outline" onPress={bind} style={{ marginTop: 12 }} />
            <Text style={{ fontSize: 11, color: t.textTertiary, marginTop: 10, lineHeight: 17 }}>
              链接只存在这台手机上（AsyncStorage），不上传服务器、不写进日志。换手机或想解绑，回到这里点「解除绑定」。
            </Text>
          </Card>

          <Card style={{ marginTop: spacing.md }}>
            <SectionTitle title="为什么不在 App 里做原生的余额页" />
            <Text style={{ fontSize: 12.5, color: t.textSecondary, lineHeight: 20 }}>
              一卡通的接口跟着微信 OAuth 走，学校没开放第三方 App 接入。用内嵌网页是最稳的方式：学校改版、换充值入口，都不用我们跟着改代码。
            </Text>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      {header}
      <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.sm }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 11.5, color: t.textTertiary }}>当前余额</Text>
              <Text style={{ fontSize: 30, fontWeight: '800', color: t.text, marginTop: 2 }}>
                {info.balance ? `¥ ${info.balance}` : '—'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.text }}>
                {info.name ?? '已绑定'}
              </Text>
              <Text style={{ fontSize: 11, color: t.textTertiary, marginTop: 2 }}>
                {info.studentId ?? ''}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 11.5, color: t.textTertiary }}>电费房间</Text>
            <Text style={{ fontSize: 11.5, color: binding.room?.roomid ? t.text : t.textTertiary, flexShrink: 1 }}>
              {roomLabel || '进「电费充值」里选一次，之后自动记住'}
            </Text>

          </View>
          {roomDirty ? (
            <Text style={{ fontSize: 10.5, color: t.primary, marginTop: 6 }}>
              房间已清除。点下面「充宿舍电费」重新选一次，选完主页余额会自动换成新房间的。
            </Text>
          ) : binding.room?.roomid ? (
            <Text style={{ fontSize: 10.5, color: t.textTertiary, marginTop: 6 }}>
              选错了或换宿舍：点「重新选宿舍」清掉再选一次。
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <GhostButton
              label="刷新"
              icon="refresh-outline"
              onPress={() => {
                setReloadKey((k) => k + 1);
                webRef.current?.reload?.();
              }}
              style={{ flex: 1 }}
            />
            <GhostButton label="解除绑定" icon="unlink-outline" onPress={unbind} style={{ flex: 1 }} />
          </View>
          {binding.room?.roomid ? (
            <GhostButton
              label="重新选宿舍"
              icon="swap-horizontal-outline"
              onPress={changeRoom}
              style={{ marginTop: 10 }}
            />
          ) : null}
          <PrimaryButton
            label={showElepay ? '返回一卡通首页' : '充宿舍电费'}
            icon={showElepay ? 'card-outline' : 'flash-outline'}
            onPress={() => {
              setShowElepay((v) => !v);
              setReloadKey((k) => k + 1);
            }}
            style={{ marginTop: 10 }}
          />
        </Card>
      </View>

      <View style={{ flex: 1, marginTop: spacing.sm, overflow: 'hidden' }}>
        <Browser
          key={reloadKey}
          ref={webRef}
          source={{
            uri:
              showElepay && !pendingElepayRef.current
                ? elepayUrl(binding.openid)
                : ecardUrl(binding.openid),
          }}
          style={{ flex: 1, backgroundColor: t.bg }}
          onLoadEnd={(event: any) => {
            const url: string = event?.nativeEvent?.url ?? '';
            try {
              webRef.current?.injectJavaScript?.(PROBE_JS);
              if (pendingElepayRef.current && binding) {
                pendingElepayRef.current = false;
                setShowElepay(true);
                const target = JSON.stringify(elepayUrl(binding.openid));
                setTimeout(() => {
                  try {
                    webRef.current?.injectJavaScript?.(`window.location.href = ${target}; true;`);
                  } catch {}
                }, 600);
                return;
              }
              if (url.indexOf('elepay') >= 0) {
                if (binding.room?.roomid) {
                  webRef.current?.injectJavaScript?.(autofillRoomJs(binding.room));
                }
                // 选房间是异步加载的：每隔 3 秒把「房间 + 电费余额」各抓一次，30 秒后停
                clearInterval(pollRef.current as any);
                let tries = 0;
                pollRef.current = setInterval(() => {
                  tries += 1;
                  try {
                    webRef.current?.injectJavaScript?.(CAPTURE_ROOM_JS);
                    webRef.current?.injectJavaScript?.(CAPTURE_ELEC_JS);
                  } catch {}
                  if (tries >= 100) clearInterval(pollRef.current as any);
                  const bb = bindingRef.current;
                  if (bb?.room?.roomid && bb?.elecBalance) {
                    clearInterval(pollRef.current as any);
                  }
                }, 3000) as any;
              }
            } catch {}
          }}
          onMessage={onMessage}
          domStorageEnabled
          javaScriptEnabled
          setSupportMultipleWindows={false}
          onError={() => setInfo((prev) => prev)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  input: { borderRadius: radius.md, padding: spacing.md, fontSize: 12.5, minHeight: 80, marginTop: 12 },
  steps: { borderRadius: radius.md, padding: spacing.md, marginTop: 12 },
});
