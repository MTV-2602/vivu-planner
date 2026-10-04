import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { BRAND_COLORS } from '../../../constants';
import Skeleton from './Skeleton';
import EmptyState from './EmptyState';

export interface Column<T> {
  key: string;
  title: string;
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  render?: (row: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  loading?: boolean;
  emptyMessage?: string;
  emptyTitle?: string;
  onRowPress?: (item: T) => void;
  minWidth?: number;
  className?: string;
  skeletonRows?: number;
}

export default function DataTable<T>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyMessage = 'Không tìm thấy dữ liệu phù hợp.',
  emptyTitle = 'Chưa có bản ghi nào',
  onRowPress,
  minWidth = 720,
  className = '',
  skeletonRows = 5,
}: DataTableProps<T>) {
  return (
    <View className={`bg-white rounded-2xl border border-brand-line/40 overflow-hidden shadow-xs ${className}`}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ minWidth, width: '100%' }}>
          {/* Header Row */}
          <View className="flex-row items-center px-4 py-3 bg-slate-50/80 border-b border-brand-line/40">
            {columns.map((col) => {
              const alignClass =
                col.align === 'right'
                  ? 'text-right'
                  : col.align === 'center'
                  ? 'text-center'
                  : 'text-left';

              return (
                <View
                  key={col.key}
                  style={col.width ? { width: col.width as any, flexShrink: 0 } : { flex: 1 }}
                  className="px-2"
                >
                  <Text
                    className={`text-[10px] font-bold text-brand-textMuted uppercase tracking-wider ${alignClass}`}
                    numberOfLines={1}
                  >
                    {col.title}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Table Body */}
          {loading ? (
            <View className="p-4 gap-3">
              {Array.from({ length: skeletonRows }).map((_, rIdx) => (
                <View key={rIdx} className="flex-row items-center gap-3 py-2 border-b border-brand-line/10">
                  {columns.map((col) => (
                    <View
                      key={col.key}
                      style={col.width ? { width: col.width as any, flexShrink: 0 } : { flex: 1 }}
                      className="px-2"
                    >
                      <Skeleton height={14} width="85%" borderRadius={4} />
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : data.length === 0 ? (
            <EmptyState title={emptyTitle} description={emptyMessage} />
          ) : (
            <View>
              {data.map((row, index) => {
                const rowKey = keyExtractor(row, index);
                const isClickable = Boolean(onRowPress);

                const rowContent = (
                  <View
                    className={`flex-row items-center px-4 py-3.5 border-b border-brand-line/20 ${
                      isClickable ? 'hover:bg-slate-50' : ''
                    }`}
                  >
                    {columns.map((col) => {
                      const alignClass =
                        col.align === 'right'
                          ? 'items-end'
                          : col.align === 'center'
                          ? 'items-center'
                          : 'items-start';

                      return (
                        <View
                          key={col.key}
                          style={col.width ? { width: col.width as any, flexShrink: 0 } : { flex: 1 }}
                          className={`px-2 ${alignClass}`}
                        >
                          {col.render ? (
                            col.render(row, index)
                          ) : (
                            <Text
                              className="text-xs text-brand-text font-medium"
                              numberOfLines={1}
                            >
                              {String((row as any)[col.key] ?? '—')}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                );

                if (isClickable) {
                  return (
                    <Pressable
                      key={rowKey}
                      onPress={() => onRowPress && onRowPress(row)}
                      style={{ cursor: 'pointer' as any }}
                    >
                      {rowContent}
                    </Pressable>
                  );
                }

                return <View key={rowKey}>{rowContent}</View>;
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
