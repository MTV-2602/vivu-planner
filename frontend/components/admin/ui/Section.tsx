import React from 'react';
import { View, Text, ViewStyle } from 'react-native';

export interface SectionProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
}

export default function Section({
  title,
  subtitle,
  action,
  children,
  className = '',
  style,
}: SectionProps) {
  return (
    <View className={`gap-3 w-full ${className}`} style={style}>
      {(title || subtitle || action) && (
        <View className="flex-row items-end justify-between flex-wrap gap-2">
          <View className="flex-1">
            {title && (
              <Text className="font-display font-bold text-lg text-brand-text">
                {title}
              </Text>
            )}
            {subtitle && (
              <Text className="text-xs text-brand-textSoft mt-0.5">
                {subtitle}
              </Text>
            )}
          </View>
          {action && <View className="shrink-0">{action}</View>}
        </View>
      )}
      {children}
    </View>
  );
}
