import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { BRAND_COLORS } from '../../../constants';

export interface CardProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export default function Card({
  title,
  subtitle,
  action,
  icon,
  children,
  className = '',
  style,
  padding = 'md',
}: CardProps) {
  const paddingClass =
    padding === 'none'
      ? 'p-0'
      : padding === 'sm'
      ? 'p-3'
      : padding === 'lg'
      ? 'p-6'
      : 'p-4 md:p-5';

  const hasHeader = Boolean(title || subtitle || action || icon);

  return (
    <View
      className={`bg-white rounded-2xl border border-brand-line/40 shadow-sm ${className}`}
      style={[{ borderColor: BRAND_COLORS.line }, style]}
    >
      {hasHeader && (
        <View className="flex-row items-center justify-between pb-3 px-4 pt-4 border-b border-brand-line/20">
          <View className="flex-row items-center gap-2 flex-1 mr-2">
            {icon && <View className="shrink-0">{icon}</View>}
            <View className="flex-1">
              {title && (
                <Text className="font-display font-bold text-base text-brand-text">
                  {title}
                </Text>
              )}
              {subtitle && (
                <Text className="text-xs text-brand-textMuted mt-0.5" numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
            </View>
          </View>
          {action && <View className="shrink-0">{action}</View>}
        </View>
      )}
      <View className={paddingClass}>{children}</View>
    </View>
  );
}
