import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 校园一卡通（微信端 H5）绑定信息。
 *
 * 学校给学生的官方入口是「智慧川农 → 一卡通服务」，那是一个只有微信里才能进的 H5：
 * https://yktwechat.sicau.edu.cn/home/openHomePage?openid=xxxx
 * 只要带上 openid，页面就能直接渲染（实测和 UA 无关、也不需要微信 JSSDK），
 * 所以我们让用户把链接粘进来，取出 openid 存在本机，之后用它打开这个 H5。
 *
 * openid 相当于这辆车的钥匙：只写本机 AsyncStorage，不上传、不进日志。
 */
export const ECARD_KEY = '@sicau-pocket/ecard/v1';
export const ECARD_HOST = 'https://yktwechat.sicau.edu.cn';
export const ECARD_HOME = `${ECARD_HOST}/home/openHomePage`;

export type EcardBinding = {
  openid: string;
  boundAt: number;
  /** 上次从页面里读到的信息，用来在没网时也有东西可显示 */
  name?: string;
  studentId?: string;
  balance?: string;
  /** 电费充值页里记住的「校区/楼栋/楼层/房间」代码，下次自动带出 */
  room?: {
    factorycode?: string;
    buildid?: string;
    floorid?: string;
    roomid?: string;
    label?: string;
    savedAt?: number;
  };
};

export function parseOpenid(input: string): string | null {
  if (!input) return null;
  const text = input.trim();
  // 直接粘贴 openid 本身
  if (/^[A-Za-z0-9]{16,128}$/.test(text) && !/^https?:/i.test(text)) return text;
  const m = text.match(/openid=([A-Za-z0-9_-]{16,128})/i);
  return m ? m[1] : null;
}

/** 电费充值页（一卡通 H5 里的子页面），带上 openid 就能直达 */
export function elepayUrl(openid: string): string {
  return `${ECARD_HOST}/elepay/openElePay?openid=${encodeURIComponent(openid)}&displayflag=1&id=29111`;
}

export function ecardUrl(openid: string): string {
  return `${ECARD_HOME}?openid=${encodeURIComponent(openid)}`;
}

export async function loadEcard(): Promise<EcardBinding | null> {
  try {
    const raw = await AsyncStorage.getItem(ECARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EcardBinding;
    if (!parsed?.openid) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveEcard(patch: Partial<EcardBinding> & { openid: string }): Promise<EcardBinding> {
  const prev = await loadEcard();
  const next: EcardBinding = {
    openid: patch.openid,
    room: patch.room ?? prev?.room,
    boundAt: prev?.openid === patch.openid ? prev.boundAt : Date.now(),
    name: patch.name ?? prev?.name,
    studentId: patch.studentId ?? prev?.studentId,
    balance: patch.balance ?? prev?.balance,
  };
  await AsyncStorage.setItem(ECARD_KEY, JSON.stringify(next));
  return next;
}

export async function clearEcard(): Promise<void> {
  await AsyncStorage.removeItem(ECARD_KEY);
}

/** 从页面纯文本里抠出姓名 / 学号 / 余额（各家 H5 文案略有差别，这里都兜一下） */
export function parseEcardInfo(text: string): { name?: string; studentId?: string; balance?: string } {
  const out: { name?: string; studentId?: string; balance?: string } = {};
  const balance = text.match(/余额[:：]\s*￥?\s*([\d,]+(?:\.\d{1,2})?)/);
  if (balance) out.balance = balance[1].replace(/,/g, '');
  const sid = text.match(/\b(20\d{8})\b/);
  if (sid) out.studentId = sid[1];
  const name = text.match(/(?:四川农业大学)\s*([\u4e00-\u9fa5]{2,4})\s+\d{9,12}/);
  if (name) out.name = name[1];
  return out;
}
