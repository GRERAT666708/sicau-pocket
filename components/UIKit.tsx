import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { AppBackground } from './AppBackground';
import { GlassPressable, GlassSurface } from './Glass';

export function Screen({
  children,
  scroll = true,
  padded = true,
  background,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  background?: string;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const inner = (
    <View
      style={[
        { paddingHorizontal: padded ? spacing.lg : 0, paddingBottom: 120 },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );
  if (!scroll) {
    return (
      <AppBackground style={background ? { backgroundColor: background } : undefined}>
        <View style={{ flex: 1, paddingTop: insets.top }}>{inner}</View>
      </AppBackground>
    );
  }
  return (
    <AppBackground style={background ? { backgroundColor: background } : undefined}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + spacing.sm }}
        showsVerticalScrollIndicator={false}
      >
        {inner}
      </ScrollView>
    </AppBackground>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const t = useTheme();
  if (onPress) {
    return (
      <GlassPressable onPress={onPress} style={style} contentStyle={{ padding: spacing.lg }}>
        {children}
      </GlassPressable>
    );
  }
  return (
    <GlassSurface style={style} contentStyle={{ padding: spacing.lg }}>
      {children}
    </GlassSurface>
  );
}

export function SectionTitle({
  title,
  action,
  onAction,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }, style]}>
      <Text style={{ fontSize: 17, fontWeight: '700', color: t.text, letterSpacing: 0.2 }}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={{ fontSize: 13, color: t.textSecondary }}>{action}</Text>
          <Ionicons name="chevron-forward" size={13} color={t.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  tone = 'default',
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  tone?: 'default' | 'primary';
}) {
  const t = useTheme();
  const bg = active ? (tone === 'primary' ? t.primary : t.primarySoft) : t.surfaceAlt;
  const fg = active ? (tone === 'primary' ? t.onPrimary : t.primary) : t.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: bg,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontSize: 13, fontWeight: active ? '600' : '500', color: fg }}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ text, tone = 'soft' }: { text: string; tone?: 'soft' | 'warn' | 'primary' }) {
  const t = useTheme();
  const bg = tone === 'warn' ? t.accentSoft : tone === 'primary' ? t.primary : t.primarySoft;
  const fg = tone === 'warn' ? t.accent : tone === 'primary' ? t.onPrimary : t.primary;
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: bg }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: fg }}>{text}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  icon,
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          borderRadius: radius.pill,
          overflow: 'hidden',
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
          shadowColor: t.primaryDark,
          shadowOpacity: disabled ? 0 : 0.32,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: disabled ? 0 : 6,
        },
        style,
      ]}
    >
      <LinearGradient
        colors={disabled ? [t.surfaceAlt, t.surfaceAlt] : [t.primary, t.primaryDark]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ paddingVertical: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '52%',
            backgroundColor: 'rgba(255,255,255,0.22)',
            borderTopLeftRadius: radius.pill,
            borderTopRightRadius: radius.pill,
            opacity: 0.55,
          }}
        />
        {loading ? (
          <ActivityIndicator color={t.onPrimary} />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={18} color={disabled ? t.textTertiary : t.onPrimary} /> : null}
            <Text style={{ color: disabled ? t.textTertiary : t.onPrimary, fontSize: 15, fontWeight: '700' }}>{label}</Text>
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingVertical: 13,
          paddingHorizontal: 16,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          backgroundColor: t.surfaceAlt,
          opacity: pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={t.text} /> : null}
      <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  danger,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 13,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {icon ? (
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            backgroundColor: danger ? '#FBE7E5' : t.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={18} color={danger ? t.danger : t.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: danger ? t.danger : t.text, fontWeight: '500' }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 12, color: t.textTertiary, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={t.textTertiary} /> : null)}
    </Pressable>
  );
}

export function EmptyState({
  icon = 'sparkles-outline',
  title,
  desc,
  action,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, gap: 8 }}>
      <View
        style={{
          width: 54,
          height: 54,
          borderRadius: 27,
          backgroundColor: t.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
        }}
      >
        <Ionicons name={icon} size={26} color={t.primary} />
      </View>
      <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>{title}</Text>
      {desc ? <Text style={{ fontSize: 13, color: t.textTertiary, textAlign: 'center', maxWidth: 260 }}>{desc}</Text> : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}
