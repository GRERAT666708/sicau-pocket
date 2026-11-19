import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/Glass';
import { PrimaryButton } from '@/components/UIKit';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { WhatsNewInfo } from '@/lib/whatsNew';

/**
 * 更新完成后的「这次更新了什么」小窗。
 * 只弹一次（看过的版本记在 AsyncStorage 里），首次安装不弹。
 */
export function WhatsNewModal({ info, onClose }: { info: WhatsNewInfo | null; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={!!info} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { paddingBottom: insets.bottom + spacing.lg }]} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460 }}>
          <GlassSurface strong radiusValue={radius.xl} contentStyle={{ padding: spacing.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: t.primarySoft,
                }}
              >
                <Ionicons name="sparkles-outline" size={20} color={t.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: t.text }}>更新完成</Text>
                <Text style={{ fontSize: 12.5, color: t.textTertiary, marginTop: 2 }}>
                  已升级到 v{info?.version ?? ''}
                </Text>
              </View>
            </View>

            <ScrollView style={{ maxHeight: 320, marginTop: spacing.lg }} showsVerticalScrollIndicator={false}>
              {(info?.notes ?? []).map((note, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      marginTop: 7,
                      backgroundColor: t.primary,
                    }}
                  />
                  <Text style={{ flex: 1, fontSize: 14, lineHeight: 21, color: t.textSecondary }}>{note}</Text>
                </View>
              ))}
            </ScrollView>

            <PrimaryButton label="知道了" onPress={onClose} style={{ marginTop: spacing.md }} />
          </GlassSurface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,20,14,0.55)',
  },
});
