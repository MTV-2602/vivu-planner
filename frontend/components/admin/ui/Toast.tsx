import React, { useState, useCallback, useEffect, createContext, useContext } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react-native';
import { BRAND_COLORS } from '../../../constants';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id?: string;
  message: string;
  tone?: ToastTone;
  duration?: number;
}

interface ToastContextType {
  toast: ToastMessage | null;
  showToast: (message: string, tone?: ToastTone, duration?: number) => void;
  hideToast: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function AdminToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'success', duration = 3500) => {
      setToast({ message, tone, duration, id: String(Date.now()) });
    },
    []
  );

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, toast.duration || 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  return (
    <ToastContext.Provider value={{ toast, showToast, hideToast }}>
      {children}
      {toast && <ToastBanner toast={toast} onClose={hideToast} />}
    </ToastContext.Provider>
  );
}

export function useAdminToast() {
  const context = useContext(ToastContext);
  // Fallback if used outside provider: local state helper
  const [localToast, setLocalToast] = useState<ToastMessage | null>(null);

  if (context) {
    return context;
  }

  const showLocalToast = (message: string, tone: ToastTone = 'success', duration = 3500) => {
    setLocalToast({ message, tone, duration, id: String(Date.now()) });
  };

  return {
    toast: localToast,
    showToast: showLocalToast,
    hideToast: () => setLocalToast(null),
  };
}

export function ToastBanner({
  toast,
  onClose,
}: {
  toast: ToastMessage;
  onClose: () => void;
}) {
  const tone = toast.tone || 'info';

  const getStyle = () => {
    switch (tone) {
      case 'success':
        return {
          bg: '#ECFDF5',
          border: 'rgba(16, 185, 129, 0.4)',
          text: '#065F46',
          icon: <CheckCircle2 size={18} color="#059669" />,
        };
      case 'error':
        return {
          bg: '#FEF2F2',
          border: 'rgba(239, 68, 68, 0.4)',
          text: '#991B1B',
          icon: <AlertCircle size={18} color={BRAND_COLORS.danger} />,
        };
      case 'warning':
        return {
          bg: '#FFFBEB',
          border: 'rgba(245, 158, 11, 0.4)',
          text: '#92400E',
          icon: <AlertTriangle size={18} color="#D97706" />,
        };
      default:
        return {
          bg: '#EFF6FF',
          border: 'rgba(59, 130, 246, 0.4)',
          text: '#1E40AF',
          icon: <Info size={18} color="#2563EB" />,
        };
    }
  };

  const style = getStyle();

  return (
    <View
      style={{
        position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
        top: 24,
        right: 24,
        zIndex: 999999,
        maxWidth: 420,
        minWidth: 280,
      }}
    >
      <View
        className="flex-row items-center justify-between p-3.5 rounded-xl border shadow-lg gap-3"
        style={{
          backgroundColor: style.bg,
          borderColor: style.border,
        }}
      >
        <View className="flex-row items-center gap-2.5 flex-1">
          {style.icon}
          <Text
            className="text-xs font-semibold flex-1 leading-snug"
            style={{ color: style.text }}
          >
            {toast.message}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={8} style={{ cursor: 'pointer' as any }}>
          <X size={15} color={style.text} />
        </Pressable>
      </View>
    </View>
  );
}
