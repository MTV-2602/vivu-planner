import { View, useWindowDimensions } from 'react-native';
import { Skeleton, SkeletonCard } from './Skeleton';

// Skeleton cho lưới thẻ chuyến đi: 2 cột trên mobile, lưới thẻ 280–380px trên desktop
export default function TripListSkeleton({ count = 4 }: { count?: number }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  return (
    <View
      testID="skeleton-trip-list"
      accessibilityLabel="Đang tải danh sách chuyến đi"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: isMobile ? 8 : 16, justifyContent: isMobile ? 'space-between' : 'flex-start' }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={isMobile ? { width: '48.5%' } : { flex: 1, minWidth: 280, maxWidth: 380 }}
        >
          <SkeletonCard radius={18} padding={isMobile ? 12 : 24} style={{ minHeight: isMobile ? 180 : 200 }}>
            <View style={{ gap: isMobile ? 12 : 16 }}>
              {/* Badge địa điểm + nút xóa */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Skeleton width={isMobile ? 64 : 96} height={16} radius={8} />
                <Skeleton width={24} height={24} radius={6} />
              </View>
              {/* Tiêu đề 2 dòng */}
              <View style={{ gap: 8 }}>
                <Skeleton width="90%" height={isMobile ? 14 : 18} radius={4} />
                <Skeleton width="60%" height={isMobile ? 14 : 18} radius={4} />
              </View>
              {/* Ngày + số người */}
              <View style={{ gap: 8 }}>
                <Skeleton width="70%" height={10} radius={4} />
                <Skeleton width="45%" height={10} radius={4} />
              </View>
              {/* Chân thẻ */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
                <Skeleton width={isMobile ? 48 : 72} height={12} radius={4} />
                <Skeleton width={isMobile ? 32 : 64} height={isMobile ? 24 : 32} radius={isMobile ? 12 : 16} />
              </View>
            </View>
          </SkeletonCard>
        </View>
      ))}
    </View>
  );
}
