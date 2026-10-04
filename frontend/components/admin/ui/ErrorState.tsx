import React from 'react';
import { View, Text } from 'react-native';
import { AlertCircle, RefreshCw } from 'lucide-react-native';
import { BRAND_COLORS } from '../../../constants';
import Button from './Button';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export default function ErrorState({
  title = 'Không thể tải dữ liệu',
  message = 'Đã có lỗi xảy ra khi kết nối tới máy chủ. Vui lòng thử lại.',
  onRetry,
  className = '',
}: ErrorStateProps) {
  return (
    <View className={`items-center justify-center py-12 px-4 gap-2 bg-red-50/40 rounded-2xl border border-red-200/50 ${className}`}>
      <View
        className="w-12 h-12 rounded-2xl items-center justify-center mb-1 bg-red-100"
      >
        <AlertCircle size={24} color={BRAND_COLORS.danger} />
      </View>
      <Text className="font-display font-bold text-base text-red-950 text-center">
        {title}
      </Text>
      {message && (
        <Text className="text-xs text-red-700 text-center max-w-md leading-relaxed">
          {message}
        </Text>
      )}
      {onRetry && (
        <View className="mt-3">
          <Button
            variant="outline"
            size="sm"
            onPress={onRetry}
            icon={<RefreshCw size={13} color={BRAND_COLORS.text} />}
            label="Thử lại"
          />
        </View>
      )}
    </View>
  );
}
