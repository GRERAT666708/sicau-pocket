import React from 'react';
import { Text, View } from 'react-native';
import type { HeatCell } from '@/lib/stats';
import { useTheme } from '@/hooks/useTheme';

const SIZE = 12;
const GAP = 3;

export function Heatmap({ cells }: { cells: HeatCell[] }) {
  const t = useTheme();
  const columns: HeatCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) columns.push(cells.slice(i, i + 7));
  const shade = (level: number) => {
    if (level === 0) return t.surfaceAlt;
    if (level === 1) return `${t.primary}40`;
    if (level === 2) return `${t.primary}70`;
    if (level === 3) return `${t.primary}B0`;
    return t.primary;
  };
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: GAP }}>
        {columns.map((col, ci) => (
          <View key={ci} style={{ gap: GAP }}>
            {col.map((cell, ri) => (
              <View
                key={ri}
                style={{
                  width: SIZE,
                  height: SIZE,
                  borderRadius: 3,
                  backgroundColor: shade(cell.level),
                }}
              />
            ))}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 }}>
        <Text style={{ fontSize: 10.5, color: t.textTertiary }}>少</Text>
        {[0, 1, 2, 3, 4].map((l) => (
          <View key={l} style={{ width: 9, height: 9, borderRadius: 2.5, backgroundColor: shade(l) }} />
        ))}
        <Text style={{ fontSize: 10.5, color: t.textTertiary }}>多</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 10.5, color: t.textTertiary }}>近 17 周</Text>
      </View>
    </View>
  );
}
