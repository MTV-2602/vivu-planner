import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { BRAND_COLORS } from '../../../constants';

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface FilterChipsProps {
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export default function FilterChips({
  options,
  value,
  onChange,
  className = '',
  size = 'md',
}: FilterChipsProps) {
  const isSm = size === 'sm';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className={`flex-row ${className}`}
      contentContainerStyle={{ gap: 6, alignItems: 'center' }}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            className={`flex-row items-center rounded-xl border transition-colors ${
              isSm ? 'px-2.5 py-1' : 'px-3 py-1.5'
            }`}
            style={{
              backgroundColor: active ? BRAND_COLORS.primary : '#FFFFFF',
              borderColor: active ? BRAND_COLORS.primary : BRAND_COLORS.line,
              cursor: 'pointer' as any,
            }}
          >
            <Text
              className={`font-semibold ${isSm ? 'text-[11px]' : 'text-xs'}`}
              style={{ color: active ? '#FFFFFF' : BRAND_COLORS.textSoft }}
            >
              {opt.label}
            </Text>
            {opt.count !== undefined && (
              <View
                className="ml-1.5 px-1.5 py-0.2 rounded-full"
                style={{
                  backgroundColor: active
                    ? 'rgba(255, 255, 255, 0.25)'
                    : 'rgba(27, 36, 32, 0.08)',
                }}
              >
                <Text
                  className="text-[10px] font-bold"
                  style={{ color: active ? '#FFFFFF' : BRAND_COLORS.textMuted }}
                >
                  {opt.count}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
