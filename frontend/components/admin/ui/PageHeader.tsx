import React from 'react';
import { View, Text } from 'react-native';

export interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export default function PageHeader({
  title,
  description,
  action,
  badge,
  className = '',
}: PageHeaderProps) {
  return (
    <View
      className={`flex-row items-start md:items-center justify-between flex-wrap gap-4 pb-4 border-b border-brand-line/30 ${className}`}
    >
      <View className="gap-1 flex-1 min-w-[240px]">
        <View className="flex-row items-center gap-2.5 flex-wrap">
          <Text className="font-display font-extrabold text-2xl md:text-3xl text-brand-text">
            {title}
          </Text>
          {badge}
        </View>
        {description && (
          <Text className="text-xs md:text-sm text-brand-textSoft">
            {description}
          </Text>
        )}
      </View>

      {action && (
        <View className="flex-row items-center gap-2.5 flex-wrap shrink-0">
          {action}
        </View>
      )}
    </View>
  );
}
