import React from 'react';
import { View, Text, Pressable, ViewStyle } from 'react-native';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react-native';
import { BRAND_COLORS } from '../../../constants';
import Skeleton from './Skeleton';

export interface StatCardDelta {
  percent?: number;
  isUp?: boolean;
  isNeutral?: boolean;
  text?: string;
}

export interface StatCardProps {
  label: string;
  value: string | number;
  delta?: StatCardDelta;
  subtext?: string;
  icon?: React.ReactNode;
  iconBg?: string;
  loading?: boolean;
  onPress?: () => void;
  className?: string;
  style?: ViewStyle;
}

export default function StatCard({
  label,
  value,
  delta,
  subtext,
  icon,
  iconBg,
  loading = false,
  onPress,
  className = '',
  style,
}: StatCardProps) {
  const content = (
    <View
      className={`bg-white rounded-2xl border border-brand-line/40 p-4 shadow-sm justify-between flex-1 ${className}`}
      style={[{ borderColor: BRAND_COLORS.line }, style]}
    >
      <View className="flex-row items-start justify-between gap-2 mb-2">
        <Text
          className="text-xs font-semibold text-brand-textMuted uppercase tracking-wider flex-1"
          numberOfLines={2}
        >
          {label}
        </Text>
        {icon && (
          <View
            className="w-9 h-9 rounded-xl items-center justify-center shrink-0"
            style={{ backgroundColor: iconBg || 'rgba(31, 111, 84, 0.08)' }}
          >
            {icon}
          </View>
        )}
      </View>

      <View className="gap-1 mt-1">
        {loading ? (
          <View className="gap-2">
            <Skeleton height={28} width="70%" borderRadius={6} />
            <Skeleton height={14} width="40%" borderRadius={4} />
          </View>
        ) : (
          <>
            <Text className="font-display font-bold text-2xl md:text-3xl text-brand-text">
              {value}
            </Text>

            {(delta || subtext) && (
              <View className="flex-row items-center flex-wrap gap-2 mt-1">
                {delta && (
                  <View
                    className="flex-row items-center px-1.5 py-0.5 rounded-md"
                    style={{
                      backgroundColor: delta.isNeutral
                        ? '#F3F4F6'
                        : delta.isUp
                        ? '#ECFDF5'
                        : '#FEF2F2',
                    }}
                  >
                    {delta.isNeutral ? (
                      <Minus size={11} color="#6B7280" />
                    ) : delta.isUp ? (
                      <ArrowUpRight size={13} color="#059669" />
                    ) : (
                      <ArrowDownRight size={13} color="#DC2626" />
                    )}
                    <Text
                      className="text-[11px] font-bold ml-0.5"
                      style={{
                        color: delta.isNeutral
                          ? '#6B7280'
                          : delta.isUp
                          ? '#059669'
                          : '#DC2626',
                      }}
                    >
                      {delta.text || `${delta.isUp ? '+' : ''}${delta.percent}%`}
                    </Text>
                  </View>
                )}
                {subtext && (
                  <Text className="text-xs text-brand-textMuted" numberOfLines={1}>
                    {subtext}
                  </Text>
                )}
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        className="flex-1"
        style={{ cursor: 'pointer' as any }}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}
