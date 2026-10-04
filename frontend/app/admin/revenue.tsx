import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import {
  TrendingUp,
  CreditCard,
  Calculator,
  Users,
  RefreshCw,
  Zap,
} from 'lucide-react-native';
import { BRAND_COLORS } from '../../constants';
import {
  PageHeader,
  RangeSelector,
  AdminRange,
  StatCard,
  Card,
  Button,
  SearchInput,
  FilterChips,
  DataTable,
  Column,
  Pagination,
  Badge,
  BadgeTone,
  Switch,
  ConfirmDialog,
  ErrorState,
  AreaChart,
  DonutChart,
  useAdminToast,
  formatVND,
  formatCompactVND,
  formatDate,
  formatCompactNumber,
  formatPercentChange,
} from '../../components/admin/ui';
import {
  useAdminRevenue,
  useAdminOrders,
  useActivateOrder,
  useAdminPlans,
  AdminOrderItem,
  PaymentMethodFilter,
} from '../../lib/adminApi';

const PLAN_PALETTE = ['#1F6F54', '#E2703A', '#F0B255', '#3B82F6', '#8B5CF6', '#10B981'];

export default function AdminRevenuePage() {
  const [range, setRange] = useState<AdminRange>('30d');
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodFilter>('all');
  const [selectedPlan, setSelectedPlan] = useState<string>('all');
  const [showAllStatus, setShowAllStatus] = useState(false);

  // Modal kích hoạt thủ công
  const [activatingOrder, setActivatingOrder] = useState<AdminOrderItem | null>(null);

  const { showToast } = useAdminToast();

  // Queries
  const {
    data: revenueData,
    isLoading: revenueLoading,
    isRefetching: revenueRefetching,
    error: revenueError,
    refetch: refetchRevenue,
  } = useAdminRevenue(range);

  const { data: plansList } = useAdminPlans();

  const {
    data: ordersData,
    isLoading: ordersLoading,
    isRefetching: ordersRefetching,
    refetch: refetchOrders,
  } = useAdminOrders({
    status: showAllStatus ? 'all' : 'completed',
    method: selectedMethod,
    plan: selectedPlan,
    q: searchQuery,
    page,
    limit: 20,
  });

  const activateMutation = useActivateOrder();

  const handleConfirmActivate = () => {
    if (!activatingOrder) return;
    activateMutation.mutate(activatingOrder.id, {
      onSuccess: () => {
        showToast(
          `Đã kích hoạt thành công đơn hàng #${activatingOrder.orderCode || activatingOrder.id}!`,
          'success'
        );
        setActivatingOrder(null);
        refetchOrders();
        refetchRevenue();
      },
      onError: (err: any) => {
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'Không thể kích hoạt đơn';
        showToast(`Lỗi kích hoạt: ${msg}`, 'error');
        setActivatingOrder(null);
      },
    });
  };

  // Deltas for KPIs
  const revenueDelta = useMemo(() => {
    if (!revenueData?.kpis) return undefined;
    return formatPercentChange(revenueData.kpis.revenue, revenueData.kpis.prev);
  }, [revenueData]);

  const ordersDelta = useMemo(() => {
    if (!revenueData?.kpis) return undefined;
    return formatPercentChange(revenueData.kpis.orders, revenueData.kpis.prevOrders);
  }, [revenueData]);

  // Series for Chart
  const seriesData = useMemo(() => {
    if (!revenueData?.series) return [];
    return revenueData.series.map((s) => ({
      date: s.date,
      value: s.revenue,
    }));
  }, [revenueData?.series]);

  // Donut data by plan
  const planChartData = useMemo(() => {
    if (!revenueData?.byPlan || revenueData.byPlan.length === 0) return [];
    return revenueData.byPlan.map((p, idx) => ({
      label: p.label,
      value: p.revenue,
      color: PLAN_PALETTE[idx % PLAN_PALETTE.length],
      subtext: `${p.orders} đơn`,
    }));
  }, [revenueData?.byPlan]);

  // Donut data by method
  const methodChartData = useMemo(() => {
    if (!revenueData?.byMethod || revenueData.byMethod.length === 0) return [];
    const getMethodMeta = (m: string) => {
      const lower = m.toLowerCase();
      if (lower === 'payos') return { label: 'QR ngân hàng (PayOS)', color: '#1F6F54' };
      if (lower === 'momo') return { label: 'Ví MoMo', color: '#A50064' };
      if (lower === 'admin') return { label: 'Admin tặng', color: '#D97706' };
      return { label: m.toUpperCase(), color: '#6B7280' };
    };

    return revenueData.byMethod.map((m) => {
      const meta = getMethodMeta(m.method);
      return {
        label: meta.label,
        value: m.revenue,
        color: meta.color,
        subtext: `${m.orders} GD`,
      };
    });
  }, [revenueData?.byMethod]);

  // Method filter options
  const methodOptions = [
    { value: 'all', label: 'Tất cả phương thức' },
    { value: 'payos', label: 'QR ngân hàng' },
    { value: 'momo', label: 'MoMo' },
    { value: 'admin', label: 'Admin tặng' },
  ];

  // Plan filter options
  const planOptions = useMemo(() => {
    const defaultOpt = [{ value: 'all', label: 'Tất cả gói' }];
    if (!plansList) return defaultOpt;
    return defaultOpt.concat(
      plansList.map((p) => ({
        value: p.id,
        label: p.label,
      }))
    );
  }, [plansList]);

  // Columns definition for DataTable
  const columns: Column<AdminOrderItem>[] = [
    {
      key: 'createdAt',
      title: 'Thời gian',
      width: 140,
      render: (row) => (
        <View>
          <Text className="text-xs text-brand-text font-medium">
            {formatDate(row.createdAt, true)}
          </Text>
          <Text className="text-[10px] text-brand-textMuted font-mono">
            #{row.orderCode || row.id.substring(0, 8)}
          </Text>
        </View>
      ),
    },
    {
      key: 'user',
      title: 'Khách hàng',
      width: 200,
      render: (row) => (
        <View className="pr-2">
          <Text className="text-xs font-bold text-brand-text truncate" numberOfLines={1}>
            {row.fullName || 'Khách vãng lai'}
          </Text>
          <Text className="text-[11px] text-brand-textMuted truncate" numberOfLines={1}>
            {row.email}
          </Text>
        </View>
      ),
    },
    {
      key: 'plan',
      title: 'Gói đăng ký',
      width: 150,
      render: (row) => (
        <View className="flex-row items-center gap-1.5">
          <Text className="text-xs font-semibold text-brand-text">
            {row.planLabel || row.plan}
          </Text>
        </View>
      ),
    },
    {
      key: 'method',
      title: 'Phương thức',
      width: 140,
      render: (row) => {
        const m = (row.method || '').toLowerCase();
        if (row.isAdminGrant || m === 'admin') {
          return <Badge label="Admin tặng" tone="warning" size="sm" />;
        }
        if (m === 'payos') {
          return <Badge label="QR ngân hàng" tone="brand" size="sm" />;
        }
        if (m === 'momo') {
          return <Badge label="MoMo" tone="info" size="sm" />;
        }
        return <Badge label={row.method || 'Khác'} tone="neutral" size="sm" />;
      },
    },
    {
      key: 'amount',
      title: 'Số tiền',
      width: 120,
      align: 'right',
      render: (row) => (
        <Text
          className={`text-xs font-bold ${
            row.isAdminGrant ? 'text-brand-textMuted line-through' : 'text-brand-primary'
          }`}
        >
          {formatVND(row.amount)}
        </Text>
      ),
    },
    {
      key: 'status',
      title: 'Trạng thái',
      width: 110,
      align: 'center',
      render: (row) => {
        let tone: BadgeTone = 'neutral';
        let label = 'Không rõ';
        if (row.status === 'completed') {
          tone = 'success';
          label = 'Thành công';
        } else if (row.status === 'pending') {
          tone = 'warning';
          label = 'Chờ xử lý';
        } else if (row.status === 'cancelled') {
          tone = 'danger';
          label = 'Đã hủy';
        }

        return <Badge label={label} tone={tone} size="sm" dot />;
      },
    },
    {
      key: 'actions',
      title: 'Thao tác',
      width: 130,
      align: 'right',
      render: (row) => {
        if (row.status !== 'completed' && !row.isAdminGrant) {
          return (
            <Button
              variant="outline"
              size="sm"
              label="Kích hoạt"
              icon={<Zap size={11} color={BRAND_COLORS.primary} />}
              onPress={() => setActivatingOrder(row)}
            />
          );
        }
        return <Text className="text-[11px] text-brand-textMuted">—</Text>;
      },
    },
  ];

  return (
    <ScrollView
      className="flex-1 bg-brand-bg"
      contentContainerStyle={{ padding: 24, gap: 24 }}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Header */}
      <PageHeader
        title="Doanh thu & Giao dịch"
        description="Thống kê thanh toán, phân bổ gói cước và quản lý chi tiết đơn hàng"
        action={
          <View className="flex-row items-center gap-2">
            <RangeSelector value={range} onChange={setRange} />
            <Button
              variant="outline"
              size="sm"
              loading={revenueRefetching || ordersRefetching}
              icon={<RefreshCw size={13} color={BRAND_COLORS.textSoft} />}
              onPress={() => {
                refetchRevenue();
                refetchOrders();
              }}
            />
          </View>
        }
      />

      {revenueError && !revenueData ? (
        <ErrorState
          title="Không thể kết nối API Báo cáo Doanh thu"
          message="Endpoint GET /admin/revenue chưa hoàn thiện trên backend. Vui lòng bấm Thử lại."
          onRetry={() => {
            refetchRevenue();
            refetchOrders();
          }}
        />
      ) : (
        <>
          {/* 2. 4 KPI Cards */}
          <View className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* KPI 1: Doanh thu */}
            <StatCard
              label="Tổng doanh thu"
              value={revenueLoading ? '...' : formatVND(revenueData?.kpis?.revenue ?? 0)}
              delta={revenueDelta}
              subtext="Giao dịch thành công"
              icon={<TrendingUp size={18} color={BRAND_COLORS.primary} />}
              iconBg="rgba(31, 111, 84, 0.1)"
              loading={revenueLoading}
            />

            {/* KPI 2: Số giao dịch */}
            <StatCard
              label="Giao dịch thành công"
              value={revenueLoading ? '...' : formatCompactNumber(revenueData?.kpis?.orders ?? 0)}
              delta={ordersDelta}
              subtext="Đơn hoàn tất"
              icon={<CreditCard size={18} color="#2563EB" />}
              iconBg="rgba(37, 99, 235, 0.1)"
              loading={revenueLoading}
            />

            {/* KPI 3: Giá trị TB đơn */}
            <StatCard
              label="Giá trị đơn trung bình"
              value={revenueLoading ? '...' : formatCompactVND(revenueData?.kpis?.avgOrderValue ?? 0)}
              subtext="Mỗi đơn thành công"
              icon={<Calculator size={18} color="#D97706" />}
              iconBg="rgba(217, 119, 6, 0.1)"
              loading={revenueLoading}
            />

            {/* KPI 4: Khách trả tiền */}
            <StatCard
              label="Khách đã chi tiêu"
              value={revenueLoading ? '...' : formatCompactNumber(revenueData?.kpis?.paidUsers ?? 0)}
              subtext={`${revenueData?.kpis?.repeatBuyers ?? 0} khách mua lại`}
              icon={<Users size={18} color="#8B5CF6" />}
              iconBg="rgba(139, 92, 246, 0.1)"
              loading={revenueLoading}
            />
          </View>

          {/* 3. Biểu đồ Doanh thu theo thời gian */}
          <Card
            title="Biến động doanh thu theo thời gian"
            subtitle={`Tổng hợp ${revenueData?.bucket === 'month' ? 'theo tháng' : 'theo ngày'}`}
          >
            <View className="py-2">
              <AreaChart
                data={seriesData}
                height={240}
                seriesName="Doanh thu"
              />
            </View>
          </Card>

          {/* 4. Hai khối cơ cấu + Khách hàng nổi bật */}
          <View className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Khối cơ cấu gói */}
            <Card
              title="Doanh thu theo gói"
              subtitle="Tỷ trọng đóng góp từng gói cước"
              className="lg:col-span-1"
            >
              {planChartData.length > 0 ? (
                <DonutChart
                  data={planChartData}
                  centerSublabel="Doanh thu"
                  size={150}
                  strokeWidth={20}
                />
              ) : (
                <View className="py-8 items-center justify-center">
                  <Text className="text-xs text-brand-textMuted">Chưa có dữ liệu gói</Text>
                </View>
              )}
            </Card>

            {/* Khối cơ cấu cổng */}
            <Card
              title="Cổng thanh toán"
              subtitle="Doanh thu ghi nhận qua các kênh"
              className="lg:col-span-1"
            >
              {methodChartData.length > 0 ? (
                <DonutChart
                  data={methodChartData}
                  centerSublabel="Tổng cổng"
                  size={150}
                  strokeWidth={20}
                />
              ) : (
                <View className="py-8 items-center justify-center">
                  <Text className="text-xs text-brand-textMuted">Chưa có dữ liệu cổng</Text>
                </View>
              )}
            </Card>

            {/* Khối Khách hàng nổi bật */}
            <Card
              title="Khách hàng nổi bật"
              subtitle="Top khách hàng chi tiêu nhiều nhất"
              className="lg:col-span-1"
            >
              <View className="gap-2.5">
                {(revenueData?.topBuyers || []).slice(0, 6).map((buyer, idx) => (
                  <View
                    key={buyer.userId || idx}
                    className="flex-row items-center justify-between py-1.5 border-b border-brand-line/10 gap-2"
                  >
                    <View className="flex-row items-center gap-2 flex-1 min-w-0">
                      <View className="w-6 h-6 rounded-full bg-brand-surfaceStrong items-center justify-center">
                        <Text className="text-[10px] font-bold text-brand-primary">
                          {idx + 1}
                        </Text>
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text className="text-xs font-bold text-brand-text truncate" numberOfLines={1}>
                          {buyer.fullName || 'Khách hàng'}
                        </Text>
                        <Text className="text-[10px] text-brand-textMuted truncate" numberOfLines={1}>
                          {buyer.email}
                        </Text>
                      </View>
                    </View>
                    <View className="items-end shrink-0">
                      <Text className="text-xs font-bold text-brand-primary">
                        {formatVND(buyer.revenue)}
                      </Text>
                      <Text className="text-[10px] text-brand-textMuted">
                        {buyer.orders} đơn
                      </Text>
                    </View>
                  </View>
                ))}
                {(!revenueData?.topBuyers || revenueData.topBuyers.length === 0) && (
                  <Text className="text-xs text-brand-textMuted text-center py-6">
                    Chưa có danh sách khách hàng trong kỳ này.
                  </Text>
                )}
              </View>
            </Card>
          </View>

          {/* 5. Bảng Quản Lý Giao Dịch */}
          <Card
            title="Nhật ký giao dịch chi tiết"
            subtitle={`Tổng theo bộ lọc: ${ordersData?.summary?.orders ?? 0} giao dịch • ${formatVND(ordersData?.summary?.revenue ?? 0)}`}
          >
            {/* Filter toolbar */}
            <View className="gap-3 pb-3">
              <View className="flex-row items-center justify-between flex-wrap gap-3">
                {/* Search input */}
                <View className="w-full md:w-72">
                  <SearchInput
                    value={searchQuery}
                    onChangeText={(val) => {
                      setSearchQuery(val);
                      setPage(1);
                    }}
                    placeholder="Tìm theo mã đơn, email, họ tên..."
                  />
                </View>

                {/* Show all status switch */}
                <View className="flex-row items-center gap-2">
                  <Switch
                    value={showAllStatus}
                    onValueChange={(val) => {
                      setShowAllStatus(val);
                      setPage(1);
                    }}
                    label="Hiện cả giao dịch chưa hoàn tất"
                  />
                </View>
              </View>

              {/* Filter chips by method and plan */}
              <View className="flex-row flex-wrap items-center gap-3 pt-1">
                <View className="flex-row items-center gap-1.5 flex-1 min-w-[280px]">
                  <Text className="text-[11px] font-bold text-brand-textMuted uppercase shrink-0">
                    Cổng:
                  </Text>
                  <FilterChips
                    size="sm"
                    options={methodOptions}
                    value={selectedMethod}
                    onChange={(val) => {
                      setSelectedMethod(val as any);
                      setPage(1);
                    }}
                  />
                </View>

                <View className="flex-row items-center gap-1.5 flex-1 min-w-[280px]">
                  <Text className="text-[11px] font-bold text-brand-textMuted uppercase shrink-0">
                    Gói:
                  </Text>
                  <FilterChips
                    size="sm"
                    options={planOptions}
                    value={selectedPlan}
                    onChange={(val) => {
                      setSelectedPlan(val);
                      setPage(1);
                    }}
                  />
                </View>
              </View>
            </View>

            {/* Table */}
            <DataTable
              columns={columns}
              data={ordersData?.items || []}
              keyExtractor={(row) => row.id}
              loading={ordersLoading}
              emptyTitle="Không tìm thấy đơn hàng"
              emptyMessage="Không có giao dịch nào phù hợp với bộ lọc hiện tại."
              minWidth={850}
            />

            {/* Pagination */}
            {ordersData && ordersData.total > 0 && (
              <Pagination
                page={page}
                totalPages={Math.ceil(ordersData.total / ordersData.limit)}
                totalItems={ordersData.total}
                limit={ordersData.limit}
                onPageChange={setPage}
                disabled={ordersLoading}
              />
            )}
          </Card>
        </>
      )}

      {/* 6. Confirm Dialog Kích Hoạt Thủ Công */}
      <ConfirmDialog
        visible={Boolean(activatingOrder)}
        title="Kích hoạt đơn hàng thủ công?"
        message={`Bạn có chắc chắn muốn kích hoạt đơn hàng #${activatingOrder?.orderCode || activatingOrder?.id} của khách hàng ${activatingOrder?.email}? Gói "${activatingOrder?.planLabel || activatingOrder?.plan}" sẽ được cấp ngay cho người dùng.`}
        confirmText="Kích hoạt ngay"
        cancelText="Đóng"
        loading={activateMutation.isPending}
        onConfirm={handleConfirmActivate}
        onCancel={() => setActivatingOrder(null)}
      />
    </ScrollView>
  );
}
