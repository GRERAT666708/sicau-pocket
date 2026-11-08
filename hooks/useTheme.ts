import { useColorScheme } from 'react-native';
import { useAppState } from '@/lib/store';
import { themes, type Theme } from '@/constants/theme';

export function useTheme(): Theme {
  const { settings } = useAppState();
  const system = useColorScheme();
  const scheme = settings.theme === 'system' ? ((system ?? 'light') as 'light' | 'dark') : settings.theme;
  return themes[scheme] ?? themes.light;
}
