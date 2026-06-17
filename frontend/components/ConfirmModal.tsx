import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { BRAND_COLORS } from '../constants';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  visible,
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  isDestructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View 
        className="bg-brand-bg border border-brand-line/60 rounded-2xl p-6 max-w-sm w-11/12 shadow-2xl"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.3,
          shadowRadius: 20,
          backgroundColor: '#FDFAF4' // brand-bg
        }}
      >
        <View className="flex-row items-center gap-2.5 mb-3">
          <AlertTriangle size={22} color={isDestructive ? BRAND_COLORS.danger : BRAND_COLORS.accent} />
          <Text className="text-lg font-display font-extrabold text-brand-text" style={{ color: '#1B2420' }}>
            {title}
          </Text>
        </View>
        <Text className="text-xs leading-relaxed mb-6" style={{ color: '#55655D', fontSize: 13 }}>
          {message}
        </Text>
        <View className="flex-row justify-end gap-3">
          <Pressable 
            onPress={onCancel}
            className="px-4 py-2.5 rounded-xl border border-brand-line/60"
            style={{ borderColor: 'rgba(27,36,32,0.14)', backgroundColor: 'rgba(27,36,32,0.03)' }}
          >
            <Text className="text-xs font-bold" style={{ color: '#55655D' }}>{cancelText}</Text>
          </Pressable>
          <Pressable 
            onPress={onConfirm}
            className="px-4 py-2.5 rounded-xl"
            style={{ backgroundColor: isDestructive ? BRAND_COLORS.danger : BRAND_COLORS.primary }}
          >
            <Text className="text-xs font-bold text-white">{confirmText}</Text>
          </Pressable>
        </View>
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
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  }
});
