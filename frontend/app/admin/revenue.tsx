import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { BRAND_COLORS } from '../../constants';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import AdminNav from '../../components/admin/AdminNav';

function formatDate(s: string) {
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <View className="flex-row px-4 py-3 border-b border-brand-line/40 bg-brand-bgAlt/60">
      {cols.map((c, i) => (
        <Text key={i} className="flex-1 text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider">{c}</Text>
      ))}
    </View>
  );
}

export default function AdminRevenue() {
  const { isAdmin } = useAuth();

  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ['adminRevenue'],
    queryFn: async () => {
      const res = await api.get('/admin/revenue');
      return res.data;
    },
    enabled: !!isAdmin,
  });

  if (!isAdmin) return null;

  return (
    <View className="flex-1 bg-brand-bg">
      <AdminNav />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 24 }}>
        <View className="gap-6">
          <View className="flex-row flex-wrap gap-4">
            <View className="p-5 rounded-2xl border border-brand-line/40 flex-1 bg-brand-bgAlt/40" style={{ minWidth: 200 }}>
              <Text className="text-[11px] font-bold text-brand-textSoft uppercase tracking-wider">💰 Tổng doanh thu</Text>
              <Text className="font-display font-bold text-2xl text-brand-primary mt-1">
                {revenueLoading ? '...' : `${(revenueData?.totalRevenue || 0).toLocaleString('vi-VN')}đ`}
              </Text>
              <Text className="text-[10px] text-brand-textMuted mt-1">Giao dịch đã thanh toán thành công</Text>
            </View>

            <View className="p-5 rounded-2xl border border-brand-line/40 flex-1 bg-brand-bgAlt/40" style={{ minWidth: 200 }}>
              <Text className="text-[11px] font-bold text-brand-textSoft uppercase tracking-wider">📅 Doanh thu tháng này</Text>
              <Text className="font-display font-bold text-2xl text-brand-accent mt-1">
                {revenueLoading ? '...' : `${(revenueData?.monthlyRevenue || 0).toLocaleString('vi-VN')}đ`}
              </Text>
              <Text className="text-[10px] text-brand-textMuted mt-1">Cập nhật tháng hiện tại</Text>
            </View>

            <View className="p-5 rounded-2xl border border-brand-line/40 flex-1 bg-brand-bgAlt/40" style={{ minWidth: 200 }}>
              <Text className="text-[11px] font-bold text-brand-textSoft uppercase tracking-wider">💳 Tổng đơn hàng</Text>
              <Text className="font-display font-bold text-2xl text-brand-text mt-1">
                {revenueLoading ? '...' : `${revenueData?.completedOrdersCount || 0} / ${revenueData?.totalOrders || 0}`}
              </Text>
              <Text className="text-[10px] text-brand-textMuted mt-1">Tỷ lệ chuyển đổi: {revenueData?.conversionRate || 0}%</Text>
            </View>
          </View>

          <View className="p-5 rounded-2xl border border-brand-line/40 bg-brand-bgAlt/30 gap-3">
            <Text className="font-bold text-base text-brand-text">👑 Phân tích doanh thu theo gói Pro</Text>
            <View className="flex-row flex-wrap gap-4">
              {Object.entries(revenueData?.planStats || {}).map(([key, stat]: [string, any]) => (
                <View key={key} className="p-4 rounded-xl border border-brand-line/30 flex-1 bg-white" style={{ minWidth: 160 }}>
                  <Text className="font-bold text-xs text-brand-text">{stat.label}</Text>
                  <Text className="text-lg font-bold text-brand-primary mt-1">{(stat.revenue || 0).toLocaleString('vi-VN')}đ</Text>
                  <Text className="text-[11px] text-brand-textSoft mt-0.5">{stat.count || 0} đơn thành công</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="rounded-2xl border border-brand-line/40 overflow-hidden bg-brand-bgAlt/30">
            <TableHeader cols={['Mã đơn', 'Phương thức', 'Gói', 'Số tiền', 'Trạng thái', 'Thời gian']} />
            {revenueLoading ? (
              <View className="py-12 items-center gap-2">
                <ActivityIndicator color={BRAND_COLORS.primary} />
                <Text className="text-xs text-brand-textSoft">Đang tải báo cáo doanh thu...</Text>
              </View>
            ) : !revenueData?.recentOrders?.length ? (
              <Text className="text-center py-12 text-brand-textSoft text-sm">Chưa có giao dịch thanh toán nào phát sinh.</Text>
            ) : (
              revenueData.recentOrders.map((o: any) => (
                <View key={o.id} className="flex-row items-center px-4 py-3.5 border-b border-brand-line/20 gap-2">
                  <Text className="flex-1 text-xs font-mono font-bold text-brand-text" numberOfLines={1}>{o.id}</Text>
                  <Text className="flex-1 text-xs text-brand-textMuted uppercase font-bold">{o.method}</Text>
                  {(() => {
                    const PLAN_LABELS: Record<string, string> = {
                      plus: 'Gói Starter (29.000đ)',
                      starter: 'Gói Starter (29.000đ)',
                      pro: 'Gói Premium (49.000đ)',
                      monthly: 'Gói Premium (49.000đ)',
                      premium: 'Gói Premium (49.000đ)',
                      vip: 'Gói VIP (99.000đ)',
                      yearly: 'Gói VIP (99.000đ)',
                    };
                    return (
                      <Text className="flex-1 text-xs text-brand-textSoft font-semibold">
                        {PLAN_LABELS[o.plan] || o.plan}
                      </Text>
                    );
                  })()}
                  <Text className="flex-1 text-xs font-bold text-brand-primary">{(Number(o.amount) || 0).toLocaleString('vi-VN')}đ</Text>
                  <View className="flex-1">
                    <View className="px-2.5 py-1 rounded-full align-self-start" style={{
                      backgroundColor: o.status === 'completed' || o.status === 'success' ? '#e8f5f0' : o.status === 'pending' ? '#fef9c3' : '#fee2e2'
                    }}>
                      <Text style={{
                        fontSize: 10, fontWeight: '800',
                        color: o.status === 'completed' || o.status === 'success' ? BRAND_COLORS.primary : o.status === 'pending' ? '#854d0e' : '#991b1b'
                      }}>
                        {o.status === 'completed' || o.status === 'success' ? '✅ Thành công' : o.status === 'pending' ? '⏳ Đang chờ' : '❌ Đã hủy'}
                      </Text>
                    </View>
                  </View>
                  <Text className="flex-1 text-[11px] text-brand-textMuted">{formatDate(o.created_at)}</Text>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
