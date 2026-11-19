import { View } from 'react-native';
import { Skeleton, SkeletonCard } from './Skeleton';

// Skeleton cho thẻ bài đánh giá trong bảng tin: tác giả, nội dung, ảnh, thanh tương tác
export default function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View testID="skeleton-feed" accessibilityLabel="Đang tải bài đánh giá" style={{ gap: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} radius={20} padding={24}>
          <View style={{ gap: 16 }}>
            {/* Tác giả */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Skeleton width={40} height={40} radius={20} />
              <View style={{ gap: 8, flex: 1 }}>
                <Skeleton width="40%" height={12} radius={4} />
                <Skeleton width="24%" height={10} radius={4} />
              </View>
            </View>
            {/* Tiêu đề + nội dung */}
            <View style={{ gap: 8 }}>
              <Skeleton width="70%" height={16} radius={4} />
              <Skeleton width="100%" height={10} radius={4} />
              <Skeleton width="92%" height={10} radius={4} />
              <Skeleton width="56%" height={10} radius={4} />
            </View>
            {/* Ảnh: bo góc trong = 20 - 4 */}
            <Skeleton width="100%" height={180} radius={16} />
            {/* Thanh tương tác */}
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Skeleton width={64} height={24} radius={12} />
              <Skeleton width={64} height={24} radius={12} />
              <Skeleton width={64} height={24} radius={12} />
            </View>
          </View>
        </SkeletonCard>
      ))}
    </View>
  );
}
