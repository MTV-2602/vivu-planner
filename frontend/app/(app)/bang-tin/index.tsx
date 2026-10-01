import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  TextInput,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Compass,
  MapPin,
  Tag,
  Star,
  Plus,
  ArrowLeft,
  Search,
  Filter,
  Trash2,
  Share2,
  Clock,
  DollarSign,
  CheckCircle2,
  X,
  User,
  Sparkles,
  ExternalLink,
  MessageSquare,
  ThumbsUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react-native';
import { useAuth } from '../../../hooks/useAuth';
import { api } from '../../../lib/api';
import SystemClock from '../../../components/SystemClock';
import CreatePostModal from '../../../components/CreatePostModal';
import ConfirmModal from '../../../components/ConfirmModal';
import {
  BRAND_COLORS,
  APP_ROUTES,
  VIETNAM_PROVINCES,
  POST_CATEGORIES,
} from '../../../constants';

export default function CommunityFeedScreen() {
  const router = useRouter();
  const { user, profile, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  // Filter States (2 tag bắt buộc)
  const [selectedProvince, setSelectedProvince] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [previewGallery, setPreviewGallery] = useState<{ images: string[]; activeIndex: number } | null>(null);
  const [postToDelete, setPostToDelete] = useState<{ id: string; place_name: string } | null>(null);

  const renderMediaGallery = (mediaUrls: string[]) => {
    if (!mediaUrls || mediaUrls.length === 0) return null;
    const count = mediaUrls.length;

    if (count === 1) {
      return (
        <Pressable
          onPress={() => setPreviewGallery({ images: mediaUrls, activeIndex: 0 })}
          style={{ width: '100%', height: 260, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
        >
          <Image source={{ uri: mediaUrls[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        </Pressable>
      );
    }

    if (count === 2) {
      return (
        <View style={{ flexDirection: 'row', gap: 8, height: 220 }}>
          {mediaUrls.map((url, i) => (
            <Pressable
              key={i}
              onPress={() => setPreviewGallery({ images: mediaUrls, activeIndex: i })}
              style={{ flex: 1, height: '100%', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
            >
              <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </Pressable>
          ))}
        </View>
      );
    }

    if (count === 3) {
      return (
        <View style={{ flexDirection: 'row', gap: 8, height: 240 }}>
          <Pressable
            onPress={() => setPreviewGallery({ images: mediaUrls, activeIndex: 0 })}
            style={{ flex: 1.3, height: '100%', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
          >
            <Image source={{ uri: mediaUrls[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </Pressable>
          <View style={{ flex: 1, gap: 8, height: '100%' }}>
            <Pressable
              onPress={() => setPreviewGallery({ images: mediaUrls, activeIndex: 1 })}
              style={{ flex: 1, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
            >
              <Image source={{ uri: mediaUrls[1] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </Pressable>
            <Pressable
              onPress={() => setPreviewGallery({ images: mediaUrls, activeIndex: 2 })}
              style={{ flex: 1, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
            >
              <Image source={{ uri: mediaUrls[2] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </Pressable>
          </View>
        </View>
      );
    }

    // 4 or more photos (2x2 grid with overlay)
    return (
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8, height: 160 }}>
          <Pressable
            onPress={() => setPreviewGallery({ images: mediaUrls, activeIndex: 0 })}
            style={{ flex: 1, height: '100%', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
          >
            <Image source={{ uri: mediaUrls[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </Pressable>
          <Pressable
            onPress={() => setPreviewGallery({ images: mediaUrls, activeIndex: 1 })}
            style={{ flex: 1, height: '100%', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
          >
            <Image source={{ uri: mediaUrls[1] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, height: 160 }}>
          <Pressable
            onPress={() => setPreviewGallery({ images: mediaUrls, activeIndex: 2 })}
            style={{ flex: 1, height: '100%', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
          >
            <Image source={{ uri: mediaUrls[2] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </Pressable>
          <Pressable
            onPress={() => setPreviewGallery({ images: mediaUrls, activeIndex: 3 })}
            style={{ flex: 1, height: '100%', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', position: 'relative', cursor: 'pointer' as any }}
          >
            <Image source={{ uri: mediaUrls[3] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            {count > 4 && (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800' }}>
                  +{count - 3}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch Posts from API
  const {
    data: postsData,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['community-posts', selectedProvince, selectedCategory, debouncedSearch],
    queryFn: async () => {
      const params: any = {};
      if (selectedProvince && selectedProvince !== 'all') params.province = selectedProvince;
      if (selectedCategory && selectedCategory !== 'all') params.category = selectedCategory;
      if (debouncedSearch) params.search = debouncedSearch;

      const res = await api.get('/posts', { params });
      return res.data;
    },
  });

  const posts = postsData?.posts || [];

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (postId: string) => {
      await api.delete(`/posts/${postId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      setPostToDelete(null);
    },
    onError: (err: any) => {
      Alert.alert('Lỗi', err.response?.data?.error || 'Không thể xóa bài viết');
      setPostToDelete(null);
    },
  });

  // Popular quick provinces
  const popularProvinces = [
    'Hà Nội',
    'TP. Hồ Chí Minh',
    'Đà Nẵng',
    'Lâm Đồng',
    'Khánh Hòa',
    'Quảng Ninh',
    'Hội An',
    'Ninh Bình',
  ];

  const handleResetFilters = () => {
    setSelectedProvince('all');
    setSelectedCategory('all');
    setSearchQuery('');
  };

  const isFiltering = selectedProvince !== 'all' || selectedCategory !== 'all' || !!searchQuery;

  // Format date helper
  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      if (diffMinutes < 1) return 'Vừa xong';
      if (diffMinutes < 60) return `${diffMinutes} phút trước`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours} giờ trước`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 30) return `${diffDays} ngày trước`;
      return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' }).format(new Date(dateStr));
    } catch {
      return '';
    }
  };

  const getCategoryMeta = (catId: string) => {
    return POST_CATEGORIES.find((c) => c.id === catId) || {
      id: 'other',
      label: 'Khác',
      icon: '🏷️',
      color: '#6B7280',
      bg: '#F3F4F6',
    };
  };

  return (
    <View style={{ flex: 1, backgroundColor: BRAND_COLORS.bg }}>
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(27,36,32,0.08)',
          paddingHorizontal: 24,
          paddingVertical: 14,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Logo & Navigation */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Pressable
              onPress={() => router.push(APP_ROUTES.TRIPS as any)}
              style={({ pressed }) => [{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 10,
                backgroundColor: pressed ? '#F3ECDC' : '#FAF5EA',
                cursor: 'pointer' as any,
              }]}
            >
              <ArrowLeft size={16} color={BRAND_COLORS.text} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_COLORS.text }}>
                Chuyến đi của bạn
              </Text>
            </Pressable>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Compass size={24} color={BRAND_COLORS.primary} />
              <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 18, color: BRAND_COLORS.primary }}>
                Bảng Tin ViVu
              </Text>
            </View>
          </View>

          {/* Right Actions */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <SystemClock />

            {/* Profile Button */}
            <Pressable
              onPress={() => router.push('/(app)/profile' as any)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 100,
                backgroundColor: '#FAF5EA',
                borderWidth: 1,
                borderColor: '#E8DECC',
                cursor: 'pointer' as any,
              }}
            >
              {profile?.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={{ width: 22, height: 22, borderRadius: 11 }}
                />
              ) : (
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: 'rgba(31,111,84,0.15)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <User size={13} color={BRAND_COLORS.primary} />
                </View>
              )}
              <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND_COLORS.text }}>
                {profile?.full_name || 'Hồ sơ'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── Main Body ────────────────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingVertical: 24,
          maxWidth: 960,
          alignSelf: 'center',
          width: '100%',
          gap: 20,
        }}
      >
        {/* ── Hero Banner & Nút Đăng Bài ────────────────────────────────────── */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            padding: 24,
            borderWidth: 1,
            borderColor: 'rgba(27,36,32,0.08)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.03)' as any,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <View style={{ flex: 1, minWidth: 280, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  backgroundColor: '#E8F5E9',
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 6,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#1B5E20' }}>
                  CỘNG ĐỒNG DU LỊCH VIVU 🌏
                </Text>
              </View>
            </View>
            <Text
              style={{
                fontFamily: 'Lora_700Bold',
                fontSize: 22,
                color: BRAND_COLORS.text,
              }}
            >
              Bảng Tin Đánh Giá & Chia Sẻ Địa Điểm
            </Text>
            <Text style={{ fontSize: 13, color: BRAND_COLORS.textMuted, lineHeight: 20 }}>
              Khám phá đánh giá chân thực theo phong cách Google Maps: khách sạn, quán ăn ngon, cà phê check-in, tiêu chí phục vụ và chi phí thực tế.
            </Text>
          </View>

          <Pressable
            testID="btn-open-create-post"
            onPress={() => setShowCreateModal(true)}
            style={({ pressed }) => [{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: BRAND_COLORS.primary,
              paddingHorizontal: 22,
              paddingVertical: 14,
              borderRadius: 14,
              boxShadow: '0 4px 14px rgba(31,111,84,0.3)' as any,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
              cursor: 'pointer' as any,
            }]}
          >
            <Plus size={18} color="#FFFFFF" />
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>
              + Đăng Bài Đánh Giá Mới
            </Text>
          </Pressable>
        </View>

        {/* ── BỘ LỌC 2 TẦNG (TAG TỈNH THÀNH + TAG PHÂN LOẠI) ──────────────── */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            padding: 20,
            borderWidth: 1,
            borderColor: 'rgba(27,36,32,0.08)',
            gap: 16,
          }}
        >
          {/* Header Bộ lọc & Thanh tìm kiếm */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Filter size={18} color={BRAND_COLORS.primary} />
              <Text style={{ fontSize: 15, fontWeight: '800', color: BRAND_COLORS.text }}>
                Bộ Lọc Tìm Kiếm Đa Tiêu Chí
              </Text>
              {isFiltering && (
                <Pressable
                  onPress={handleResetFilters}
                  style={{
                    backgroundColor: '#FEE2E2',
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6,
                    cursor: 'pointer' as any,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>
                    ✕ Đặt lại bộ lọc
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Search Input */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: '#FAF5EA',
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: '#E8DECC',
                minWidth: 260,
                flex: 1,
                maxWidth: 400,
              }}
            >
              <Search size={16} color="#6E7B70" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Tìm tên địa điểm, món ăn, tỉnh thành..."
                placeholderTextColor="#94A3B8"
                style={{ flex: 1, fontSize: 13, color: BRAND_COLORS.text }}
              />
              {searchQuery ? (
                <Pressable onPress={() => setSearchQuery('')} style={{ padding: 2 }}>
                  <X size={14} color="#64748B" />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Tầng 1: Lọc theo Tag Phân Loại */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>
              📌 Tag Phân loại địa điểm:
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Pressable
                onPress={() => setSelectedCategory('all')}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 10,
                  backgroundColor: selectedCategory === 'all' ? BRAND_COLORS.primary : '#F1F5F9',
                  cursor: 'pointer' as any,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: selectedCategory === 'all' ? '#FFFFFF' : '#475569',
                  }}
                >
                  Tất cả phân loại
                </Text>
              </Pressable>

              {POST_CATEGORIES.map((cat) => {
                const active = selectedCategory === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    testID={`filter-category-${cat.id}`}
                    onPress={() => setSelectedCategory(cat.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 10,
                      backgroundColor: active ? cat.color : '#FFFFFF',
                      borderWidth: 1,
                      borderColor: active ? cat.color : '#E2E8F0',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Text style={{ fontSize: 13 }}>{cat.icon}</Text>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: active ? '800' : '600',
                        color: active ? '#FFFFFF' : '#334155',
                      }}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Tầng 2: Lọc theo Tag Tỉnh Thành */}
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>
                📍 Tag Tỉnh / Thành phố:
              </Text>
              {Platform.OS === 'web' && (
                <select
                  value={selectedProvince}
                  onChange={(e: any) => setSelectedProvince(e.target.value)}
                  style={{
                    backgroundColor: '#FAF5EA',
                    border: '1px solid #E8DECC',
                    borderRadius: 8,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: '600',
                    color: BRAND_COLORS.text,
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="all">Tất cả 63 tỉnh thành</option>
                  {VIETNAM_PROVINCES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              )}
            </View>

            {/* Quick popular provinces */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Pressable
                onPress={() => setSelectedProvince('all')}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: selectedProvince === 'all' ? '#1E293B' : '#F8FAFC',
                  borderWidth: 1,
                  borderColor: selectedProvince === 'all' ? '#1E293B' : '#CBD5E1',
                  cursor: 'pointer' as any,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: selectedProvince === 'all' ? '#FFFFFF' : '#475569',
                  }}
                >
                  Tất cả tỉnh
                </Text>
              </Pressable>

              {popularProvinces.map((prov) => {
                const active = selectedProvince.toLowerCase().includes(prov.toLowerCase());
                return (
                  <Pressable
                    key={prov}
                    onPress={() => setSelectedProvince(prov)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: active ? '#059669' : '#FFFFFF',
                      borderWidth: 1,
                      borderColor: active ? '#059669' : '#E2E8F0',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: active ? '700' : '500',
                        color: active ? '#FFFFFF' : '#334155',
                      }}
                    >
                      {prov}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>

        {/* ── DANH SÁCH BÀI ĐĂNG (FEED LIST) ──────────────────────────────── */}
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: BRAND_COLORS.text }}>
              {isFiltering ? `Kết quả tìm kiếm (${posts.length} bài)` : `Tất cả bài đánh giá (${posts.length})`}
            </Text>
            {isRefetching && <ActivityIndicator size="small" color={BRAND_COLORS.primary} />}
          </View>

          {isLoading ? (
            <View style={{ padding: 40, alignItems: 'center', gap: 12 }}>
              <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
              <Text style={{ fontSize: 13, color: BRAND_COLORS.textMuted }}>
                Đang tải các bài đánh giá mới nhất...
              </Text>
            </View>
          ) : posts.length === 0 ? (
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                padding: 40,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: 'rgba(27,36,32,0.08)',
                gap: 12,
              }}
            >
              <Text style={{ fontSize: 36 }}>🗺️</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: BRAND_COLORS.text }}>
                Chưa có bài đánh giá nào phù hợp
              </Text>
              <Text style={{ fontSize: 13, color: BRAND_COLORS.textMuted, textAlign: 'center', maxWidth: 400 }}>
                Hãy thử thay đổi hoặc đặt lại bộ lọc, hoặc là người đầu tiên chia sẻ bài đánh giá về địa điểm này!
              </Text>
              <Pressable
                onPress={() => setShowCreateModal(true)}
                style={{
                  backgroundColor: BRAND_COLORS.primary,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 100,
                  marginTop: 6,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
                  + Viết bài đánh giá ngay
                </Text>
              </Pressable>
            </View>
          ) : (
            posts.map((post: any) => {
              const catMeta = getCategoryMeta(post.category);
              const isOwner = user?.id === post.user_id || isAdmin;

              return (
                <View
                  key={post.id}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 20,
                    padding: 22,
                    borderWidth: 1,
                    borderColor: 'rgba(27,36,32,0.08)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.02)' as any,
                    gap: 14,
                  }}
                >
                  {/* Header Author Info */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      {post.author?.avatar_url ? (
                        <Image
                          source={{ uri: post.author.avatar_url }}
                          style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0' }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            backgroundColor: 'rgba(31,111,84,0.1)',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <User size={20} color={BRAND_COLORS.primary} />
                        </View>
                      )}
                      <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: BRAND_COLORS.text }}>
                            {post.author?.full_name || 'Người dùng ViVu'}
                          </Text>
                          {post.author?.is_premium && (
                            <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ fontSize: 10, fontWeight: '800', color: '#B45309' }}>
                                ⭐ PRO
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 11, color: '#94A3B8' }}>
                          Đã đăng {formatTimeAgo(post.created_at)}
                        </Text>
                      </View>
                    </View>

                    {/* Delete action for owner/admin */}
                    {isOwner && (
                      <Pressable
                        onPress={() => setPostToDelete({ id: post.id, place_name: post.place_name })}
                        style={{ padding: 6, cursor: 'pointer' as any }}
                      >
                        <Trash2 size={16} color="#DC2626" />
                      </Pressable>
                    )}
                  </View>

                  {/* Place Title & 2 Tags Bắt Buộc */}
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 18, color: BRAND_COLORS.text }}>
                      {post.place_name}
                    </Text>

                    {/* 2 Tags Bắt Buộc & Badges */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      {/* Tag 1: Tỉnh thành */}
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          backgroundColor: '#E8F5E9',
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: '#C8E6C9',
                        }}
                      >
                        <MapPin size={13} color="#2E7D32" />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#1B5E20' }}>
                          {post.province}
                        </Text>
                      </View>

                      {/* Tag 2: Phân loại */}
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                          backgroundColor: catMeta.bg,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: catMeta.color + '40',
                        }}
                      >
                        <Text style={{ fontSize: 12 }}>{catMeta.icon}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: catMeta.color }}>
                          {catMeta.label}
                        </Text>
                      </View>

                      {/* Trạng thái & Giờ mở cửa */}
                      <View
                        style={{
                          backgroundColor: post.place_status === 'closed' ? '#FEE2E2' : '#F0FDF4',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '700',
                            color: post.place_status === 'closed' ? '#991B1B' : '#166534',
                          }}
                        >
                          {post.place_status === 'closed' ? '🔴 Đã đóng cửa' : '🟢 Đang hoạt động'}
                          {post.opening_hours ? ` · ⏰ ${post.opening_hours}` : ''}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Rating Stars & Cost */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ flexDirection: 'row', gap: 2 }}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            size={16}
                            color={s <= post.rating ? '#F59E0B' : '#CBD5E1'}
                            fill={s <= post.rating ? '#F59E0B' : 'none'}
                          />
                        ))}
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#B45309' }}>
                        {post.rating}.0 / 5.0
                      </Text>
                    </View>

                    {post.cost_per_person > 0 && (
                      <View style={{ backgroundColor: '#F8FAFC', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B' }}>
                          💰 Chi phí: ~{Number(post.cost_per_person).toLocaleString('vi-VN')} đ / người
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Detailed Description */}
                  <Text style={{ fontSize: 14, color: '#334155', lineHeight: 22 }}>
                    {post.content}
                  </Text>

                  {/* Tiêu Chí Phụ (Google Maps Pills) */}
                  {post.aspects && (
                    <View style={{ backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', gap: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                        Tiêu chí trải nghiệm (Google Maps style)
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {post.aspects.quality && (
                          <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, color: '#334155' }}>
                              💎 Chất lượng: <Text style={{ fontWeight: '700' }}>{post.aspects.quality}</Text>
                            </Text>
                          </View>
                        )}
                        {post.aspects.service && (
                          <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, color: '#334155' }}>
                              🛎️ Dịch vụ: <Text style={{ fontWeight: '700' }}>{post.aspects.service}</Text>
                            </Text>
                          </View>
                        )}
                        {post.aspects.atmosphere && (
                          <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, color: '#334155' }}>
                              🌿 Không khí: <Text style={{ fontWeight: '700' }}>{post.aspects.atmosphere}</Text>
                            </Text>
                          </View>
                        )}
                        {post.aspects.waiting_time && (
                          <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, color: '#334155' }}>
                              ⏱️ Chờ đợi: <Text style={{ fontWeight: '700' }}>{post.aspects.waiting_time}</Text>
                            </Text>
                          </View>
                        )}
                        {post.aspects.booking_method && (
                          <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, color: '#334155' }}>
                              📅 Đặt chỗ: <Text style={{ fontWeight: '700' }}>{post.aspects.booking_method}</Text>
                            </Text>
                          </View>
                        )}
                        {post.aspects.parking && (
                          <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, color: '#334155' }}>
                              🚗 Đỗ xe: <Text style={{ fontWeight: '700' }}>{post.aspects.parking}</Text>
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}

                  {/* Media Gallery */}
                  {renderMediaGallery(post.media_urls)}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ── Modal Đăng Bài ──────────────────────────────────────────────── */}
      <CreatePostModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          refetch();
        }}
      />

      {/* ── Modal Phóng To & Xem Bộ Sưu Tập Ảnh ─────────────────────────── */}
      {previewGallery && (
        <Modal visible={!!previewGallery} transparent animationType="fade" onRequestClose={() => setPreviewGallery(null)}>
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.92)',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 16,
            }}
          >
            {/* Top Toolbar */}
            <View
              style={{
                position: 'absolute',
                top: 20,
                left: 20,
                right: 20,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                zIndex: 10,
              }}
            >
              <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                  Ảnh {previewGallery.activeIndex + 1} / {previewGallery.images.length}
                </Text>
              </View>

              <Pressable
                testID="btn-close-gallery"
                onPress={() => setPreviewGallery(null)}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.25)',
                  borderRadius: 20,
                  padding: 8,
                  cursor: 'pointer' as any,
                }}
              >
                <X size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            {/* Main Image with Navigation Arrows */}
            <View style={{ width: '100%', maxWidth: 900, height: '70%', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
              <Image
                source={{ uri: previewGallery.images[previewGallery.activeIndex] }}
                style={{ width: '100%', height: '100%', borderRadius: 12 }}
                resizeMode="contain"
              />

              {/* Prev Button */}
              {previewGallery.images.length > 1 && (
                <Pressable
                  testID="btn-prev-gallery"
                  onPress={() =>
                    setPreviewGallery((prev) =>
                      prev ? { ...prev, activeIndex: (prev.activeIndex - 1 + prev.images.length) % prev.images.length } : null
                    )
                  }
                  style={{
                    position: 'absolute',
                    left: 12,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    borderRadius: 30,
                    padding: 10,
                    cursor: 'pointer' as any,
                  }}
                >
                  <ChevronLeft size={24} color="#FFFFFF" />
                </Pressable>
              )}

              {/* Next Button */}
              {previewGallery.images.length > 1 && (
                <Pressable
                  testID="btn-next-gallery"
                  onPress={() =>
                    setPreviewGallery((prev) =>
                      prev ? { ...prev, activeIndex: (prev.activeIndex + 1) % prev.images.length } : null
                    )
                  }
                  style={{
                    position: 'absolute',
                    right: 12,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    borderRadius: 30,
                    padding: 10,
                    cursor: 'pointer' as any,
                  }}
                >
                  <ChevronRight size={24} color="#FFFFFF" />
                </Pressable>
              )}
            </View>

            {/* Bottom Thumbnail Strip */}
            {previewGallery.images.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 16, marginTop: 16 }}
                style={{ maxHeight: 70 }}
              >
                {previewGallery.images.map((img, i) => (
                  <Pressable
                    key={i}
                    onPress={() => setPreviewGallery((prev) => (prev ? { ...prev, activeIndex: i } : null))}
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 8,
                      overflow: 'hidden',
                      borderWidth: 2,
                      borderColor: previewGallery.activeIndex === i ? '#3B82F6' : 'transparent',
                      opacity: previewGallery.activeIndex === i ? 1 : 0.6,
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </Modal>
      )}

      {/* ── Modal Xác Nhận Xóa Bài ──────────────────────────────────────── */}
      {postToDelete && (
        <ConfirmModal
          visible={!!postToDelete}
          title="Xác nhận xóa bài đánh giá"
          message={`Bạn có chắc chắn muốn xóa bài đánh giá về "${postToDelete.place_name}" không? Hành động này không thể hoàn tác.`}
          isDestructive
          onConfirm={() => {
            if (postToDelete) deleteMutation.mutate(postToDelete.id);
          }}
          onCancel={() => setPostToDelete(null)}
        />
      )}
    </View>
  );
}
