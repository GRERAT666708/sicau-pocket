/**
 * 四川农业大学各系统的接入层（当前为演示实现）
 *
 * 设计意图：页面只依赖这里的函数签名，将来把 demo 分支换成真实请求，
 * 页面与状态管理一行都不用改。接入细节见 docs/sicau-api.md。
 */

export type SicauMode = 'demo' | 'live';

/** 通过 EXPO_PUBLIC_SICAU_MODE=live 切换，默认 demo */
export const SICAU_MODE: SicauMode = process.env.EXPO_PUBLIC_SICAU_MODE === 'live' ? 'live' : 'demo';

export const SICAU_ENDPOINTS = {
  /** 川农e认证（统一身份认证，Wisedu CAS） */
  cas: 'https://auth.sicau.edu.cn',
  casLogin: 'https://auth.sicau.edu.cn/login',
  /** 教务处（旧版正方教务系统） */
  jiaowu: 'https://jiaowu.sicau.edu.cn',
  /** 图书馆 */
  library: 'https://lib.sicau.edu.cn',
  /** 学校主页 */
  home: 'https://www.sicau.edu.cn',
} as const;

export type CasLoginInput = {
  studentId: string;
  password: string;
  /** CAS 登录成功后回跳的服务地址 */
  service: string;
};

export type CasLoginResult =
  | { ok: true; ticket: string; cookies: string[] }
  | { ok: false; message: string };

/**
 * demo 模式：不发起任何网络请求，只做格式校验。
 * live 模式：应在 WebView 中打开 CAS 登录页，拦截跳转拿到 ticket，
 * 再带着 Cookie 请求教务 / 一卡通接口（RN 的 fetch 需要手动管理 Set-Cookie）。
 */
export async function loginWithCas(input: CasLoginInput): Promise<CasLoginResult> {
  if (SICAU_MODE === 'demo') {
    if (!/^\d{8,14}$/.test(input.studentId)) return { ok: false, message: '学号格式不正确' };
    if (input.password.length < 4) return { ok: false, message: '密码长度不足（演示模式不校验真实密码）' };
    return { ok: true, ticket: `demo-ticket-${Date.now().toString(36)}`, cookies: [] };
  }
  // TODO(live): 走 WebView + CAS，拿到 service ticket 后校验
  return { ok: false, message: '尚未接入真实统一身份认证，请设置 SICAU_MODE=demo' };
}

/** 教务课表接口占位：真实实现需解析旧版正方返回的课表 HTML */
export async function fetchTimetable(_ticket: string): Promise<never[]> {
  if (SICAU_MODE === 'demo') return [];
  throw new Error('timetable integration not implemented yet');
}
