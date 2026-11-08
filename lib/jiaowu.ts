/**
 * 川农教务系统（jiaowu.sicau.edu.cn，老版正方 ASP）直连。
 *
 * 已知事实（2026-11 实测）：
 *  - 登录页 https://jiaowu.sicau.edu.cn/web/web/web/index.asp（GB2312），
 *    表单 POST 到 https://jiaowu.sicau.edu.cn/jiaoshi/bangong/check.asp，
 *    字段：user 学号、pwd 密码、lb=S(学生)/T(教师)、sign、hour_key（页面里带的一次性 token）
 *  - 另有一个统一身份认证入口：/jiaoshi/aspsso/caslogin.asp → auth.sicau.edu.cn（SPA，未接）
 *  - 公开的教室课表：/web/web/js_kb_cha/kbjshi.asp?bianhao=xxx
 *
 * 因为没法在学校侧验证账号密码流程，这里的策略是：
 *   1) 登录后把首页所有「课表」相关链接抓出来逐个尝试；
 *   2) 任何一个页能解析出课程就算成功；
 *   3) 失败时把每一步的 HTTP 状态回传给 UI，方便你自己排查。
 */

import { decodeGb2312, encodeGb2312Form } from './gb2312';
import { extractLinks } from './html';
import { parseTimetableAny, timetableDiagnostics, type ParsedSlot } from './timetable';

export const JIAOWU = {
  base: 'https://jiaowu.sicau.edu.cn',
  loginPage: 'https://jiaowu.sicau.edu.cn/web/web/web/index.asp',
  loginPost: 'https://jiaowu.sicau.edu.cn/jiaoshi/bangong/check.asp',
  casLogin: 'https://jiaowu.sicau.edu.cn/jiaoshi/aspsso/caslogin.asp',
  classroomList: 'https://jiaowu.sicau.edu.cn/web/web/js_kb_cha/jshi_yk.asp',
  classroomTimetable: 'https://jiaowu.sicau.edu.cn/web/web/js_kb_cha/kbjshi.asp',
} as const;

/**
 * 校园 WebVPN（网瑞达 wengine）。
 *
 * 校园网之外直接开 jiaowu 常常打不开或者被校园网策略挡住；走 WebVPN 就是先登一次
 * 统一身份认证，再通过 https://webvpn.sicau.edu.cn/https/... 代理访问内网系统。
 * 代理出来的页面 DOM 和直连一样，课表解析代码不用改。
 */
export const VPN = {
  home: 'https://webvpn.sicau.edu.cn/',
  login: 'https://webvpn.sicau.edu.cn/login',
} as const;

export type Step = { title: string; detail: string; ok: boolean };

export type ImportResult = {
  ok: boolean;
  message: string;
  steps: Step[];
  slots: ParsedSlot[];
  url?: string;
};

type CookieJar = Map<string, string>;

function absorbCookies(jar: CookieJar, response: Response): void {
  const raw =
    response.headers.get('set-cookie') ??
    // 某些 RN 版本把多个 cookie 塞进数组或逗号拼接
    (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.()?.join(',') ??
    '';
  if (!raw) return;
  for (const part of raw.split(/,(?=[^;=]+=)/)) {
    const pair = part.split(';')[0]?.trim();
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function request(
  jar: CookieJar,
  url: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<{ response: Response; text: string }> {
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
    Accept: 'text/html,application/xhtml+xml',
    ...init.headers,
  };
  const cookies = cookieHeader(jar);
  if (cookies) headers.Cookie = cookies;
  const response = await fetch(url, {
    method: init.method ?? 'GET',
    body: init.body,
    headers,
    redirect: 'follow',
  });
  absorbCookies(jar, response);
  const buffer = await response.arrayBuffer();
  const text = decodeGb2312(buffer);
  return { response, text };
}

function formBody(fields: Record<string, string>): string {
  // 教务系统是 GB2312 代码页的 ASP 站点，中文（比如密码里的全角「！」）必须按 GB2312 发
  return encodeGb2312Form(fields);
}

/** 老 ASP 页面用 alert('…') 报错，把这句话抠出来给用户看 */
function alertMessage(html: string): string {
  const matched = html.match(/alert\(\s*['"]([^'"]+)['"]\s*\)/);
  return matched?.[1]?.trim() ?? '';
}

export type LoginRole = 'S' | 'T';

export type LoginInput = { studentId: string; password: string; role?: LoginRole };

export function jiaowuAvailable(): boolean {
  return true;
}

/**
 * 第一步：登录。返回 cookie jar，失败时带上每一步的诊断信息。
 */
export async function loginJiaowu({ studentId, password, role = 'S' }: LoginInput): Promise<{
  ok: boolean;
  message: string;
  steps: Step[];
  jar?: CookieJar;
}> {
  const jar: CookieJar = new Map();
  const steps: Step[] = [];

  const fail = (message: string) => ({ ok: false, message, steps, jar: undefined as CookieJar | undefined });

  if (!/^\d{6,14}$/.test(studentId.trim())) {
    return fail('学号看起来不对（应为 6–14 位数字）');
  }
  if (password.length < 4) return fail('密码太短');

  let loginHtml = '';
  try {
    const { response, text } = await request(jar, JIAOWU.loginPage);
    loginHtml = text;
    steps.push({ title: '打开登录页', detail: `HTTP ${response.status}`, ok: response.status === 200 });
    if (response.status !== 200) return fail(`登录页打不开（HTTP ${response.status}）`);
  } catch (error) {
    steps.push({ title: '打开登录页', detail: String(error), ok: false });
    return fail('连不上教务系统，检查网络或校园网');
  }

  const sign = loginHtml.match(/name=["']?sign["']?[^>]*value=["']([^"']+)/i)?.[1] ?? '';
  const hourKey = loginHtml.match(/name=["']?hour_key["']?[^>]*value=["']([^"']+)/i)?.[1] ?? '';
  steps.push({
    title: '读取一次性参数',
    detail: `sign=${sign ? '有' : '缺'} hour_key=${hourKey ? '有' : '缺'}`,
    ok: Boolean(sign && hourKey),
  });
  if (!sign || !hourKey) {
    return fail('登录页格式变了（没找到 sign/hour_key），请把这个问题反馈给开发者');
  }

  try {
    const { response, text } = await request(jar, JIAOWU.loginPost, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: JIAOWU.loginPage,
        Origin: JIAOWU.base,
      },
      // lb：教务系统用这个字段区分学生(S)和教师(T)，学生端必须带 S
      body: formBody({ user: studentId.trim(), pwd: password, lb: role, sign, hour_key: hourKey, submit: '' }),
    });
    const serverSays = alertMessage(text);
    const rejected =
      Boolean(serverSays) || /用户名不能为空|密码不能为空|密码错误|登录失败|错误的|不存在/i.test(text);
    steps.push({
      title: '提交账号密码',
      detail: serverSays
        ? `教务系统：${serverSays}`
        : `HTTP ${response.status}，返回 ${text.length} 字节`,
      ok: response.status === 200 && !rejected,
    });
    if (serverSays) return fail(serverSays);
    if (rejected) return fail('账号或密码不正确（教务系统拒绝了这次登录）');
  } catch (error) {
    steps.push({ title: '提交账号密码', detail: String(error), ok: false });
    return fail('提交登录请求失败');
  }

  // 关键一步：check.asp 即使密码错也可能返回 200，必须回个人主页确认真的登录成功
  try {
    const { response, text } = await request(jar, `${JIAOWU.base}/jiaoshi/bangong/index.asp`);
    const loggedIn = /退出|注销|安全退出|欢迎|同学|老师/.test(text) && !/name=["']?pwd["']?/i.test(text);
    steps.push({
      title: '确认登录状态',
      detail: loggedIn ? '已进入个人主页' : '仍停在登录页（账号或密码不对）',
      ok: loggedIn && response.status === 200,
    });
    if (!loggedIn) return fail('账号或密码不正确；如果密码没错，可能是教务系统改版了');
  } catch (error) {
    steps.push({ title: '确认登录状态', detail: String(error), ok: false });
    return fail('登录后无法打开个人主页');
  }

  return { ok: true, message: '登录成功', steps, jar };
}

const TIMETABLE_HINT = /(课表|kb|kbcx|kbxx|xsgrxx|grxx)/i;

/** 第二步：登录后在首页/个人页里找课表页并解析 */
export async function fetchTimetableAfterLogin(jar: CookieJar): Promise<ImportResult> {
  const steps: Step[] = [];
  const candidates: string[] = [];

  for (const page of [JIAOWU.base + '/jiaoshi/bangong/index.asp', JIAOWU.base + '/web/web/web/index.asp']) {
    try {
      const { response, text } = await request(jar, page);
      steps.push({ title: '打开个人主页', detail: `${page} → HTTP ${response.status}`, ok: response.status === 200 });
      if (response.status !== 200) continue;
      for (const link of extractLinks(text)) {
        if (!TIMETABLE_HINT.test(link.text) && !TIMETABLE_HINT.test(link.href)) continue;
        const absolute = link.href.startsWith('http')
          ? link.href
          : new URL(link.href, page).toString();
        if (!candidates.includes(absolute)) candidates.push(absolute);
      }
      if (candidates.length) break;
    } catch (error) {
      steps.push({ title: '打开个人主页', detail: String(error), ok: false });
    }
  }

  steps.push({
    title: '找到课表候选页',
    detail: candidates.length ? candidates.slice(0, 5).join('\n') : '没找到，可能教务系统改版了',
    ok: candidates.length > 0,
  });

  for (const url of candidates.slice(0, 8)) {
    try {
      const { response, text } = await request(jar, url);
      if (response.status !== 200) continue;
      const slots = parseTimetableAny(text);
      steps.push({ title: '解析课表', detail: `${url} → ${slots.length} 条`, ok: slots.length > 0 });
      if (slots.length) return { ok: true, message: `导入成功，共 ${slots.length} 条上课记录`, steps, slots, url };
    } catch (error) {
      steps.push({ title: '解析课表', detail: `${url} → ${String(error)}`, ok: false });
    }
  }

  return {
    ok: false,
    message: '登录成功，但没在教务系统里找到可解析的课表页面',
    steps,
    slots: [],
  };
}

/** 抓一个公开的教务页面（教室课表、教室列表等，不需要登录） */
export async function fetchJiaowuPage(
  url: string,
): Promise<{ ok: boolean; text: string; status: number; error?: string }> {
  const jar: CookieJar = new Map();
  try {
    const { response, text } = await request(jar, url);
    return { ok: response.status === 200, text, status: response.status };
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    if (__DEV__) console.log('[sicau] fetchJiaowuPage failed', url, message);
    return { ok: false, text: '', status: 0, error: message };
  }
}

/** 一次性：登录 + 抓课表 */
export async function importFromJiaowu(input: LoginInput): Promise<ImportResult> {
  const login = await loginJiaowu(input);
  if (!login.ok || !login.jar) {
    return { ok: false, message: login.message, steps: login.steps, slots: [] };
  }
  const result = await fetchTimetableAfterLogin(login.jar);
  return { ...result, steps: [...login.steps, ...result.steps] };
}

/** 链接导入：给一个课表页 URL，直接抓下来解析（页面公开时不需要登录） */
export async function importFromUrl(url: string): Promise<ImportResult> {
  const steps: Step[] = [];
  const jar: CookieJar = new Map();
  const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  if (!/jiaowu\.sicau\.edu\.cn/.test(normalized)) {
    steps.push({ title: '检查链接', detail: '只支持 jiaowu.sicau.edu.cn 域名', ok: false });
    return { ok: false, message: '请填教务系统的课表链接', steps, slots: [] };
  }
  try {
    const { response, text } = await request(jar, normalized);
    steps.push({ title: '抓取页面', detail: `HTTP ${response.status}，${text.length} 字节`, ok: response.status === 200 });
    const slots = parseTimetableAny(text);
    steps.push({ title: '解析课表', detail: `${slots.length} 条上课记录`, ok: slots.length > 0 });
    if (!slots.length) {
      return {
        ok: false,
        message: `页面上没解析出课程（${timetableDiagnostics(text)}）`,
        steps,
        slots: [],
      };
    }
    return { ok: true, message: `解析成功，共 ${slots.length} 条`, steps, slots, url: normalized };
  } catch (error) {
    steps.push({ title: '抓取页面', detail: String(error), ok: false });
    return { ok: false, message: '抓取失败，检查网络', steps, slots: [] };
  }
}

/** 源码导入：用户把课表网页另存/复制源码粘进来 */
export function importFromHtml(html: string): ImportResult {
  const steps: Step[] = [{ title: '检查输入', detail: `${html.length} 个字符`, ok: html.length > 200 }];
  if (html.length <= 200) {
    return { ok: false, message: '内容太短，像是没复制全', steps, slots: [] };
  }
  const slots = parseTimetableAny(html);
  steps.push({ title: '解析课表', detail: `${slots.length} 条上课记录`, ok: slots.length > 0 });
  if (!slots.length) {
    return {
      ok: false,
      message: `没解析出课程（${timetableDiagnostics(html)}）。确认复制的是课表页面源码，或者改用「App 里登录教务网」直接导入`,
      steps,
      slots: [],
    };
  }
  return { ok: true, message: `解析成功，共 ${slots.length} 条`, steps, slots };
}
