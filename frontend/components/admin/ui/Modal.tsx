import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Modal as RNModal } from 'react-native';
import { X } from 'lucide-react-native';
import { BRAND_COLORS } from '../../../constants';

export interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
  className?: string;
}

export default function Modal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 520,
  className = '',
}: ModalProps) {
  if (!visible) return null;

  return (
    <RNModal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          className={`w-11/12 max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-brand-line/40 overflow-hidden ${className}`}
          style={{ maxWidth, zIndex: 1 }}
        >
          {(title || subtitle) && (
            <View className="flex-row items-center justify-between p-4 border-b border-brand-line/20 bg-white">
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
                className="p-1 rounded-lg hover:bg-slate-100"
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
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdrop: {
    ...(StyleSheet.absoluteFill as any),
  },
});
