import React from 'react';
import { View, Text } from 'react-native';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

const TONE_STYLES: Record<BadgeTone, { bg: string; text: string; border: string; dot: string }> = {
  neutral: {
    bg: '#F3F4F6',
    text: '#4B5563',
    border: 'rgba(107, 114, 128, 0.2)',
    dot: '#6B7280',
  },
  success: {
    bg: '#ECFDF5',
    text: '#065F46',
    border: 'rgba(16, 185, 129, 0.25)',
    dot: '#10B981',
  },
  warning: {
    bg: '#FFFBEB',
    text: '#92400E',
    border: 'rgba(245, 158, 11, 0.3)',
    dot: '#F59E0B',
  },
  danger: {
    bg: '#FEF2F2',
    text: '#991B1B',
    border: 'rgba(239, 68, 68, 0.25)',
    dot: '#EF4444',
  },
  info: {
    bg: '#EFF6FF',
    text: '#1E40AF',
    border: 'rgba(59, 130, 246, 0.25)',
    dot: '#3B82F6',
  },
  brand: {
    bg: 'rgba(31, 111, 84, 0.1)',
    text: '#1F6F54',
    border: 'rgba(31, 111, 84, 0.25)',
    dot: '#1F6F54',
  },
};

export default function Badge({
  label,
  tone = 'neutral',
  size = 'md',
  dot = false,
  className = '',
}: BadgeProps) {
  const styles = TONE_STYLES[tone] || TONE_STYLES.neutral;
  const isSm = size === 'sm';

  return (
    <View
      className={`flex-row items-center rounded-full border self-start ${isSm ? 'px-2 py-0.5' : 'px-2.5 py-1'} ${className}`}
      style={{ backgroundColor: styles.bg, borderColor: styles.border }}
    >
      {dot && (
        <View
          className={`rounded-full mr-1.5 ${isSm ? 'w-1.5 h-1.5' : 'w-2 h-2'}`}
          style={{ backgroundColor: styles.dot }}
        />
      )}
      <Text
        className={`font-semibold ${isSm ? 'text-[10px]' : 'text-xs'}`}
        style={{ color: styles.text }}
      >
        {label}
      </Text>
    </View>
  );
}
