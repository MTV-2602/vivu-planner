import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Skeleton, SkeletonCard } from './Skeleton';

// Skeleton cho trang chi tiết chuyến đi: thanh điều hướng, thẻ tiêu đề, chip ngày, timeline và bản đồ (desktop)
export default function TripDetailSkeleton() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isMobile = width < 768;
  const navTone = 'rgba(255,255,255,0.18)';

  return (
    <View testID="skeleton-trip-detail" accessibilityLabel="Đang tải lịch trình" style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* Thanh điều hướng màu thương hiệu */}
      <View
        style={{
          backgroundColor: '#0f4c5c',
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: isMobile ? 12 : 16,
          paddingHorizontal: isMobile ? 16 : 24,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Skeleton width={isMobile ? 96 : 136} height={14} radius={4} style={{ backgroundColor: navTone }} />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Skeleton width={48} height={24} radius={12} style={{ backgroundColor: navTone }} />
          {!isMobile && <Skeleton width={120} height={20} radius={4} style={{ backgroundColor: navTone }} />}
        </View>
      </View>

      <View style={{ paddingHorizontal: isMobile ? 16 : 24, paddingVertical: isMobile ? 24 : 32, gap: isMobile ? 24 : 32 }}>
        {/* Thẻ tiêu đề chuyến đi */}
        <SkeletonCard radius={24} padding={isMobile ? 16 : 24}>
          <View style={{ gap: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Skeleton width={88} height={24} radius={12} />
              <Skeleton width={64} height={24} radius={12} />
            </View>
            <Skeleton width={isMobile ? '85%' : '48%'} height={isMobile ? 24 : 32} radius={6} />
            <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
              <Skeleton width={96} height={12} radius={4} />
              <Skeleton width={72} height={12} radius={4} />
              <Skeleton width={80} height={12} radius={4} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {[96, 80, 72].map((w, i) => (
                <Skeleton key={i} width={w} height={40} radius={12} />
              ))}
            </View>
          </View>
        </SkeletonCard>

        {/* Chip chọn ngày */}
        <View style={{ flexDirection: 'row', gap: 8, overflow: 'hidden' }}>
          {Array.from({ length: isMobile ? 4 : 6 }).map((_, i) => (
            <Skeleton key={i} width={isMobile ? 72 : 96} height={36} radius={18} />
          ))}
        </View>

        {/* Timeline + bản đồ (desktop) */}
        <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24 }}>
          <View style={{ flex: 1, gap: 12 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ alignItems: 'center', gap: 8, width: 40 }}>
                  <Skeleton width={40} height={12} radius={4} />
                  <Skeleton width={2} height={64} radius={1} />
                </View>
                <SkeletonCard radius={16} padding={16} style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {/* Bo góc trong = 16 - 4 */}
                    <Skeleton width={56} height={56} radius={12} />
                    <View style={{ flex: 1, gap: 8 }}>
                      <Skeleton width="70%" height={14} radius={4} />
                      <Skeleton width="90%" height={10} radius={4} />
                      <Skeleton width="40%" height={10} radius={4} />
                    </View>
                  </View>
                </SkeletonCard>
              </View>
            ))}
          </View>
          {!isMobile && (
            <View style={{ flex: 1, maxWidth: 560 }}>
              <Skeleton width="100%" height={480} radius={24} />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
