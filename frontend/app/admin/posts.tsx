import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput, Image, Platform, Modal } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  Trash2,
  MapPin,
  Calendar,
  Star,
  Search,
  X,
  RefreshCw,
  Eye,
  MessageSquare,
  Heart,
  ExternalLink,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  SlidersHorizontal,
  Compass,
  Flag,
  ShieldCheck,
  Ban,
  AlertTriangle,
} from 'lucide-react-native';
import { BRAND_COLORS, APP_ROUTES, VIETNAM_PROVINCES, POST_CATEGORIES } from '../../constants';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import AdminNav from '../../components/admin/AdminNav';
import ConfirmModal from '../../components/ConfirmModal';

export interface PostReportDetail {
  user_id: string;
  user_name: string;
  user_email?: string | null;
  reason: string;
  details?: string;
  created_at: string;
}

export interface AdminPostItem {
  id: string;
  user_id: string;
  author: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    is_premium: boolean;
    email?: string | null;
  };
  author_penalty?: {
    strikeCount: number;
    isBanned: boolean;
    bannedUntil: string | null;
    remainingDays: number;
  };
  trip_id: string | null;
  place_name: string;
  province: string;
  category: string;
  rating: number;
  content: string;
  media_urls: string[];
  google_maps_url?: string;
  aspects: {
    quality?: string;
    service?: string;
    atmosphere?: string;
    waiting_time?: string;
    booking_method?: string;
    parking?: string;
  };
  cost_per_person: number;
  opening_hours?: string;
  place_status?: string;
  reactions: {
    total: number;
    by_type: Record<string, number>;
    user_reaction: string | null;
  };
  comments: any[];
  comments_count: number;
  status: 'approved' | 'rejected' | 'pending';
  rejection_reason?: string | null;
  reports: PostReportDetail[];
  reports_count: number;
  created_at: string;
  updated_at: string;
}

function formatDate(s: string) {
  if (!s) return '';
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AdminPosts() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isAdmin } = useAuth();

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Modal từ chối / gỡ bài kèm lý do
  const [rejectModal, setRejectModal] = useState<{
    post: AdminPostItem;
    reason: string;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'reported' | 'rejected'>('all');
  const [selectedPost, setSelectedPost] = useState<AdminPostItem | null>(null);

  const { data: postsData, isLoading, refetch, isRefetching } = useQuery<{ success: boolean; total: number; posts: AdminPostItem[] }>({
    queryKey: ['adminPosts'],
    queryFn: async () => (await api.get('/admin/posts')).data,
    enabled: !!isAdmin,
  });

  const posts = postsData?.posts || [];

  // Mutation Kiểm duyệt: Duyệt / Từ chối (cộng strike) / Bỏ qua báo cáo
  const moderatePostMutation = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: 'approve' | 'reject' | 'dismiss_reports'; reason?: string }) =>
      api.put(`/admin/posts/${id}/moderate`, { action, reason }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['adminPosts'] });
      showToast(res.data?.message || 'Cập nhật trạng thái kiểm duyệt thành công!', 'success');
      if (selectedPost) setSelectedPost(null);
      if (rejectModal) setRejectModal(null);
    },
    onError: (e: any) => {
      showToast(e.response?.data?.error || e.message || 'Lỗi khi xử lý kiểm duyệt', 'error');
    },
  });

  // Mutation Xóa bài viết vĩnh viễn
  const deletePostMutation = useMutation({
    mutationFn: ({ id, countStrike }: { id: string; countStrike?: boolean }) =>
      api.delete(`/admin/posts/${id}`, { data: { countStrike, reason: 'Xóa do vi phạm nghiêm trọng' } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminPosts'] });
      showToast('Đã xóa bài đăng vi phạm thành công!', 'success');
      if (selectedPost) setSelectedPost(null);
    },
    onError: (e: any) => {
      showToast(e.response?.data?.error || e.message || 'Lỗi khi xóa bài đăng', 'error');
    },
  });

  const stats = useMemo(() => {
    const total = posts.length;
    const withMedia = posts.filter((p) => p.media_urls && p.media_urls.length > 0).length;
    const reportedCount = posts.filter((p) => (p.reports_count || 0) > 0).length;
    const rejectedCount = posts.filter((p) => p.status === 'rejected').length;
    const approvedCount = posts.filter((p) => (p.status || 'approved') === 'approved').length;
    const totalReactions = posts.reduce((sum, p) => sum + (p.reactions?.total || 0), 0);
    const totalComments = posts.reduce((sum, p) => sum + (p.comments_count || 0), 0);
    return { total, withMedia, reportedCount, rejectedCount, approvedCount, totalReactions, totalComments };
  }, [posts]);

  const filteredPosts = useMemo(() => {
    return posts.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        (p.place_name || '').toLowerCase().includes(q) ||
        (p.content || '').toLowerCase().includes(q) ||
        (p.author?.full_name || '').toLowerCase().includes(q) ||
        (p.author?.email || '').toLowerCase().includes(q);

      const matchProvince = !provinceFilter || p.province === provinceFilter;
      const matchCategory = !categoryFilter || p.category === categoryFilter;

      let matchStatus = true;
      if (statusFilter === 'reported') matchStatus = (p.reports_count || 0) > 0;
      else if (statusFilter === 'approved') matchStatus = (p.status || 'approved') === 'approved';
      else if (statusFilter === 'rejected') matchStatus = p.status === 'rejected';

      return matchSearch && matchProvince && matchCategory && matchStatus;
    });
  }, [posts, searchQuery, provinceFilter, categoryFilter, statusFilter]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  const handleDeletePost = (post: AdminPostItem) => {
    setConfirmModal({
      visible: true,
      title: 'Xóa bài đăng vi phạm',
      message: `Bạn có chắc chắn muốn xóa bài viết "${post.place_name}" của tác giả "${post.author?.full_name || 'Người dùng'}"? Bài viết và toàn bộ phản hồi, cảm xúc liên quan sẽ bị xóa vĩnh viễn khỏi cộng đồng!`,
      onConfirm: () => {
        deletePostMutation.mutate({ id: post.id, countStrike: true });
        setConfirmModal(null);
      },
    });
  };

  const handleApprovePost = (post: AdminPostItem) => {
    moderatePostMutation.mutate({ id: post.id, action: 'approve' });
  };

  const handleDismissReports = (post: AdminPostItem) => {
    moderatePostMutation.mutate({ id: post.id, action: 'dismiss_reports' });
  };

  const handleOpenRejectModal = (post: AdminPostItem) => {
    setRejectModal({
      post,
      reason: post.reports && post.reports.length > 0 ? post.reports[0].reason : 'Nội dung vi phạm tiêu chuẩn cộng đồng ViVu',
    });
  };

  const handleConfirmReject = () => {
    if (!rejectModal) return;
    moderatePostMutation.mutate({
      id: rejectModal.post.id,
      action: 'reject',
      reason: rejectModal.reason.trim(),
    });
  };

  const getCategoryInfo = (catId: string) => {
    const found = POST_CATEGORIES.find((c) => c.id === catId);
    return found || { label: 'Khác', color: '#64748B', icon: '📍' };
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FAF8F5' }}>
      <AdminNav />

      {/* Toast Alert */}
      {toast && (
        <View
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            zIndex: 9999,
            backgroundColor: toast.type === 'error' ? '#EF4444' : toast.type === 'info' ? '#3B82F6' : '#10B981',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)' as any,
          }}
        >
          {toast.type === 'error' ? (
            <AlertCircle size={18} color="#FFFFFF" />
          ) : (
            <CheckCircle2 size={18} color="#FFFFFF" />
          )}
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>{toast.message}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 24, gap: 20, maxWidth: 1400, width: '100%', alignSelf: 'center' }}>
        {/* Header Title & Refresh */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 24, color: BRAND_COLORS.text }}>
                Quản Lý Bài Đăng Cộng Đồng
              </Text>
              <View
                style={{
                  backgroundColor: `${BRAND_COLORS.primary}15`,
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                  borderRadius: 100,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND_COLORS.primary }}>
                  {filteredPosts.length} bài
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 13, color: BRAND_COLORS.textMuted, marginTop: 4 }}>
              Kiểm duyệt, quản lý nội dung, xử lý báo cáo vi phạm và tự động khóa đăng bài khi tái phạm 5 lần.
            </Text>
          </View>

          <Pressable
            testID="btn-refresh-admin-posts"
            onPress={() => refetch()}
            disabled={isRefetching}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 16,
              paddingVertical: 10,
              backgroundColor: '#FFFFFF',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: BRAND_COLORS.line,
              cursor: 'pointer' as any,
            }}
          >
            <RefreshCw size={16} color={BRAND_COLORS.text} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_COLORS.text }}>
              {isRefetching ? 'Đang làm mới...' : 'Làm mới'}
            </Text>
          </Pressable>
        </View>

        {/* 4 Stats Cards */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          <View
            style={{
              flex: 1,
              minWidth: 160,
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: BRAND_COLORS.line,
              gap: 6,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND_COLORS.textMuted, textTransform: 'uppercase' }}>
              Tổng bài viết
            </Text>
            <Text style={{ fontSize: 26, fontWeight: '800', color: BRAND_COLORS.primary }}>
              {stats.total}
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              minWidth: 160,
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: BRAND_COLORS.line,
              gap: 6,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND_COLORS.textMuted, textTransform: 'uppercase' }}>
              Đã duyệt công khai
            </Text>
            <Text style={{ fontSize: 26, fontWeight: '800', color: '#10B981' }}>
              {stats.approvedCount}
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              minWidth: 160,
              backgroundColor: stats.reportedCount > 0 ? '#FEF2F2' : '#FFFFFF',
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: stats.reportedCount > 0 ? '#FCA5A5' : BRAND_COLORS.line,
              gap: 6,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: stats.reportedCount > 0 ? '#DC2626' : BRAND_COLORS.textMuted, textTransform: 'uppercase' }}>
                Bị báo cáo
              </Text>
              {stats.reportedCount > 0 && <Flag size={14} color="#DC2626" />}
            </View>
            <Text style={{ fontSize: 26, fontWeight: '800', color: stats.reportedCount > 0 ? '#DC2626' : '#64748B' }}>
              {stats.reportedCount}
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              minWidth: 160,
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: BRAND_COLORS.line,
              gap: 6,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND_COLORS.textMuted, textTransform: 'uppercase' }}>
              Bị từ chối / gỡ
            </Text>
            <Text style={{ fontSize: 26, fontWeight: '800', color: '#64748B' }}>
              {stats.rejectedCount}
            </Text>
          </View>
        </View>

        {/* Filters & Search Container */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: BRAND_COLORS.line,
            gap: 14,
          }}
        >
          {/* Status Tabs */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 }}>
            {[
              { id: 'all', label: `Tất cả (${stats.total})` },
              { id: 'approved', label: `Đã duyệt ✅ (${stats.approvedCount})` },
              { id: 'reported', label: `Bị báo cáo 🚩 (${stats.reportedCount})`, isAlert: stats.reportedCount > 0 },
              { id: 'rejected', label: `Bị từ chối 🚫 (${stats.rejectedCount})` },
            ].map((tab) => {
              const isSelected = statusFilter === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  testID={`filter-status-${tab.id}`}
                  onPress={() => setStatusFilter(tab.id as any)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: 100,
                    backgroundColor: isSelected
                      ? (tab.id === 'reported' ? '#DC2626' : BRAND_COLORS.primary)
                      : (tab.isAlert ? '#FEE2E2' : '#F1F5F9'),
                    cursor: 'pointer' as any,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: isSelected
                        ? '#FFFFFF'
                        : (tab.isAlert ? '#DC2626' : '#475569'),
                    }}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Search Input */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: '#F8FAFC',
              borderRadius: 12,
              paddingHorizontal: 14,
              borderWidth: 1,
              borderColor: '#E2E8F0',
            }}
          >
            <Search size={18} color="#94A3B8" />
            <TextInput
              testID="input-search-admin-posts"
              placeholder="Tìm kiếm theo địa điểm, tác giả, nội dung, email..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{
                flex: 1,
                paddingVertical: 10,
                fontSize: 14,
                color: BRAND_COLORS.text,
              }}
            />
            {!!searchQuery && (
              <Pressable onPress={() => setSearchQuery('')} style={{ cursor: 'pointer' as any }}>
                <X size={16} color="#94A3B8" />
              </Pressable>
            )}
          </View>

          {/* Category & Province Badges */}
          <View style={{ gap: 10 }}>
            {/* Category Filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Pressable
                testID="filter-cat-all"
                onPress={() => setCategoryFilter('')}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 100,
                  backgroundColor: !categoryFilter ? BRAND_COLORS.primary : '#F1F5F9',
                  cursor: 'pointer' as any,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: !categoryFilter ? '#FFFFFF' : '#475569',
                  }}
                >
                  Tất cả danh mục
                </Text>
              </Pressable>

              {POST_CATEGORIES.map((cat) => {
                const isSelected = categoryFilter === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    testID={`filter-cat-${cat.id}`}
                    onPress={() => setCategoryFilter(isSelected ? '' : cat.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 100,
                      backgroundColor: isSelected ? BRAND_COLORS.primary : '#F1F5F9',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Text style={{ fontSize: 12 }}>{cat.icon}</Text>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: isSelected ? '#FFFFFF' : '#475569',
                      }}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Province Filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Pressable
                testID="filter-prov-all"
                onPress={() => setProvinceFilter('')}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 100,
                  backgroundColor: !provinceFilter ? '#1E293B' : '#F1F5F9',
                  cursor: 'pointer' as any,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: !provinceFilter ? '#FFFFFF' : '#475569',
                  }}
                >
                  Toàn quốc (63 tỉnh)
                </Text>
              </Pressable>

              {['Hà Nội', 'Đà Nẵng', 'TP. Hồ Chí Minh', 'Lâm Đồng', 'Khánh Hòa', 'Quảng Ninh', 'Kiên Giang'].map((prov) => {
                const isSelected = provinceFilter === prov;
                return (
                  <Pressable
                    key={prov}
                    testID={`filter-prov-${prov}`}
                    onPress={() => setProvinceFilter(isSelected ? '' : prov)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 100,
                      backgroundColor: isSelected ? '#1E293B' : '#F1F5F9',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <MapPin size={12} color={isSelected ? '#FFFFFF' : '#64748B'} />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: isSelected ? '#FFFFFF' : '#475569',
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

        {/* Posts Table / List */}
        {isLoading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center', gap: 12 }}>
            <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
            <Text style={{ fontSize: 13, color: BRAND_COLORS.textMuted }}>Đang tải danh sách bài đăng...</Text>
          </View>
        ) : filteredPosts.length === 0 ? (
          <View
            style={{
              paddingVertical: 60,
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: BRAND_COLORS.line,
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Compass size={40} color="#94A3B8" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: BRAND_COLORS.text }}>
              Không tìm thấy bài đăng nào
            </Text>
            <Text style={{ fontSize: 13, color: BRAND_COLORS.textMuted }}>
              Thử thay đổi từ khóa tìm kiếm hoặc chuyển sang tab trạng thái khác.
            </Text>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: BRAND_COLORS.line,
              overflow: 'hidden',
            }}
          >
            {/* Table Header */}
            <View
              style={{
                flexDirection: 'row',
                paddingHorizontal: 18,
                paddingVertical: 12,
                backgroundColor: '#F8FAFC',
                borderBottomWidth: 1,
                borderBottomColor: '#E2E8F0',
              }}
            >
              <Text style={{ flex: 3.2, fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                Địa điểm & Tác giả
              </Text>
              <Text style={{ flex: 1.6, fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                Phân loại & Tỉnh thành
              </Text>
              <Text style={{ flex: 1.6, fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                Trạng thái & Báo cáo
              </Text>
              <Text style={{ flex: 1.4, fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                Đánh giá & Tương tác
              </Text>
              <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                Thời gian
              </Text>
              <Text style={{ width: 140, textAlign: 'right', fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                Thao tác
              </Text>
            </View>

            {/* Table Rows */}
            {filteredPosts.map((post, idx) => {
              const catInfo = getCategoryInfo(post.category);
              const isReported = (post.reports_count || 0) > 0;
              const isRejected = post.status === 'rejected';
              const penalty = post.author_penalty;

              return (
                <View
                  key={post.id}
                  testID={`admin-post-row-${post.id}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 18,
                    paddingVertical: 14,
                    borderBottomWidth: idx < filteredPosts.length - 1 ? 1 : 0,
                    borderBottomColor: '#F1F5F9',
                    backgroundColor: isReported ? '#FFFDFD' : isRejected ? '#F8FAFC' : '#FFFFFF',
                  }}
                >
                  {/* Col 1: Place & Author */}
                  <View style={{ flex: 3.2, flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 8 }}>
                    {post.media_urls && post.media_urls.length > 0 ? (
                      <Image
                        source={{ uri: post.media_urls[0] }}
                        style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#E2E8F0' }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 8,
                          backgroundColor: '#F1F5F9',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 18 }}>{catInfo.icon}</Text>
                      </View>
                    )}

                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: BRAND_COLORS.text }} numberOfLines={1}>
                        {post.place_name}
                      </Text>
                      <Text style={{ fontSize: 12, color: BRAND_COLORS.textMuted }} numberOfLines={2}>
                        bởi <Text style={{ fontWeight: '600', color: BRAND_COLORS.text }}>{post.author?.full_name || 'Người dùng'}</Text>
                        {post.author?.email ? ` (${post.author.email})` : ''}
                      </Text>

                      {/* Penalty / Strike Badge */}
                      {penalty?.isBanned ? (
                        <View style={{ alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#FEF2F2', marginTop: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#DC2626' }}>
                            🚫 Cấm đăng bài ({penalty.remainingDays} ngày)
                          </Text>
                        </View>
                      ) : (penalty?.strikeCount || 0) > 0 ? (
                        <View style={{ alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#FFFBEB', marginTop: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#D97706' }}>
                            ⚠️ {penalty?.strikeCount}/5 vi phạm
                          </Text>
                        </View>
                      ) : (
                        <View style={{ alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#F0FDF4', marginTop: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#16A34A' }}>
                            🛡️ 0/5 vi phạm
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Col 2: Category & Province */}
                  <View style={{ flex: 1.8, gap: 4, paddingRight: 8 }}>
                    <View
                      style={{
                        alignSelf: 'flex-start',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 6,
                        backgroundColor: catInfo.color + '15',
                      }}
                    >
                      <Text style={{ fontSize: 11 }}>{catInfo.icon}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: catInfo.color }}>
                        {catInfo.label}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <MapPin size={12} color="#64748B" />
                      <Text style={{ fontSize: 12, color: '#64748B' }}>{post.province}</Text>
                    </View>
                  </View>

                  {/* Col 3: Status & Reports */}
                  <View style={{ flex: 1.8, gap: 4, paddingRight: 8 }}>
                    <View
                      style={{
                        alignSelf: 'flex-start',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 6,
                        backgroundColor: isRejected ? '#F1F5F9' : '#ECFDF5',
                        borderWidth: 1,
                        borderColor: isRejected ? '#E2E8F0' : '#A7F3D0',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '800',
                          color: isRejected ? '#64748B' : '#059669',
                        }}
                      >
                        {isRejected ? '🚫 Bị từ chối' : '✅ Đã duyệt'}
                      </Text>
                    </View>

                    {isReported && (
                      <View
                        style={{
                          alignSelf: 'flex-start',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 6,
                          backgroundColor: '#FEE2E2',
                          borderWidth: 1,
                          borderColor: '#FCA5A5',
                        }}
                      >
                        <Flag size={11} color="#DC2626" />
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#DC2626' }}>
                          {post.reports_count} báo cáo
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Col 4: Rating & Reactions */}
                  <View style={{ flex: 1.4, gap: 4, paddingRight: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Star size={13} color="#F59E0B" fill="#F59E0B" />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND_COLORS.text }}>
                        {post.rating} / 5
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 11, color: '#E11D48', fontWeight: '600' }}>
                        ❤️ {post.reactions?.total || 0}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#475569', fontWeight: '600' }}>
                        💬 {post.comments_count || 0}
                      </Text>
                    </View>
                  </View>

                  {/* Col 5: Created At */}
                  <View style={{ flex: 1.2, paddingRight: 8 }}>
                    <Text style={{ fontSize: 11, color: '#64748B' }}>{formatDate(post.created_at)}</Text>
                  </View>

                  {/* Col 6: Actions */}
                  <View style={{ width: 140, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }}>
                    {/* View Details */}
                    <Pressable
                      testID={`btn-view-post-${post.id}`}
                      onPress={() => setSelectedPost(post)}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        backgroundColor: '#F1F5F9',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer' as any,
                      }}
                      accessibilityLabel="Xem chi tiết"
                    >
                      <Eye size={15} color="#334155" />
                    </Pressable>

                    {/* Dismiss Reports if reported */}
                    {isReported && (
                      <Pressable
                        testID={`btn-dismiss-reports-${post.id}`}
                        onPress={() => handleDismissReports(post)}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          backgroundColor: '#EFF6FF',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer' as any,
                        }}
                        accessibilityLabel="Bỏ qua cờ báo cáo"
                      >
                        <ShieldCheck size={15} color="#2563EB" />
                      </Pressable>
                    )}

                    {/* Reject / Moderate Button */}
                    {!isRejected ? (
                      <Pressable
                        testID={`btn-reject-post-${post.id}`}
                        onPress={() => handleOpenRejectModal(post)}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          backgroundColor: '#FFF7ED',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer' as any,
                        }}
                        accessibilityLabel="Gỡ bài viết vi phạm"
                      >
                        <Ban size={15} color="#EA580C" />
                      </Pressable>
                    ) : (
                      <Pressable
                        testID={`btn-approve-post-${post.id}`}
                        onPress={() => handleApprovePost(post)}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          backgroundColor: '#ECFDF5',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer' as any,
                        }}
                        accessibilityLabel="Duyệt lại bài viết"
                      >
                        <CheckCircle2 size={15} color="#059669" />
                      </Pressable>
                    )}

                    {/* Delete Permanently */}
                    <Pressable
                      testID={`btn-delete-post-${post.id}`}
                      onPress={() => handleDeletePost(post)}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        backgroundColor: '#FEE2E2',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer' as any,
                      }}
                      accessibilityLabel="Xóa vĩnh viễn"
                    >
                      <Trash2 size={15} color="#DC2626" />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Modal Xem Chi Tiết Bài Đăng */}
      {selectedPost && (
        <Modal visible={!!selectedPost} transparent animationType="fade" onRequestClose={() => setSelectedPost(null)}>
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(20, 32, 27, 0.75)',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 16,
            }}
          >
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 24,
                width: '100%',
                maxWidth: 680,
                maxHeight: '90%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)' as any,
              }}
            >
              {/* Modal Header */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 22,
                  paddingVertical: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: '#F1F5F9',
                  backgroundColor: '#FBF5EA',
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 18, color: BRAND_COLORS.text }}>
                    Chi Tiết Bài Đăng #{selectedPost.id.slice(0, 8)}
                  </Text>
                  <Text style={{ fontSize: 12, color: BRAND_COLORS.textMuted }}>
                    Ngày đăng: {formatDate(selectedPost.created_at)}
                  </Text>
                </View>

                <Pressable
                  testID="btn-close-post-detail-modal"
                  onPress={() => setSelectedPost(null)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: 'rgba(27,36,32,0.06)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer' as any,
                  }}
                >
                  <X size={18} color="#1B2420" />
                </Pressable>
              </View>

              {/* Modal Scroll Content */}
              <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }}>
                {/* Place Name & Rating */}
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                    <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 20, color: BRAND_COLORS.text, flex: 1 }}>
                      {selectedPost.place_name}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 }}>
                      <Star size={16} color="#F59E0B" fill="#F59E0B" />
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#B45309' }}>
                        {selectedPost.rating} / 5
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <MapPin size={14} color="#64748B" />
                      <Text style={{ fontSize: 13, color: '#64748B' }}>{selectedPost.province}</Text>
                    </View>
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1' }} />
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: '#F1F5F9' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>
                        {getCategoryInfo(selectedPost.category).icon} {getCategoryInfo(selectedPost.category).label}
                      </Text>
                    </View>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: selectedPost.status === 'rejected' ? '#FEE2E2' : '#DCFCE7' }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: selectedPost.status === 'rejected' ? '#DC2626' : '#15803D' }}>
                        {selectedPost.status === 'rejected' ? '🚫 Đã bị gỡ' : '✅ Đang công khai'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Author Info & Strike Status */}
                <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', gap: 6 }}>
                  <Text style={{ fontSize: 13, color: '#334155' }}>
                    👤 Tác giả: <Text style={{ fontWeight: '700' }}>{selectedPost.author?.full_name}</Text>
                    {selectedPost.author?.email ? ` · Email: ${selectedPost.author.email}` : ''}
                  </Text>
                  {selectedPost.author_penalty?.isBanned ? (
                    <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '700' }}>
                      🚫 Tài khoản đang bị HỆ THỐNG CẤM ĐĂNG BÀI 7 NGÀY (còn {selectedPost.author_penalty.remainingDays} ngày).
                    </Text>
                  ) : (selectedPost.author_penalty?.strikeCount || 0) > 0 ? (
                    <Text style={{ fontSize: 12, color: '#D97706', fontWeight: '700' }}>
                      ⚠️ Tác giả đã tích lũy {selectedPost.author_penalty?.strikeCount}/5 lần vi phạm (5 lần sẽ bị cấm 7 ngày).
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 12, color: '#16A34A', fontWeight: '600' }}>
                      🛡️ Trạng thái tác giả: 0/5 vi phạm (Tài khoản tốt, chưa có vi phạm cộng đồng nào).
                    </Text>
                  )}
                </View>

                {/* Reports History if any */}
                {selectedPost.reports && selectedPost.reports.length > 0 && (
                  <View style={{ backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FCA5A5', gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Flag size={16} color="#DC2626" />
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#DC2626' }}>
                        Danh sách báo cáo từ người dùng ({selectedPost.reports.length} lượt)
                      </Text>
                    </View>
                    {selectedPost.reports.map((rep, rIdx) => (
                      <View key={rIdx} style={{ backgroundColor: '#FFFFFF', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA', gap: 2 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#991B1B' }}>
                          • {rep.reason} <Text style={{ fontWeight: '400', color: '#64748B' }}>({formatDate(rep.created_at)})</Text>
                        </Text>
                        {rep.details ? (
                          <Text style={{ fontSize: 12, color: '#334155' }}>Ghi chú: {rep.details}</Text>
                        ) : null}
                        <Text style={{ fontSize: 11, color: '#94A3B8' }}>Bởi: {rep.user_name} {rep.user_email ? `(${rep.user_email})` : ''}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Post Content */}
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_COLORS.text }}>Nội dung đánh giá:</Text>
                  <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
                    <Text style={{ fontSize: 14, lineHeight: 22, color: BRAND_COLORS.text }}>
                      {selectedPost.content || '(Không có nội dung mô tả)'}
                    </Text>
                  </View>
                </View>

                {/* Google Maps URL */}
                {selectedPost.google_maps_url ? (
                  <Pressable
                    onPress={() => window.open(selectedPost.google_maps_url, '_blank')}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, cursor: 'pointer' as any }}
                  >
                    <ExternalLink size={14} color="#0284C7" />
                    <Text style={{ fontSize: 13, color: '#0284C7', textDecorationLine: 'underline' }}>
                      {selectedPost.google_maps_url}
                    </Text>
                  </Pressable>
                ) : null}

                {/* Images Gallery */}
                {selectedPost.media_urls && selectedPost.media_urls.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_COLORS.text }}>
                      Hình ảnh đính kèm ({selectedPost.media_urls.length} ảnh):
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                      {selectedPost.media_urls.map((img, i) => (
                        <Image
                          key={i}
                          source={{ uri: img }}
                          style={{ width: 140, height: 100, borderRadius: 10, backgroundColor: '#E2E8F0' }}
                        />
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {/* Stats Bar */}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-around',
                    backgroundColor: '#F8FAFC',
                    borderRadius: 12,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#E11D48' }}>
                    ❤️ {selectedPost.reactions?.total || 0} Cảm xúc
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0284C7' }}>
                    💬 {selectedPost.comments_count || 0} Bình luận
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#D97706' }}>
                    💰 {selectedPost.cost_per_person > 0 ? `${selectedPost.cost_per_person.toLocaleString('vi-VN')} đ` : 'Không khai báo'}
                  </Text>
                </View>
              </ScrollView>

              {/* Modal Footer Actions */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  paddingHorizontal: 22,
                  paddingVertical: 14,
                  borderTopWidth: 1,
                  borderTopColor: '#F1F5F9',
                  backgroundColor: '#FFFFFF',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <Pressable
                  onPress={() => setSelectedPost(null)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: BRAND_COLORS.line,
                    backgroundColor: '#FFFFFF',
                    cursor: 'pointer' as any,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_COLORS.textSoft }}>Đóng</Text>
                </Pressable>

                {selectedPost.reports && selectedPost.reports.length > 0 && (
                  <Pressable
                    testID="modal-btn-dismiss-reports"
                    onPress={() => handleDismissReports(selectedPost)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 10,
                      backgroundColor: '#EFF6FF',
                      borderWidth: 1,
                      borderColor: '#BFDBFE',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <ShieldCheck size={15} color="#2563EB" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#2563EB' }}>Bỏ Qua Báo Cáo</Text>
                  </Pressable>
                )}

                {selectedPost.status === 'rejected' ? (
                  <Pressable
                    testID="modal-btn-approve-post"
                    onPress={() => handleApprovePost(selectedPost)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 10,
                      backgroundColor: '#059669',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <CheckCircle2 size={15} color="#FFFFFF" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Duyệt Lại Bài Này</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    testID="modal-btn-reject-post"
                    onPress={() => {
                      const p = selectedPost;
                      setSelectedPost(null);
                      handleOpenRejectModal(p);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 10,
                      backgroundColor: '#EA580C',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Ban size={15} color="#FFFFFF" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Gỡ Bài & Phạt Vi Phạm</Text>
                  </Pressable>
                )}

                <Pressable
                  testID="modal-btn-delete-post"
                  onPress={() => {
                    const p = selectedPost;
                    setSelectedPost(null);
                    handleDeletePost(p);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: '#DC2626',
                    cursor: 'pointer' as any,
                  }}
                >
                  <Trash2 size={15} color="#FFFFFF" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Xóa Vĩnh Viễn</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Modal Từ Chối & Phạt Vi Phạm (Reject Modal) */}
      {rejectModal && (
        <Modal visible={!!rejectModal} transparent animationType="fade" onRequestClose={() => setRejectModal(null)}>
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(20, 32, 27, 0.75)',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 16,
            }}
          >
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                width: '100%',
                maxWidth: 480,
                padding: 22,
                gap: 16,
                boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.3)' as any,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center' }}>
                  <Ban size={20} color="#EA580C" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 18, color: BRAND_COLORS.text }}>
                    Gỡ Bài Viết & Phạt Vi Phạm
                  </Text>
                  <Text style={{ fontSize: 12, color: BRAND_COLORS.textMuted }}>
                    Bài viết: "{rejectModal.post.place_name}"
                  </Text>
                </View>
              </View>

              <View style={{ backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FDE68A', gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#B45309' }}>
                  ⚠️ Quy tắc phạt cộng dồn:
                </Text>
                <Text style={{ fontSize: 12, color: '#92400E', lineHeight: 18 }}>
                  Tác giả hiện có <Text style={{ fontWeight: '800' }}>{rejectModal.post.author_penalty?.strikeCount || 0}/5</Text> lần vi phạm. Thao tác này sẽ gỡ bài viết và tính +1 lần vi phạm. Nếu đạt 5 lần, tài khoản sẽ bị <Text style={{ fontWeight: '800' }}>TỰ ĐỘNG CẤM ĐĂNG BÀI 7 NGÀY</Text>.
                </Text>
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_COLORS.text }}>
                  Lý do gỡ bài / vi phạm:
                </Text>
                <TextInput
                  testID="input-reject-reason"
                  value={rejectModal.reason}
                  onChangeText={(text) => setRejectModal((prev) => (prev ? { ...prev, reason: text } : null))}
                  placeholder="Nhập lý do vi phạm (quảng cáo, tục tĩu, lừa đảo...)"
                  style={{
                    backgroundColor: '#F8FAFC',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    padding: 10,
                    fontSize: 13,
                    color: BRAND_COLORS.text,
                  }}
                />
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                <Pressable
                  onPress={() => setRejectModal(null)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: BRAND_COLORS.line,
                    backgroundColor: '#FFFFFF',
                    cursor: 'pointer' as any,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_COLORS.textSoft }}>Hủy</Text>
                </Pressable>

                <Pressable
                  testID="btn-confirm-reject"
                  onPress={handleConfirmReject}
                  style={{
                    paddingHorizontal: 18,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: '#EA580C',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer' as any,
                  }}
                >
                  <Ban size={15} color="#FFFFFF" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Xác Nhận Gỡ Bài</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Confirm Delete Modal */}
      {confirmModal && (
        <ConfirmModal
          visible={confirmModal.visible}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText="Xác nhận xóa"
          cancelText="Hủy"
          isDestructive
          iconColor="#F59E0B"
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </View>
  );
}
