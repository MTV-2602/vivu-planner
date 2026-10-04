import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { BRAND_COLORS } from '../../../constants';

export interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems?: number;
  limit?: number;
  onPageChange: (newPage: number) => void;
  disabled?: boolean;
  className?: string;
}

export default function Pagination({
  page,
  totalPages,
  totalItems,
  limit,
  onPageChange,
  disabled = false,
  className = '',
}: PaginationProps) {
  const safeTotalPages = Math.max(1, totalPages || 1);
  const canPrev = page > 1 && !disabled;
  const canNext = page < safeTotalPages && !disabled;

  let infoText = `Trang ${page} / ${safeTotalPages}`;
  if (totalItems !== undefined && limit !== undefined) {
    const start = Math.min((page - 1) * limit + 1, totalItems);
    const end = Math.min(page * limit, totalItems);
    infoText = `${start}-${end} trong ${totalItems} kết quả (Trang ${page}/${safeTotalPages})`;
  }

  return (
    <View className={`flex-row items-center justify-between py-3 px-2 flex-wrap gap-2 ${className}`}>
      <Text className="text-xs text-brand-textMuted font-medium">
        {infoText}
      </Text>

      <View className="flex-row items-center gap-1.5">
        <Pressable
          disabled={!canPrev}
          onPress={() => canPrev && onPageChange(page - 1)}
          className={`px-2.5 py-1.5 rounded-lg border flex-row items-center gap-1 ${
            canPrev ? 'bg-white hover:bg-slate-50' : 'bg-slate-100 opacity-50'
          }`}
          style={{
            borderColor: BRAND_COLORS.line,
            cursor: canPrev ? 'pointer' : 'default',
          } as any}
        >
          <ChevronLeft size={14} color={canPrev ? BRAND_COLORS.text : BRAND_COLORS.textMuted} />
          <Text
            className="text-xs font-semibold"
            style={{ color: canPrev ? BRAND_COLORS.text : BRAND_COLORS.textMuted }}
          >
            Trước
          </Text>
        </Pressable>

        <Pressable
          disabled={!canNext}
          onPress={() => canNext && onPageChange(page + 1)}
          className={`px-2.5 py-1.5 rounded-lg border flex-row items-center gap-1 ${
            canNext ? 'bg-white hover:bg-slate-50' : 'bg-slate-100 opacity-50'
          }`}
          style={{
            borderColor: BRAND_COLORS.line,
            cursor: canNext ? 'pointer' : 'default',
          } as any}
        >
          <Text
            className="text-xs font-semibold"
            style={{ color: canNext ? BRAND_COLORS.text : BRAND_COLORS.textMuted }}
          >
            Sau
          </Text>
          <ChevronRight size={14} color={canNext ? BRAND_COLORS.text : BRAND_COLORS.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}
