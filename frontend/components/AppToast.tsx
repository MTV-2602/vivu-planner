import React, { useEffect, useContext } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { CheckCircle2, AlertCircle, ShoppingBag, X, Sparkles } from 'lucide-react-native';

export interface AppToastMessage {
  text: string;
  type?: 'success' | 'cart' | 'error' | 'info';
}

interface AppToastProps {
  toast: AppToastMessage | null;
  onClose: () => void;
}

export default function AppToast({ toast, onClose }: AppToastProps) {
  const insets = useContext(SafeAreaInsetsContext) ?? { top: 0, bottom: 0, left: 0, right: 0 };
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        onClose();
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [toast, onClose]);

  if (!toast) return null;

  const getBgColor = () => {
    switch (toast.type) {
      case 'cart': return '#0f4c5c'; // Brand green for cart action
      case 'success': return '#0f4c5c';
      case 'error': return '#B23B3B';
      default: return '#0f4c5c';
    }
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'cart': return <ShoppingBag size={18} color="#FFFFFF" />;
      case 'success': return <CheckCircle2 size={18} color="#FFFFFF" />;
      case 'error': return <AlertCircle size={18} color="#FFFFFF" />;
      default: return <Sparkles size={18} color="#FFFFFF" />;
    }
  };

  return (
    <View
      style={{
        position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
        top: insets.top + 12,
        left: 20,
        right: 20,
        maxWidth: 480,
        alignSelf: 'center',
        backgroundColor: getBgColor(),
        borderRadius: 100,
        paddingHorizontal: 18,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 10,
        zIndex: 99999,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        {getIcon()}
        <Text
          numberOfLines={2}
          style={{
            fontFamily: 'BeVietnamPro_600SemiBold',
            fontSize: 13,
            color: '#FFFFFF',
            flex: 1,
            lineHeight: 18,
          }}
        >
          {toast.text}
        </Text>
      </View>

      <Pressable onPress={onClose} style={{ padding: 4 }}>
        <X size={16} color="rgba(255,255,255,0.8)" />
      </Pressable>
    </View>
  );
}
