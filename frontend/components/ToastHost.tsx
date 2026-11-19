import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react-native';
import { subscribeNotify, type NotifyMessage, type NotifyType } from '../lib/notify';

const ZERO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };
const AUTO_HIDE_MS = 3500;
const ANIM_MS = 220;
const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

const COLORS: Record<NotifyType, string> = {
  success: '#0f4c5c',
  error: '#B42318',
  info: '#0c77b0',
};

function ToastIcon({ type }: { type: NotifyType }) {
  if (type === 'success') return <CheckCircle2 size={18} color="#FFFFFF" />;
  if (type === 'error') return <AlertCircle size={18} color="#FFFFFF" />;
  return <Info size={18} color="#FFFFFF" />;
}

// Host toast toàn cục: hiển thị lần lượt từng thông báo theo hàng đợi.
export default function ToastHost() {
  const insets = useContext(SafeAreaInsetsContext) ?? ZERO_INSETS;
  const [current, setCurrent] = useState<NotifyMessage | null>(null);
  const queueRef = useRef<NotifyMessage[]>([]);
  const currentRef = useRef<NotifyMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedRef = useRef(false);
  const anim = useRef(new Animated.Value(0)).current;

  // Tôn trọng cài đặt giảm chuyển động của hệ thống
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (mounted) reducedRef.current = !!v; })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => {
      reducedRef.current = !!v;
    });
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const showNext = useCallback(() => {
    const next = queueRef.current.shift() ?? null;
    currentRef.current = next;
    setCurrent(next);
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    if (reducedRef.current) {
      anim.setValue(0);
      showNext();
      return;
    }
    Animated.timing(anim, {
      toValue: 0,
      duration: ANIM_MS,
      easing: EASE_OUT,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(() => showNext());
  }, [anim, showNext]);

  // Nhận thông báo mới: hiển thị ngay nếu đang rảnh, ngược lại xếp hàng
  useEffect(() => {
    return subscribeNotify((msg) => {
      if (currentRef.current) {
        queueRef.current.push(msg);
        return;
      }
      currentRef.current = msg;
      setCurrent(msg);
    });
  }, []);

  // Mỗi khi đổi toast: chạy animation vào và đặt một bộ hẹn giờ tự ẩn duy nhất
  useEffect(() => {
    if (!current) return;
    clearTimer();
    if (reducedRef.current) {
      anim.setValue(1);
    } else {
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: ANIM_MS,
        easing: EASE_OUT,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
    }
    timerRef.current = setTimeout(hide, AUTO_HIDE_MS);
    return clearTimer;
  }, [current, anim, hide]);

  if (!current) return null;

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] });

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
        top: insets.top + 12,
        left: 16,
        right: 16,
        alignItems: 'center',
        zIndex: 100000,
        elevation: 100,
      }}
    >
      <Animated.View
        style={{ opacity: anim, transform: [{ translateY }], width: '100%', maxWidth: 480 }}
      >
        <Pressable
          onPress={hide}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{
            backgroundColor: COLORS[current.type],
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <ToastIcon type={current.type} />
          <Text
            numberOfLines={3}
            style={{
              flex: 1,
              color: '#FFFFFF',
              fontSize: 13,
              lineHeight: 18,
              fontFamily: 'BeVietnamPro_600SemiBold',
            }}
          >
            {current.text}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
