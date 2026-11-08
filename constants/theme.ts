export type ColorScheme = 'light' | 'dark';

export type Theme = {
  scheme: ColorScheme;
  bg: string;
  bgSoft: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  primary: string;
  primaryDark: string;
  primarySoft: string;
  onPrimary: string;
  accent: string;
  accentSoft: string;
  danger: string;
  shadow: string;
  /** 液态玻璃：背景渐变（自下而上由浅到深） */
  bgGradient: [string, string, string];
  /** 玻璃材质底色（叠在模糊层上，半透明） */
  glassTint: string;
  /** 玻璃边缘高光 */
  glassBorder: string;
  /** 玻璃顶部镜面高光 */
  glassHighlight: string;
  /** 深色玻璃（给主按钮/浮层用） */
  glassStrong: string;
};

const light: Theme = {
  scheme: 'light',
  bg: '#F4F7F3',
  bgSoft: '#E9F0E9',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF3ED',
  text: '#12201A',
  textSecondary: '#5C6D63',
  textTertiary: '#8B9A90',
  border: '#E2EAE2',
  primary: '#0E7A43',
  primaryDark: '#0A5C33',
  primarySoft: '#E1F2E7',
  onPrimary: '#FFFFFF',
  accent: '#C97B2E',
  accentSoft: '#FBEDDC',
  danger: '#C0443B',
  shadow: 'rgba(18, 48, 30, 0.08)',
  bgGradient: ['#F8FCF9', '#EFF6F0', '#E4EFE7'],
  glassTint: 'rgba(255, 255, 255, 0.70)',
  glassBorder: 'rgba(255, 255, 255, 0.85)',
  glassHighlight: 'rgba(255, 255, 255, 0.75)',
  glassStrong: 'rgba(255, 255, 255, 0.84)',
};

const dark: Theme = {
  scheme: 'dark',
  bg: '#0E1411',
  bgSoft: '#131C16',
  surface: '#17211B',
  surfaceAlt: '#1E2A22',
  text: '#ECF3ED',
  textSecondary: '#9CB0A2',
  textTertiary: '#71857A',
  border: '#28352C',
  primary: '#5BC98C',
  primaryDark: '#3EA96F',
  primarySoft: '#1B3626',
  onPrimary: '#06210F',
  accent: '#E3A25E',
  accentSoft: '#33261A',
  danger: '#E07A72',
  shadow: 'rgba(0, 0, 0, 0.45)',
  bgGradient: ['#101815', '#0C1310', '#070B09'],
  glassTint: 'rgba(30, 44, 36, 0.66)',
  glassBorder: 'rgba(255, 255, 255, 0.14)',
  glassHighlight: 'rgba(255, 255, 255, 0.18)',
  glassStrong: 'rgba(26, 38, 31, 0.88)',
};

export const themes: Record<ColorScheme, Theme> = { light, dark };

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 32,
};

/** 课程色板：浅色底 + 深色前景，深色模式下自动降饱和 */
export const coursePalette: { bg: string; fg: string; darkBg: string; darkFg: string }[] = [
  { bg: '#DCEFE3', fg: '#0B5C33', darkBg: '#1C3B2A', darkFg: '#9BE3B9' },
  { bg: '#FBE7D3', fg: '#8A4B12', darkBg: '#3B2A19', darkFg: '#F0C48F' },
  { bg: '#E4E3F7', fg: '#3E3A99', darkBg: '#2A2745', darkFg: '#C2BEF5' },
  { bg: '#FADDE3', fg: '#9A2F47', darkBg: '#3D1F27', darkFg: '#F3A8B8' },
  { bg: '#D9EEF4', fg: '#155B70', darkBg: '#16323B', darkFg: '#9BD8E8' },
  { bg: '#F3ECD3', fg: '#6E5A16', darkBg: '#37301A', darkFg: '#E6D79B' },
  { bg: '#E2EFD8', fg: '#3D6417', darkBg: '#26361B', darkFg: '#BCE29A' },
];

export function courseColors(index: number, scheme: ColorScheme) {
  const c = coursePalette[Math.abs(index) % coursePalette.length];
  return scheme === 'dark' ? { bg: c.darkBg, fg: c.darkFg } : { bg: c.bg, fg: c.fg };
}
