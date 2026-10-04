import React from 'react';
import { View, Text } from 'react-native';
import { Inbox } from 'lucide-react-native';
import { BRAND_COLORS } from '../../../constants';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export default function EmptyState({
  icon,
  title = 'Không có dữ liệu',
  description = 'Hiện chưa có mục nào phù hợp với bộ lọc này.',
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <View className={`items-center justify-center py-12 px-4 gap-2 ${className}`}>
      <View
        className="w-12 h-12 rounded-2xl items-center justify-center mb-1"
        style={{ backgroundColor: 'rgba(27, 36, 32, 0.05)' }}
      >
        {icon || <Inbox size={24} color={BRAND_COLORS.textMuted} />}
      </View>
      <Text className="font-display font-bold text-base text-brand-text text-center">
        {title}
      </Text>
      {description && (
        <Text className="text-xs text-brand-textMuted text-center max-w-sm leading-relaxed">
          {description}
        </Text>
      )}
      {action && <View className="mt-3">{action}</View>}
    </View>
  );
}
