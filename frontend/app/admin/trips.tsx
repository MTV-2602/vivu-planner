import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import {
  Compass,
  Sparkles,
  Calendar,
  MapPin,
  Eye,
  Trash2,
  RefreshCw,
  Users2,
  Wallet,
} from 'lucide-react-native';
import { BRAND_COLORS, TripStatus } from '../../constants';
import {
  PageHeader,
  Card,
  StatCard,
  DataTable,
  Badge,
  Button,
  SearchInput,
  FilterChips,
  ConfirmDialog,
  Modal,
  Pagination,
  useAdminToast,
  formatVND,
  formatDate,
} from '../../components/admin/ui';
import {
  useAdminTrips,
  useDeleteAdminTrip,
  AdminTripItem,
} from '../../lib/adminApi';
import { cancelTripReminder } from '../../lib/notifications';
import { clearCache } from '../../lib/cache';

function getTripDuration(startDate?: string, endDate?: string): string {
  if (!startDate || !endDate) return '';
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays > 0 ? `${diffDays} ngày` : '';
}

export default function AdminTripsPage() {
  const { showToast } = useAdminToast();

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [tripType, setTripType] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Detail Modal state
  const [viewingTrip, setViewingTrip] = useState<AdminTripItem | null>(null);

  // Query trips
  const { data, isLoading, isFetching, refetch } = useAdminTrips({
    search: searchTerm,
    type: tripType,
    page,
    limit,
  });

  const trips = data?.trips || [];
  const summary = data?.summary;
  const totalPages = data?.totalPages || 1;
  const totalItems = data?.total || 0;

  // Delete mutation
  const deleteTripMutation = useDeleteAdminTrip();
  const [tripToDelete, setTripToDelete] = useState<AdminTripItem | null>(null);

  const handleDeleteTrip = async () => {
    if (!tripToDelete) return;
    try {
      await deleteTripMutation.mutateAsync(tripToDelete.id);
      cancelTripReminder(tripToDelete.id);
      clearCache(`trip_${tripToDelete.id}`);
      showToast('Đã xóa chuyến đi và toàn bộ lịch trình liên quan!', 'success');
      setTripToDelete(null);
    } catch (err: any) {
      showToast(err.response?.data?.error || err.message || 'Lỗi khi xóa chuyến đi', 'error');
    }
  };

  // Helper render status badge
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case TripStatus.COMPLETED:
      case 'completed':
        return <Badge size="sm" tone="success" label="Hoàn thành" dot />;
      case TripStatus.ACTIVE:
      case 'active':
        return <Badge size="sm" tone="info" label="Đang diễn ra" dot />;
      case TripStatus.ARCHIVED:
      case 'archived':
        return <Badge size="sm" tone="warning" label="Lưu trữ" />;
      case 'cancelled':
        return <Badge size="sm" tone="danger" label="Đã hủy" />;
      case TripStatus.DRAFT:
      case 'draft':
      default:
        return <Badge size="sm" tone="neutral" label="Lên kế hoạch" />;
    }
  };

  // Table columns definition
  const columns = [
    {
      key: 'trip',
      title: 'Chuyến đi',
      width: 270,
      render: (t: AdminTripItem) => (
        <View className="gap-1 justify-center">
          <View className="flex-row items-center gap-1.5 flex-wrap">
            <Text className="font-bold text-xs text-brand-text flex-1" numberOfLines={1}>
              {t.title || 'Chuyến đi'}
            </Text>
            <Badge
              size="sm"
              tone={t.isPro ? 'brand' : 'neutral'}
              label={t.isPro ? 'AI Pro' : 'Thường'}
            />
          </View>
          <View className="flex-row items-center gap-1 text-[11px] text-brand-textSoft">
            <MapPin size={11} color={BRAND_COLORS.textSoft} />
            <Text className="text-[11px] text-brand-textSoft font-medium" numberOfLines={1}>
              {t.destinationCity || 'Chưa xác định điểm đến'}
            </Text>
          </View>
        </View>
      ),
    },
    {
      key: 'owner',
      title: 'Người tạo',
      width: 220,
      render: (t: AdminTripItem) => (
        <View className="gap-0.5 justify-center">
          <Text className="font-bold text-xs text-brand-text" numberOfLines={1}>
            {t.ownerName || 'Người dùng'}
          </Text>
          <Text className="text-[11px] text-brand-textSoft" numberOfLines={1}>
            {t.ownerEmail || '—'}
          </Text>
        </View>
      ),
    },
    {
      key: 'dates',
      title: 'Lịch trình',
      width: 200,
      render: (t: AdminTripItem) => {
        const duration = getTripDuration(t.startDate, t.endDate);
        return (
          <View className="gap-0.5 justify-center">
            <Text className="text-xs text-brand-text font-medium">
              {formatDate(t.startDate)} - {formatDate(t.endDate)}
            </Text>
            {duration ? (
              <Text className="text-[11px] text-brand-primary font-semibold">
                Thời lượng: {duration}
              </Text>
            ) : null}
          </View>
        );
      },
    },
    {
      key: 'budget',
      title: 'Quy mô & Ngân sách',
      width: 170,
      render: (t: AdminTripItem) => (
        <View className="gap-0.5 justify-center">
          <View className="flex-row items-center gap-1">
            <Users2 size={11} color={BRAND_COLORS.textSoft} />
            <Text className="text-xs font-semibold text-brand-text">
              {t.travelerCount} thành viên
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Wallet size={11} color={BRAND_COLORS.primary} />
            <Text className="text-[11px] font-bold text-brand-primary">
              {formatVND(t.budgetTotal)}
            </Text>
          </View>
        </View>
      ),
    },
    {
      key: 'status',
      title: 'Trạng thái',
      width: 130,
      align: 'center' as const,
      render: (t: AdminTripItem) => renderStatusBadge(t.status),
    },
    {
      key: 'createdAt',
      title: 'Ngày tạo',
      width: 120,
      align: 'center' as const,
      render: (t: AdminTripItem) => (
        <Text className="text-xs text-brand-textMuted">
          {formatDate(t.createdAt)}
        </Text>
      ),
    },
    {
      key: 'actions',
      title: 'Thao tác',
      width: 170,
      align: 'right' as const,
      render: (t: AdminTripItem) => (
        <View className="flex-row items-center gap-1.5 justify-end">
          <Button
            size="sm"
            variant="outline"
            icon={<Eye size={12} color={BRAND_COLORS.text} />}
            label="Xem"
            onPress={() => setViewingTrip(t)}
          />
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 size={12} color="#FFFFFF" />}
            label="Xóa"
            onPress={() => setTripToDelete(t)}
          />
        </View>
      ),
    },
  ];

  return (
    <ScrollView
      className="flex-1 bg-brand-bg"
      contentContainerStyle={{ padding: 20, gap: 20 }}
    >
      {/* 1. Header */}
      <PageHeader
        title="Quản lý Chuyến đi"
        description="Theo dõi toàn bộ lịch trình chuyến đi, trạng thái và quy mô kế hoạch trên hệ thống"
        action={
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw size={13} color={BRAND_COLORS.primary} />}
            label="Làm mới"
            loading={isFetching}
            onPress={() => refetch()}
          />
        }
      />

      {/* 2. Stat Cards */}
      <View className="flex-row flex-wrap gap-4">
        <View className="min-w-[220px] flex-1">
          <StatCard
            label="Tổng chuyến đi"
            value={summary?.total ?? 0}
            icon={<Compass size={18} color="#1F6F54" />}
            iconBg="rgba(31, 111, 84, 0.1)"
            loading={isLoading}
          />
        </View>
        <View className="min-w-[220px] flex-1">
          <StatCard
            label="Chuyến đi AI Pro"
            value={summary?.pro ?? 0}
            icon={<Sparkles size={18} color="#D97706" />}
            iconBg="rgba(245, 158, 11, 0.15)"
            loading={isLoading}
          />
        </View>
        <View className="min-w-[220px] flex-1">
          <StatCard
            label="Chuyến đi Miễn phí"
            value={summary?.free ?? 0}
            icon={<Calendar size={18} color="#2563EB" />}
            iconBg="rgba(37, 99, 235, 0.1)"
            loading={isLoading}
          />
        </View>
      </View>

      {/* 3. Main Card with Search, FilterChips, DataTable & Pagination */}
      <Card padding="none">
        {/* Search & Filter Header */}
        <View className="p-4 border-b border-brand-line/20 gap-3">
          <View className="flex-row items-center justify-between gap-3 flex-wrap">
            <View className="flex-1 min-w-[280px]">
              <SearchInput
                value={searchTerm}
                onChangeText={(text) => {
                  setSearchTerm(text);
                  setPage(1);
                }}
                placeholder="Tìm theo tiêu đề, địa điểm hoặc email người tạo..."
              />
            </View>
          </View>

          <FilterChips
            options={[
              { value: 'all', label: 'Tất cả chuyến đi', count: summary?.total },
              { value: 'pro', label: 'Chuyến đi AI Pro', count: summary?.pro },
              { value: 'free', label: 'Chuyến đi Miễn phí', count: summary?.free },
            ]}
            value={tripType}
            onChange={(val) => {
              setTripType(val);
              setPage(1);
            }}
          />
        </View>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={trips}
          keyExtractor={(t) => t.id}
          loading={isLoading}
          emptyTitle="Chưa có chuyến đi nào"
          emptyMessage="Không tìm thấy chuyến đi phù hợp với từ khóa hoặc bộ lọc đã chọn."
          minWidth={1180}
        />

        {/* Pagination Footer */}
        <View className="p-3 border-t border-brand-line/20">
          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            limit={limit}
            onPageChange={(newPage) => setPage(newPage)}
            disabled={isLoading || isFetching}
          />
        </View>
      </Card>

      {/* 4. Confirm Dialog Delete Trip */}
      <ConfirmDialog
        visible={Boolean(tripToDelete)}
        title="Xác nhận xóa chuyến đi"
        message={`Bạn có chắc chắn muốn xóa chuyến đi "${tripToDelete?.title}"? Toàn bộ các ngày lịch trình, hoạt động chi tiết, chi tiêu và sự cố liên quan sẽ bị XÓA SẠCH khỏi hệ thống!`}
        confirmText="Xóa sạch"
        cancelText="Hủy"
        isDestructive
        loading={deleteTripMutation.isPending}
        onConfirm={handleDeleteTrip}
        onCancel={() => setTripToDelete(null)}
      />

      {/* 5. Trip Details Modal (Admin Only Management View) */}
      <Modal
        visible={Boolean(viewingTrip)}
        onClose={() => setViewingTrip(null)}
        title="Chi tiết Chuyến đi"
        subtitle={viewingTrip ? `Mã chuyến đi: ${viewingTrip.id}` : undefined}
        maxWidth={620}
        footer={
          <View className="flex-row items-center justify-between w-full">
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 size={13} color="#FFFFFF" />}
              label="Xóa chuyến đi này"
              onPress={() => {
                if (viewingTrip) {
                  const t = viewingTrip;
                  setViewingTrip(null);
                  setTripToDelete(t);
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              label="Đóng"
              onPress={() => setViewingTrip(null)}
            />
          </View>
        }
      >
        {viewingTrip && (
          <View className="gap-4">
            {/* Header Trip Card */}
            <View className="p-4 rounded-xl bg-slate-50 border border-brand-line/30 gap-2">
              <View className="flex-row items-center justify-between flex-wrap gap-2">
                <Text className="font-display font-bold text-base text-brand-text flex-1" numberOfLines={2}>
                  {viewingTrip.title || 'Chuyến đi'}
                </Text>
                <Badge
                  size="sm"
                  tone={viewingTrip.isPro ? 'brand' : 'neutral'}
                  label={viewingTrip.isPro ? 'AI Pro' : 'Thường'}
                />
              </View>
              <View className="flex-row items-center gap-1.5">
                <MapPin size={13} color={BRAND_COLORS.primary} />
                <Text className="text-xs font-semibold text-brand-primary">
                  {viewingTrip.destinationCity || 'Chưa xác định điểm đến'}
                </Text>
              </View>
            </View>

            {/* Info Grid */}
            <View className="gap-3">
              {/* Creator Card */}
              <View className="p-3.5 rounded-xl border border-brand-line/20 bg-white gap-1.5">
                <Text className="text-[10px] font-bold text-brand-textMuted uppercase tracking-wider">
                  Người tạo
                </Text>
                <Text className="text-sm font-bold text-brand-text">
                  {viewingTrip.ownerName || 'Người dùng'}
                </Text>
                <Text className="text-xs text-brand-textSoft">
                  Email: {viewingTrip.ownerEmail || '—'}
                </Text>
                <Text className="text-[11px] text-brand-textMuted font-mono mt-0.5" numberOfLines={1}>
                  Mã người dùng (ID): {viewingTrip.ownerId || '—'}
                </Text>
              </View>

              {/* Timing & Status Row */}
              <View className="flex-col sm:flex-row gap-3">
                {/* Timing */}
                <View className="flex-1 p-3.5 rounded-xl border border-brand-line/20 bg-white gap-1.5">
                  <Text className="text-[10px] font-bold text-brand-textMuted uppercase tracking-wider">
                    Thời gian
                  </Text>
                  <Text className="text-xs font-semibold text-brand-text">
                    {formatDate(viewingTrip.startDate)} - {formatDate(viewingTrip.endDate)}
                  </Text>
                  {getTripDuration(viewingTrip.startDate, viewingTrip.endDate) ? (
                    <Text className="text-xs font-bold text-brand-primary">
                      Thời lượng: {getTripDuration(viewingTrip.startDate, viewingTrip.endDate)}
                    </Text>
                  ) : null}
                </View>

                {/* Status */}
                <View className="flex-1 p-3.5 rounded-xl border border-brand-line/20 bg-white gap-1.5">
                  <Text className="text-[10px] font-bold text-brand-textMuted uppercase tracking-wider">
                    Trạng thái kế hoạch
                  </Text>
                  <View className="flex-row items-center gap-2 mt-0.5">
                    {renderStatusBadge(viewingTrip.status)}
                  </View>
                </View>
              </View>

              {/* Scale & Budget Row */}
              <View className="flex-col sm:flex-row gap-3">
                {/* Scale */}
                <View className="flex-1 p-3.5 rounded-xl border border-brand-line/20 bg-white gap-1.5">
                  <Text className="text-[10px] font-bold text-brand-textMuted uppercase tracking-wider">
                    Quy mô
                  </Text>
                  <View className="flex-row items-center gap-1.5">
                    <Users2 size={13} color={BRAND_COLORS.textSoft} />
                    <Text className="text-xs font-bold text-brand-text">
                      {viewingTrip.travelerCount} thành viên tham gia
                    </Text>
                  </View>
                </View>

                {/* Budget */}
                <View className="flex-1 p-3.5 rounded-xl border border-brand-line/20 bg-white gap-1.5">
                  <Text className="text-[10px] font-bold text-brand-textMuted uppercase tracking-wider">
                    Dự toán ngân sách
                  </Text>
                  <View className="flex-row items-center gap-1.5">
                    <Wallet size={13} color={BRAND_COLORS.primary} />
                    <Text className="text-xs font-bold text-brand-primary">
                      {formatVND(viewingTrip.budgetTotal)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* System Created At Row */}
              <View className="p-3 rounded-xl bg-slate-50 border border-brand-line/20 flex-row items-center justify-between">
                <Text className="text-xs text-brand-textMuted">
                  Ngày tạo hệ thống:
                </Text>
                <Text className="text-xs font-semibold text-brand-text">
                  {formatDate(viewingTrip.createdAt)}
                </Text>
              </View>
            </View>
          </View>
        )}
      </Modal>
    </ScrollView>
  );
}
