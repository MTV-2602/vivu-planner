import { View } from 'react-native';
import { Skeleton, SkeletonCard } from './Skeleton';

interface PageSkeletonProps {
  rows?: number;
  /** Hiện khối tiêu đề trang phía trên danh sách */
  showHeader?: boolean;
  /** Bao bọc toàn màn hình (flex: 1 + nền) hay chỉ chèn vào trong nội dung */
  fullScreen?: boolean;
  /** Dòng mô tả ngắn hiển thị dưới dạng nhãn trợ năng */
  label?: string;
  testID?: string;
}

// Skeleton chung: tiêu đề + vài hàng nội dung, dùng cho hồ sơ, quản trị, thanh toán, lời mời
export default function PageSkeleton({
  rows = 3,
  showHeader = true,
  fullScreen = false,
  label = 'Đang tải nội dung',
  testID = 'skeleton-page',
}: PageSkeletonProps) {
  return (
    <View
      testID={testID}
      accessibilityLabel={label}
      style={[
        { gap: 16, width: '100%' },
        fullScreen && { flex: 1, backgroundColor: '#FBF5EA', padding: 24, alignItems: 'center' },
      ]}
    >
      <View style={{ width: '100%', maxWidth: 720, gap: 16 }}>
        {showHeader && (
          <View style={{ gap: 8, paddingBottom: 8 }}>
            <Skeleton width="48%" height={24} radius={6} />
            <Skeleton width="72%" height={12} radius={4} />
          </View>
        )}
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonCard key={i} radius={16} padding={16}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Skeleton width={40} height={40} radius={12} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton width="64%" height={12} radius={4} />
                <Skeleton width="40%" height={10} radius={4} />
              </View>
            </View>
          </SkeletonCard>
        ))}
      </View>
    </View>
  );
}
