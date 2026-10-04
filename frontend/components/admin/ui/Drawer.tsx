import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { X } from 'lucide-react-native';
import { BRAND_COLORS } from '../../../constants';

export interface DrawerProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  className?: string;
}

export default function Drawer({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 460,
  className = '',
}: DrawerProps) {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        className={`bg-white h-full shadow-2xl border-l border-brand-line/40 max-w-full ${className}`}
        style={{ width, zIndex: 100000 }}
      >
        {(title || subtitle) && (
          <View className="flex-row items-center justify-between p-4 border-b border-brand-line/20">
            <View className="flex-1 mr-2">
              {title && (
                <Text className="font-display font-bold text-lg text-brand-text">
                  {title}
                </Text>
              )}
              {subtitle && (
                <Text className="text-xs text-brand-textMuted mt-0.5" numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              className="p-1.5 rounded-lg hover:bg-slate-100"
              style={{ cursor: 'pointer' as any }}
            >
              <X size={18} color={BRAND_COLORS.textMuted} />
            </Pressable>
          </View>
        )}

        <ScrollView className="p-4 flex-1" contentContainerStyle={{ gap: 16 }}>
          {children}
        </ScrollView>

        {footer && (
          <View className="p-4 border-t border-brand-line/20 bg-slate-50 flex-row justify-end gap-2">
            {footer}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99999,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
});
