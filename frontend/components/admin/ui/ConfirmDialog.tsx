import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Modal as RNModal } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { BRAND_COLORS } from '../../../constants';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  isDestructive = false,
  loading = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  if (!visible) return null;

  return (
    <RNModal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View
          className="bg-white rounded-2xl p-6 max-w-sm w-11/12 shadow-2xl border border-brand-line/40 overflow-hidden"
          style={{
            zIndex: 1,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.25,
            shadowRadius: 20,
          }}
        >
          <View className="flex-row items-center gap-2.5 mb-2.5">
            <AlertTriangle
              size={22}
              color={isDestructive ? BRAND_COLORS.danger : BRAND_COLORS.accent}
            />
            <Text className="text-lg font-display font-bold text-brand-text flex-1">
              {title}
            </Text>
          </View>

          <Text className="text-xs text-brand-textSoft leading-relaxed mb-4">
            {message}
          </Text>

          {children && <View className="mb-4">{children}</View>}

          <View className="flex-row justify-end gap-2.5 pt-2">
            <Pressable
              disabled={loading}
              onPress={onCancel}
              className="px-4 py-2 rounded-xl border border-brand-line/60 bg-slate-50"
              style={{ cursor: loading ? 'default' : 'pointer' } as any}
            >
              <Text className="text-xs font-bold text-brand-textSoft">{cancelText}</Text>
            </Pressable>

            <Pressable
              disabled={loading}
              onPress={onConfirm}
              className="px-4 py-2 rounded-xl flex-row items-center gap-1.5"
              style={{
                backgroundColor: isDestructive ? BRAND_COLORS.danger : BRAND_COLORS.primary,
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.7 : 1,
              } as any}
            >
              {loading && <ActivityIndicator size="small" color="#FFFFFF" />}
              <Text className="text-xs font-bold text-white">{confirmText}</Text>
            </Pressable>
          </View>
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
