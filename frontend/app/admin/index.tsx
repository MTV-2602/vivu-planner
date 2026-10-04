import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import {
  TrendingUp,
  Users,
  CreditCard,
  Crown,
  MapPin,
  Sparkles,
  RefreshCw,
  Key,
  Handshake,
  AlertTriangle,
} from 'lucide-react-native';
import { BRAND_COLORS } from '../../constants';
import {
  PageHeader,
  RangeSelector,
  AdminRange,
  StatCard,
  Card,
  Button,
  ErrorState,
  AreaChart,
  DonutChart,
  BarChart,
  formatVND,
  formatCompactNumber,
  formatPercentChange,
} from '../../components/admin/ui';
import { useAdminOverview } from '../../lib/adminApi';

const PLAN_PALETTE = ['#1F6F54', '#E2703A', '#F0B255', '#3B82F6', '#8B5CF6', '#10B981'];

export default function AdminOverviewPage() {
  const [range, setRange] = useState<AdminRange>('30d');
  const [secondaryMetric, setSecondaryMetric] = useState<'none' | 'users' | 'trips'>('users');

  const {
    data,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useAdminOverview(range);

  // Computed deltas
  const revenueDelta = useMemo(() => {
    if (!data?.kpis?.revenue) return undefined;
    return formatPercentChange(data.kpis.revenue.value, data.kpis.revenue.prev);
  }, [data]);

  const usersDelta = useMemo(() => {
    if (!data?.kpis?.users) return undefined;
    return formatPercentChange(data.kpis.users.new, data.kpis.users.prevNew);
  }, [data]);

  const tripsDelta = useMemo(() => {
    if (!data?.kpis?.trips) return undefined;
    return formatPercentChange(data.kpis.trips.new, data.kpis.trips.prevNew);
  }, [data]);

  // Series data for AreaChart
  const chartData = useMemo(() => {
    if (!data?.series) return [];
    return data.series.map((s) => ({
      date: s.date,
      value: s.revenue,
      secondaryValue:
        secondaryMetric === 'users'
          ? s.newUsers
          : secondaryMetric === 'trips'
          ? s.newTrips
          : undefined,
    }));
  }, [data?.series, secondaryMetric]);

  // Breakdown by plan for DonutChart
  const planChartData = useMemo(() => {
    if (!data?.plans || data.plans.length === 0) return [];
    return data.plans.map((p, idx) => ({
      label: p.label,
      value: p.revenue,
      color: PLAN_PALETTE[idx % PLAN_PALETTE.length],
      subtext: `${p.orders} đơn`,
    }));
  }, [data?.plans]);

  // Breakdown by method for BarChart
  const methodChartData = useMemo(() => {
    if (!data?.methods || data.methods.length === 0) return [];
    const getMethodLabel = (m: string) => {
      const lower = m.toLowerCase();
      if (lower === 'payos') return 'QR ngân hàng (PayOS)';
      if (lower === 'momo') return 'Ví MoMo';
      if (lower === 'admin') return 'Admin tặng';
      return m.toUpperCase();
    };

    return data.methods.map((m, idx) => ({
      label: getMethodLabel(m.method),
      value: m.revenue,
      color: m.method === 'momo' ? '#A50064' : PLAN_PALETTE[idx % PLAN_PALETTE.length],
      sublabel: `${m.orders} GD`,
    }));
  }, [data?.methods]);

  return (
    <ScrollView
      className="flex-1 bg-brand-bg"
      contentContainerStyle={{ padding: 24, gap: 24 }}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Page Header */}
      <PageHeader
        title="Tổng quan hệ thống"
        description="Thống kê hiệu quả doanh thu, người dùng và hoạt động thời gian thực"
        action={
          <View className="flex-row items-center gap-2">
            <RangeSelector value={range} onChange={setRange} />
            <Button
              variant="outline"
              size="sm"
              loading={isRefetching}
              icon={<RefreshCw size={13} color={BRAND_COLORS.textSoft} />}
              onPress={() => refetch()}
            />
          </View>
        }
      />

      {/* Error State */}
      {error && !data ? (
        <ErrorState
          title="Không thể kết nối API Tổng quan"
          message="Endpoint GET /admin/overview chưa sẵn sàng trên backend hoặc gặp lỗi kết nối. Bấm Thử lại sau khi backend khởi chạy xong."
          onRetry={() => refetch()}
        />
      ) : (
        <>
          {/* 2. KPI Cards Row (Tối đa 6 thẻ gọn gàng) */}
          <View className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* 1. Doanh thu */}
            <StatCard
              label="Doanh thu"
              value={isLoading ? '...' : formatVND(data?.kpis?.revenue?.value ?? 0)}
              delta={revenueDelta}
              subtext="kỳ này"
              icon={<TrendingUp size={18} color={BRAND_COLORS.primary} />}
              iconBg="rgba(31, 111, 84, 0.1)"
              loading={isLoading}
            />

            {/* 2. Người dùng mới */}
            <StatCard
              label="Người dùng mới"
              value={isLoading ? '...' : formatCompactNumber(data?.kpis?.users?.new ?? 0)}
              delta={usersDelta}
              subtext={`Tổng ${formatCompactNumber(data?.kpis?.users?.total ?? 0)}`}
              icon={<Users size={18} color="#2563EB" />}
              iconBg="rgba(37, 99, 235, 0.1)"
              loading={isLoading}
            />

            {/* 3. Khách trả tiền */}
            <StatCard
              label="Khách trả tiền"
              value={isLoading ? '...' : formatCompactNumber(data?.kpis?.paidUsers?.newInRange ?? 0)}
              subtext={`Tổng ${formatCompactNumber(data?.kpis?.paidUsers?.total ?? 0)}`}
              icon={<CreditCard size={18} color="#D97706" />}
              iconBg="rgba(217, 119, 6, 0.1)"
              loading={isLoading}
            />

            {/* 4. Còn lượt Pro */}
            <StatCard
              label="Đang có lượt Pro"
              value={isLoading ? '...' : formatCompactNumber(data?.kpis?.proUsers?.withCredits ?? 0)}
              subtext="Tài khoản sẵn sàng"
              icon={<Crown size={18} color="#8B5CF6" />}
              iconBg="rgba(139, 92, 246, 0.1)"
              loading={isLoading}
            />

            {/* 5. Chuyến đi mới */}
            <StatCard
              label="Chuyến đi mới"
              value={isLoading ? '...' : formatCompactNumber(data?.kpis?.trips?.new ?? 0)}
              delta={tripsDelta}
              subtext={`${data?.kpis?.trips?.proNew ?? 0} chuyến Pro`}
              icon={<MapPin size={18} color={BRAND_COLORS.accent} />}
              iconBg="rgba(226, 112, 58, 0.1)"
              loading={isLoading}
            />

            {/* 6. Lượt Pro chưa dùng */}
            <StatCard
              label="Lượt Pro chưa dùng"
              value={isLoading ? '...' : formatCompactNumber(data?.kpis?.creditsOutstanding ?? 0)}
              subtext="Trong ví người dùng"
              icon={<Sparkles size={18} color="#10B981" />}
              iconBg="rgba(16, 185, 129, 0.1)"
              loading={isLoading}
            />
          </View>

          {/* 3. Main Chart: Doanh thu theo thời gian */}
          <Card
            title="Xu hướng doanh thu theo thời gian"
            subtitle={`Chu kỳ thống kê: ${data?.bucket === 'month' ? 'theo tháng' : 'theo ngày'}`}
            action={
              <View className="flex-row items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                <Button
                  variant={secondaryMetric === 'users' ? 'primary' : 'ghost'}
                  size="sm"
                  label="+ Người dùng"
                  onPress={() =>
                    setSecondaryMetric(secondaryMetric === 'users' ? 'none' : 'users')
                  }
                />
                <Button
                  variant={secondaryMetric === 'trips' ? 'primary' : 'ghost'}
                  size="sm"
                  label="+ Chuyến đi"
                  onPress={() =>
                    setSecondaryMetric(secondaryMetric === 'trips' ? 'none' : 'trips')
                  }
                />
              </View>
            }
          >
            <View className="py-2">
              <AreaChart
                data={chartData}
                height={260}
                seriesName="Doanh thu"
                showSecondary={secondaryMetric !== 'none'}
                secondarySeriesName={
                  secondaryMetric === 'users'
                    ? 'Người dùng mới'
                    : 'Chuyến đi mới'
                }
              />
            </View>
          </Card>

          {/* 4. Two Breakdown Blocks: Cơ cấu gói & Cơ cấu phương thức */}
          <View className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Cơ cấu theo gói */}
            <Card
              title="Cơ cấu doanh thu theo gói"
              subtitle="Tỷ trọng doanh số từng gói cước thành viên"
            >
              {planChartData.length > 0 ? (
                <DonutChart
                  data={planChartData}
                  centerSublabel="Tổng doanh thu"
                />
              ) : (
                <View className="py-8 items-center justify-center">
                  <Text className="text-xs text-brand-textMuted">
                    Chưa có số liệu phát sinh gói trong khoảng thời gian này
                  </Text>
                </View>
              )}
            </Card>

            {/* Cơ cấu theo phương thức */}
            <Card
              title="Cơ cấu theo cổng thanh toán"
              subtitle="Doanh thu ghi nhận qua từng phương thức thanh toán"
            >
              {methodChartData.length > 0 ? (
                <View className="py-2 gap-4">
                  <BarChart
                    horizontal
                    data={methodChartData}
                  />
                  {/* Chú thích mờ: Gói tặng bởi admin */}
                  <View className="pt-2 border-t border-brand-line/10">
                    <Text className="text-xs text-brand-textMuted italic">
                      ℹ️ Gói tặng bởi admin: {data?.adminGrants?.count ?? 0} lượt (trị giá {formatVND(data?.adminGrants?.value ?? 0)}) • Không tính vào doanh thu.
                    </Text>
                  </View>
                </View>
              ) : (
                <View className="py-8 items-center justify-center">
                  <Text className="text-xs text-brand-textMuted">
                    Chưa có giao dịch phát sinh qua cổng thanh toán
                  </Text>
                </View>
              )}
            </Card>
          </View>

          {/* 5. Khối "Hệ thống" */}
          <Card title="Trạng thái tài nguyên & Hệ thống">
            <View className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <View className="p-3.5 rounded-xl border border-brand-line/20 bg-slate-50 flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-xl bg-blue-100 items-center justify-center">
                  <Key size={18} color="#2563EB" />
                </View>
                <View>
                  <Text className="text-[10px] font-bold text-brand-textMuted uppercase tracking-wider">
                    API Keys đang cấu hình
                  </Text>
                  <Text className="font-display font-bold text-xl text-brand-text mt-0.5">
                    {data?.system?.apiKeys ?? 0}
                  </Text>
                </View>
              </View>

              <View className="p-3.5 rounded-xl border border-brand-line/20 bg-slate-50 flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-xl bg-emerald-100 items-center justify-center">
                  <Handshake size={18} color="#059669" />
                </View>
                <View>
                  <Text className="text-[10px] font-bold text-brand-textMuted uppercase tracking-wider">
                    Đối tác liên kết
                  </Text>
                  <Text className="font-display font-bold text-xl text-brand-text mt-0.5">
                    {data?.system?.partners ?? 0}
                  </Text>
                </View>
              </View>

              <View className="p-3.5 rounded-xl border border-brand-line/20 bg-slate-50 flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-xl bg-amber-100 items-center justify-center">
                  <AlertTriangle size={18} color="#D97706" />
                </View>
                <View>
                  <Text className="text-[10px] font-bold text-brand-textMuted uppercase tracking-wider">
                    Sự cố ghi nhận
                  </Text>
                  <Text className="font-display font-bold text-xl text-brand-text mt-0.5">
                    {data?.system?.disruptions ?? 0}
                  </Text>
                </View>
              </View>
            </View>
          </Card>
        </>
      )}
    </ScrollView>
  );
}
