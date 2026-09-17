import React, { useState } from 'react';
import { View, Text, Pressable, Platform, ImageBackground } from 'react-native';
import { Bookmark, Star, MapPin, Leaf, Sparkles, Clock, Tag as TagIcon } from 'lucide-react-native';

interface DestinationItem {
  id: string;
  title: string;
  location: string;
  tag: string;
  metric1: string;
  metric2: string;
  imageUrl: string;
  isLarge?: boolean;
}

const MOCK_DESTINATIONS: DestinationItem[] = [
  {
    id: 'pu-luong',
    title: 'Đỉnh Pù Luông mờ sương',
    location: 'Thanh Hóa · Vùng cao',
    tag: 'SIÊU HIDDEN GEM',
    metric1: 'Scenic Score: 9.8',
    metric2: 'Carbon: Rất thấp',
    imageUrl: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&w=1200&q=80',
    isLarge: true,
  },
  {
    id: 'pho-trang-kim',
    title: 'Quán Phở Gà Tráng Kìm',
    location: 'Hà Giang · Quản Bạ',
    tag: 'QUÁN ĂN BẢN ĐỊA',
    metric1: 'Giá: 35.000đ',
    metric2: 'Rating: 4.9★',
    imageUrl: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'bai-nhat',
    title: 'Bãi Nhát hoàng hôn',
    location: 'Côn Đảo · Bà Rịa Vũng Tàu',
    tag: 'TRẢI NGHIỆM THIÊN NHIÊN',
    metric1: 'Scenic Score: 9.6',
    metric2: 'Carbon: Thấp',
    imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'lung-tam',
    title: 'Làng thổ cẩm Lùng Tám',
    location: 'Hà Giang · Đồng Văn',
    tag: 'VĂN HÓA ĐỊA PHƯƠNG',
    metric1: 'Workshop thổ cẩm',
    metric2: 'Thời gian: 2 giờ',
    imageUrl: 'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=800&q=80',
  },
];

export default function LocalizedBentoGrid() {
  const [bookmarkedIds, setBookmarkedIds] = useState<Record<string, boolean>>({
    'pu-luong': true,
  });

  const toggleBookmark = (id: string) => {
    setBookmarkedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <View style={{ width: '100%', maxWidth: 1200, alignSelf: 'center', gap: 24, paddingVertical: 10 }}>
      
      {/* Header Section */}
      <View style={{ gap: 8 }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          alignSelf: 'flex-start',
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 100,
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          borderWidth: 1,
          borderColor: 'rgba(52, 211, 153, 0.3)',
        }}>
          <Sparkles size={14} color="#34D399" />
          <Text style={{ color: '#34D399', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
            Kho Địa Điểm Ngách (Hidden Gems)
          </Text>
        </View>

        <Text style={{
          fontSize: Platform.OS === 'web' ? 32 : 24,
          fontWeight: '800',
          color: '#FFFFFF',
          letterSpacing: -0.5,
        }}>
          Địa điểm bản địa tuyển chọn bởi AI & Du khách
        </Text>
        <Text style={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: 14, maxWidth: 640, lineHeight: 22 }}>
          Khám phá những trải nghiệm độc lạ, nét văn hóa đặc trưng và địa điểm nguyên sơ không có trên các bản đồ thông thường.
        </Text>
      </View>

      {/* Bento Grid Layout */}
      <View style={{
        display: Platform.OS === 'web' ? ('grid' as any) : 'flex',
        flexDirection: Platform.OS === 'web' ? undefined : 'column',
        gridTemplateColumns: Platform.OS === 'web' ? 'repeat(3, minmax(0, 1fr))' : undefined,
        gap: 18,
      }}>
        {MOCK_DESTINATIONS.map((item) => {
          const isSaved = !!bookmarkedIds[item.id];
          return (
            <View
              key={item.id}
              style={{
                gridColumn: Platform.OS === 'web' && item.isLarge ? 'span 2 / span 2' : undefined,
                minHeight: item.isLarge ? 340 : 280,
                borderRadius: 24,
                overflow: 'hidden',
                backgroundColor: '#12181B',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.12)',
                position: 'relative',
                ...(Platform.OS === 'web' ? {
                  transition: 'all 0.3s ease',
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
                } as any : {}),
              }}
            >
              {/* High-res Image Background */}
              <ImageBackground
                source={{ uri: item.imageUrl }}
                style={{ width: '100%', height: '100%', justifyContent: 'space-between', padding: 20 }}
                imageStyle={{ borderRadius: 24 }}
              >
                {/* Dark Gradient Overlay */}
                <View style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(10, 14, 18, 0.45)',
                  borderRadius: 24,
                  ...(Platform.OS === 'web' ? {
                    backgroundImage: 'linear-gradient(180deg, rgba(18, 24, 27, 0.2) 0%, rgba(10, 14, 18, 0.92) 80%)',
                  } as any : {}),
                }} />

                {/* Top Bar: Category Tag & Interactive Bookmark */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
                  <View style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 100,
                    backgroundColor: 'rgba(16, 185, 129, 0.25)',
                    borderWidth: 1,
                    borderColor: 'rgba(52, 211, 153, 0.4)',
                    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)' } as any : {}),
                  }}>
                    <Text style={{ color: '#34D399', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>
                      {item.tag}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => toggleBookmark(item.id)}
                    style={({ pressed }) => [{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: isSaved ? '#10B981' : 'rgba(255, 255, 255, 0.15)',
                      borderWidth: 1,
                      borderColor: isSaved ? '#34D399' : 'rgba(255, 255, 255, 0.25)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.8 : 1,
                      transform: [{ scale: pressed ? 0.9 : 1 }],
                      ...(Platform.OS === 'web' ? {
                        backdropFilter: 'blur(8px)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      } as any : {}),
                    }]}
                  >
                    <Bookmark size={18} color="#FFFFFF" fill={isSaved ? '#FFFFFF' : 'transparent'} />
                  </Pressable>
                </View>

                {/* Bottom Destination Details & Metrics */}
                <View style={{ gap: 10, zIndex: 10 }}>
                  <View style={{ gap: 2 }}>
                    <Text style={{
                      fontSize: item.isLarge ? 22 : 18,
                      fontWeight: '800',
                      color: '#FFFFFF',
                      letterSpacing: -0.3,
                    }}>
                      {item.title}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <MapPin size={13} color="rgba(255, 255, 255, 0.7)" />
                      <Text style={{ color: 'rgba(255, 255, 255, 0.75)', fontSize: 13, fontWeight: '500' }}>
                        {item.location}
                      </Text>
                    </View>
                  </View>

                  {/* Metric Pill Badges */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 8,
                      backgroundColor: 'rgba(255, 255, 255, 0.12)',
                      borderWidth: 1,
                      borderColor: 'rgba(255, 255, 255, 0.18)',
                    }}>
                      <Star size={12} color="#FBBF24" fill="#FBBF24" />
                      <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '600' }}>
                        {item.metric1}
                      </Text>
                    </View>

                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 8,
                      backgroundColor: 'rgba(16, 185, 129, 0.18)',
                      borderWidth: 1,
                      borderColor: 'rgba(52, 211, 153, 0.3)',
                    }}>
                      <Leaf size={12} color="#34D399" />
                      <Text style={{ color: '#34D399', fontSize: 11, fontWeight: '600' }}>
                        {item.metric2}
                      </Text>
                    </View>
                  </View>
                </View>
              </ImageBackground>
            </View>
          );
        })}
      </View>
    </View>
  );
}
