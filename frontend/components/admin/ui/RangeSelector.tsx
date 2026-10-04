import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { BRAND_COLORS } from '../../../constants';

export type AdminRange = '7d' | '30d' | '90d' | '365d';

export interface RangeSelectorProps {
  value: AdminRange;
  onChange: (range: AdminRange) => void;
  disabled?: boolean;
  className?: string;
}

const RANGES: { key: AdminRange; label: string }[] = [
  { key: '7d', label: '7 ngày' },
  { key: '30d', label: '30 ngày' },
  { key: '90d', label: '90 ngày' },
  { key: '365d', label: '12 tháng' },
];

export default function RangeSelector({
  value,
  onChange,
  disabled = false,
  className = '',
}: RangeSelectorProps) {
  return (
    <View
      className={`flex-row p-1 bg-white border border-brand-line/40 rounded-xl self-start ${className}`}
      style={{ opacity: disabled ? 0.6 : 1 }}
    >
      {RANGES.map((r) => {
        const active = value === r.key;
        return (
          <Pressable
            key={r.key}
            disabled={disabled}
            onPress={() => onChange(r.key)}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              active ? 'bg-brand-primary' : 'bg-transparent'
            }`}
            style={{
              backgroundColor: active ? BRAND_COLORS.primary : 'transparent',
              cursor: disabled ? 'default' : 'pointer',
            } as any}
          >
            <Text
              className={`text-xs font-semibold ${
                active ? 'text-white' : 'text-brand-textSoft'
              }`}
              style={{ color: active ? '#FFFFFF' : BRAND_COLORS.textSoft }}
            >
              {r.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
