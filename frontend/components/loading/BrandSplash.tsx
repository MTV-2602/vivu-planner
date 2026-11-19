import { useContext, useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Compass } from 'lucide-react-native';
import { EASE_OUT, USE_NATIVE_DRIVER, useReducedMotion } from './Skeleton';

const PRIMARY = '#0f4c5c';
const BG = '#FBF5EA';
const TRACK_WIDTH = 160;
const BAR_WIDTH = 56;

interface BrandSplashProps {
  message?: string;
}

// Màn hình khởi động thương hiệu: nền phẳng, logo chữ, thanh tiến trình vô định
export default function BrandSplash({ message = 'Đang chuẩn bị chuyến đi của bạn' }: BrandSplashProps) {
  // Không dùng useSafeAreaInsets: màn này hiển thị ở root _layout trước khi expo-router mount SafeAreaProvider (hook sẽ throw)
  const insets = useContext(SafeAreaInsetsContext) ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const barX = useRef(new Animated.Value(-BAR_WIDTH)).current;

  // Hiệu ứng xuất hiện: mờ dần + trượt lên 8px trong 500ms
  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 500, easing: EASE_OUT, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(translateY, { toValue: 0, duration: 500, easing: EASE_OUT, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start();
  }, [reduced]);

  // Thanh tiến trình chạy ngang lặp lại (chỉ dùng transform)
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.timing(barX, { toValue: TRACK_WIDTH, duration: 1200, easing: EASE_OUT, useNativeDriver: USE_NATIVE_DRIVER }),
      { resetBeforeIteration: true },
    );
    loop.start();
    return () => loop.stop();
  }, [reduced]);

  return (
    <View
      testID="brand-splash"
      accessibilityRole="progressbar"
      accessibilityLabel={message}
      style={{
        flex: 1,
        backgroundColor: BG,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        paddingHorizontal: 24,
      }}
    >
      <Animated.View style={{ alignItems: 'center', gap: 24, opacity, transform: [{ translateY }] }}>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              backgroundColor: PRIMARY,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Compass size={32} color="#FFFFFF" />
          </View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: PRIMARY, letterSpacing: -0.3 }}>
            ViVu Planner
          </Text>
        </View>

        <View
          style={{
            width: TRACK_WIDTH,
            height: 4,
            borderRadius: 2,
            backgroundColor: 'rgba(15, 76, 92, 0.12)',
            overflow: 'hidden',
          }}
        >
          <Animated.View
            style={{
              width: BAR_WIDTH,
              height: 4,
              borderRadius: 2,
              backgroundColor: PRIMARY,
              transform: [{ translateX: reduced ? (TRACK_WIDTH - BAR_WIDTH) / 2 : barX }],
            }}
          />
        </View>

        {!!message && (
          <Text style={{ fontSize: 14, color: '#3F4F45', textAlign: 'center' }}>{message}</Text>
        )}
      </Animated.View>
    </View>
  );
}
