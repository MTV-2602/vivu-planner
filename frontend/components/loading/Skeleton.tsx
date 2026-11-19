import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

// Đường cong giảm tốc chung cho toàn bộ chuyển động loading
export const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
export const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export const SKELETON_COLOR = '#E7E1D3';
export const SKELETON_SURFACE = '#FFFFFF';
export const SKELETON_BORDER = 'rgba(15, 76, 92, 0.08)';

// ── Theo dõi chế độ giảm chuyển động của hệ điều hành ──────────────────────
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(v => { if (mounted) setReduced(!!v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', v => setReduced(!!v));
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

// ── Một giá trị pulse dùng chung cho mọi skeleton để nhấp nháy đồng bộ ─────
const pulse = new Animated.Value(1);
let subscribers = 0;
let loop: Animated.CompositeAnimation | null = null;

function startPulse() {
  subscribers += 1;
  if (loop) return;
  loop = Animated.loop(
    Animated.sequence([
      Animated.timing(pulse, { toValue: 0.5, duration: 800, easing: EASE_OUT, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(pulse, { toValue: 1, duration: 800, easing: EASE_OUT, useNativeDriver: USE_NATIVE_DRIVER }),
    ]),
  );
  loop.start();
}

function stopPulse() {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers === 0 && loop) {
    loop.stop();
    loop = null;
    pulse.setValue(1);
  }
}

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 12, radius = 8, style }: SkeletonProps) {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    startPulse();
    return stopPulse;
  }, [reduced]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: SKELETON_COLOR, opacity: reduced ? 1 : pulse },
        style,
      ]}
    />
  );
}

// Khung thẻ trắng dùng chung cho các skeleton dạng card
export function SkeletonCard({ children, style, radius = 16, padding = 16 }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; radius?: number; padding?: number }) {
  return (
    <View
      style={[
        { backgroundColor: SKELETON_SURFACE, borderRadius: radius, padding, borderWidth: 1, borderColor: SKELETON_BORDER },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export default Skeleton;
