import { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { BRAND_COLORS } from '../../constants';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import AdminNav from '../../components/admin/AdminNav';

const QUICK_STARTER_PRICES = ['19000', '29000', '39000', '49000'];
const QUICK_PREMIUM_PRICES = ['49000', '69000', '79000', '99000'];

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <View className="flex-row px-4 py-3 border-b border-brand-line/40 bg-brand-bgAlt/60">
      {cols.map((c, i) => (
        <Text key={i} className="flex-1 text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider">{c}</Text>
      ))}
    </View>
  );
}

export default function AdminPackages() {
  const { isAdmin } = useAuth();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [starterPrice, setStarterPrice] = useState('29000');
  const [premiumPrice, setPremiumPrice] = useState('49000');
  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<'all' | 'free' | 'starter' | 'premium'>('all');

  const { data: userPackages, isLoading: pkgsLoading, refetch: refetchPkgs } = useQuery<any[]>({
    queryKey: ['adminUserPackages'],
    queryFn: async () => (await api.get('/admin/user-packages')).data,
    enabled: !!isAdmin,
  });

  const { data: plansData, refetch: refetchPlans } = useQuery<any>({
    queryKey: ['adminPlans'],
    queryFn: async () => (await api.get('/payment/plans')).data,
    enabled: !!isAdmin,
  });

  useEffect(() => {
    if (plansData?.plans) {
      const p = plansData.plans;
      if (p.starter?.amount != null) setStarterPrice(String(p.starter.amount));
      if (p.premium?.amount != null) setPremiumPrice(String(p.premium.amount));
    }
  }, [plansData]);

  const updatePlansMutation = useMutation({
    mutationFn: async (payload: any) => {
      await api.post('/admin/plans', payload);
    },
    onSuccess: () => {
      showToast('Cập nhật cấu hình giá thành công!', 'success');
      refetchPlans();
      try {
        const realtimeChannel = supabase.channel(`pricing_realtime_${Date.now()}`);
        realtimeChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            realtimeChannel.send({
              type: 'broadcast',
              event: 'plans_updated',
              payload: { timestamp: Date.now() },
            }).then(() => {
              supabase.removeChannel(realtimeChannel);
            });
          }
        });
      } catch (e) {}
    },
    onError: (err: any) => showToast('Lỗi cập nhật cấu hình: ' + (err.response?.data?.error || err.message), 'error'),
  });

  const updatePackageMutation = useMutation({
    mutationFn: async ({ userId, is_premium, plan, custom_quota }: { userId: string; is_premium: boolean; plan?: string; custom_quota?: number }) => {
      await api.put(`/admin/users/${userId}/package`, { is_premium, plan, custom_quota });
    },
    onSuccess: () => {
      showToast('Cập nhật gói thành công!', 'success');
      refetchPkgs();
    },
    onError: (err: any) => showToast('Lỗi cập nhật gói: ' + (err.response?.data?.error || err.message), 'error'),
  });

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  // Filter and search logic
  const filteredUsers = useMemo(() => {
    if (!userPackages) return [];
    return userPackages.filter((u: any) => {
      const name = (u.full_name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || name.includes(q) || email.includes(q);

      if (!matchesSearch) return false;

      if (planFilter === 'all') return true;
      if (planFilter === 'free') return !u.is_premium;
      const planName = (u.plan_name || '').toLowerCase();
      if (planFilter === 'starter') return u.is_premium && planName.includes('starter');
      if (planFilter === 'premium') return u.is_premium && (planName.includes('premium') || planName.includes('vip') || planName.includes('pro'));
      return true;
    });
  }, [userPackages, searchQuery, planFilter]);

  // Statistics
  const stats = useMemo(() => {
    if (!userPackages) return { total: 0, starter: 0, premium: 0, free: 0 };
    let starter = 0;
    let premium = 0;
    let free = 0;
    userPackages.forEach((u: any) => {
      if (!u.is_premium) {
        free++;
      } else {
        const p = (u.plan_name || '').toLowerCase();
        if (p.includes('starter')) starter++;
        else premium++;
      }
    });
    return { total: userPackages.length, starter, premium, free };
  }, [userPackages]);

  if (!isAdmin) {
    return (
      <View className="flex-1 bg-brand-bg">
        <AdminNav />
        <View className="flex-1 items-center justify-center py-20 gap-3">
          <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
          <Text className="text-xs font-semibold text-brand-textSoft">Đang tải và xác thực quyền quản trị...</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-brand-bg">
      <AdminNav />
      {toast && (
        <View className="absolute top-20 left-4 right-4 z-50 items-center pointer-events-none">
          <View className="flex-row items-center gap-2 px-4 py-3 rounded-xl shadow-lg border border-brand-line/40 max-w-md w-full bg-white">
            <Text className="text-xs font-bold flex-1" style={{ color: toast.type === 'success' ? BRAND_COLORS.primaryStrong : toast.type === 'error' ? BRAND_COLORS.danger : BRAND_COLORS.accentStrong }}>
              {toast.message}
            </Text>
          </View>
        </View>
      )}

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 24 }}>
        
        {/* Prices Config Header */}
        <View className="gap-6">
          <View className="p-5 rounded-2xl border border-brand-line/40 bg-brand-bgAlt/30 gap-1">
            <Text className="font-bold text-base text-brand-text">⚙️ Cấu hình bảng giá gói cước</Text>
            <Text className="text-xs text-brand-textSoft">Admin thay đổi giá trị tại đây, giá trên Landing page và trang thanh toán của người dùng sẽ lập tức thay đổi đồng bộ theo thời gian thực.</Text>
          </View>

          {/* Pricing Cards */}
          <View className="flex-row flex-wrap gap-6">
            {/* Starter Card */}
            <View className="p-6 rounded-2xl border border-brand-line/40 bg-white flex-1" style={{ minWidth: 280 }}>
              <View className="flex-row justify-between items-center mb-4">
                <Text className="font-bold text-lg text-brand-text">Gói Starter</Text>
                <View className="px-2.5 py-1 rounded-full bg-orange-100">
                  <Text className="text-[10px] font-bold text-orange-700">Tạo chuyến đi không giới hạn</Text>
                </View>
              </View>
              <View className="gap-4">
                <View>
                  <Text className="text-xs text-brand-textSoft mb-1.5">Giá gói hiện tại (VNĐ):</Text>
                  <Text className="font-display font-extrabold text-xl text-brand-primary">
                    {plansData?.plans?.starter?.amount?.toLocaleString('vi-VN') || '29.000'} VNĐ
                  </Text>
                </View>
                <View>
                  <Text className="text-xs font-bold text-brand-text mb-1">Nhập giá mới (VNĐ):</Text>
                  <TextInput
                    value={starterPrice}
                    onChangeText={setStarterPrice}
                    keyboardType="numeric"
                    className="p-3 border border-brand-line rounded-lg text-brand-text font-bold"
                    placeholder="Ví dụ: 29000"
                  />
                  {/* Quick Select Price Chips */}
                  <View className="flex-row items-center gap-1.5 mt-2 flex-wrap">
                    <Text className="text-[10px] text-brand-textSoft mr-1">Mức giá gợi ý:</Text>
                    {QUICK_STARTER_PRICES.map((p) => (
                      <Pressable
                        key={p}
                        onPress={() => setStarterPrice(p)}
                        className="px-2 py-1 rounded-md border"
                        style={{
                          borderColor: starterPrice === p ? '#E2703A' : '#e2e8f0',
                          backgroundColor: starterPrice === p ? '#fff7ed' : '#f8fafc',
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: starterPrice === p ? '#c2410c' : '#64748b' }}>
                          {Number(p).toLocaleString('vi-VN')}đ
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <Pressable
                  onPress={() => updatePlansMutation.mutate({ starter: { amount: Number(starterPrice), label: 'Gói Starter', duration_days: 30 } })}
                  className="p-3 items-center rounded-lg mt-2 shadow-sm"
                  style={{ backgroundColor: '#E2703A' }}
                >
                  <Text className="text-white font-bold text-xs">Cập nhật giá Starter</Text>
                </Pressable>
              </View>
            </View>

            {/* Premium Card */}
            <View className="p-6 rounded-2xl border border-brand-line/40 bg-white flex-1" style={{ minWidth: 280 }}>
              <View className="flex-row justify-between items-center mb-4">
                <Text className="font-bold text-lg text-brand-text">Gói Premium</Text>
                <View className="px-2.5 py-1 rounded-full bg-yellow-100">
                  <Text className="text-[10px] font-bold text-yellow-700">Premium Full tính năng AI</Text>
                </View>
              </View>
              <View className="gap-4">
                <View>
                  <Text className="text-xs text-brand-textSoft mb-1.5">Giá gói hiện tại (VNĐ):</Text>
                  <Text className="font-display font-extrabold text-xl text-brand-primary">
                    {plansData?.plans?.premium?.amount?.toLocaleString('vi-VN') || '49.000'} VNĐ
                  </Text>
                </View>
                <View>
                  <Text className="text-xs font-bold text-brand-text mb-1">Nhập giá mới (VNĐ):</Text>
                  <TextInput
                    value={premiumPrice}
                    onChangeText={setPremiumPrice}
                    keyboardType="numeric"
                    className="p-3 border border-brand-line rounded-lg text-brand-text font-bold"
                    placeholder="Ví dụ: 49000"
                  />
                  {/* Quick Select Price Chips */}
                  <View className="flex-row items-center gap-1.5 mt-2 flex-wrap">
                    <Text className="text-[10px] text-brand-textSoft mr-1">Mức giá gợi ý:</Text>
                    {QUICK_PREMIUM_PRICES.map((p) => (
                      <Pressable
                        key={p}
                        onPress={() => setPremiumPrice(p)}
                        className="px-2 py-1 rounded-md border"
                        style={{
                          borderColor: premiumPrice === p ? '#D4A017' : '#e2e8f0',
                          backgroundColor: premiumPrice === p ? '#fefce8' : '#f8fafc',
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: premiumPrice === p ? '#a16207' : '#64748b' }}>
                          {Number(p).toLocaleString('vi-VN')}đ
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <Pressable
                  onPress={() => updatePlansMutation.mutate({ premium: { amount: Number(premiumPrice), label: 'Gói Premium', duration_days: 30 } })}
                  className="p-3 items-center rounded-lg mt-2 shadow-sm"
                  style={{ backgroundColor: '#D4A017' }}
                >
                  <Text className="text-white font-bold text-xs">Cập nhật giá Premium</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        {/* Packages Management Section */}
        <View className="gap-4 mt-4">
          {/* Quick Stats Banner */}
          <View className="flex-row flex-wrap gap-3">
            <View className="flex-1 min-w-[140px] p-3 rounded-xl bg-white border border-brand-line/40">
              <Text className="text-[10px] font-bold text-brand-textSoft uppercase">Tổng thành viên</Text>
              <Text className="text-lg font-extrabold text-brand-text">{stats.total}</Text>
            </View>
            <View className="flex-1 min-w-[140px] p-3 rounded-xl bg-orange-50/60 border border-orange-200/60">
              <Text className="text-[10px] font-bold text-orange-700 uppercase">Gói Starter</Text>
              <Text className="text-lg font-extrabold text-orange-800">{stats.starter}</Text>
            </View>
            <View className="flex-1 min-w-[140px] p-3 rounded-xl bg-yellow-50/60 border border-yellow-200/60">
              <Text className="text-[10px] font-bold text-yellow-700 uppercase">Gói Premium</Text>
              <Text className="text-lg font-extrabold text-yellow-800">{stats.premium}</Text>
            </View>
            <View className="flex-1 min-w-[140px] p-3 rounded-xl bg-slate-50 border border-slate-200/60">
              <Text className="text-[10px] font-bold text-slate-500 uppercase">Gói Miễn phí</Text>
              <Text className="text-lg font-extrabold text-slate-700">{stats.free}</Text>
            </View>
          </View>

          {/* Search & Filters */}
          <View className="flex-row flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-white border border-brand-line/40">
            <View className="flex-row items-center gap-2 flex-1 min-w-[260px]">
              <Text className="text-sm">🔍</Text>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Tìm thành viên theo họ tên, email..."
                className="flex-1 py-1 px-2 text-xs text-brand-text font-medium"
              />
              {!!searchQuery && (
                <Pressable onPress={() => setSearchQuery('')} className="p-1">
                  <Text className="text-xs text-brand-textSoft font-bold">✕</Text>
                </Pressable>
              )}
            </View>

            {/* Filter Buttons */}
            <View className="flex-row items-center gap-1.5 flex-wrap">
              {[
                { key: 'all', label: 'Tất cả' },
                { key: 'free', label: 'Free' },
                { key: 'starter', label: 'Starter' },
                { key: 'premium', label: 'Premium' },
              ].map((f) => (
                <Pressable
                  key={f.key}
                  onPress={() => setPlanFilter(f.key as any)}
                  className="px-3 py-1.5 rounded-lg border"
                  style={{
                    backgroundColor: planFilter === f.key ? BRAND_COLORS.primary : '#f8fafc',
                    borderColor: planFilter === f.key ? BRAND_COLORS.primary : '#e2e8f0',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: planFilter === f.key ? '#fff' : '#475569',
                    }}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Table */}
          <View className="rounded-2xl border border-brand-line/40 overflow-hidden bg-white shadow-sm">
            <TableHeader cols={['Tên / Email', 'Gói hiện tại', 'Số chuyến đi', 'Thao tác Admin']} />
            {pkgsLoading ? (
              <View className="py-12 items-center gap-2">
                <ActivityIndicator color={BRAND_COLORS.primary} />
                <Text className="text-xs text-brand-textSoft">Đang tải dữ liệu gói cước...</Text>
              </View>
            ) : !filteredUsers?.length ? (
              <Text className="text-center py-12 text-brand-textSoft text-sm">
                {searchQuery || planFilter !== 'all' ? 'Không tìm thấy thành viên phù hợp bộ lọc.' : 'Chưa có dữ liệu thành viên.'}
              </Text>
            ) : (
              filteredUsers.map((u: any) => {
                const isPremium = !!u.is_premium;
                const isStarter = isPremium && (u.plan_name || '').toLowerCase().includes('starter');
                const isVip = isPremium && !isStarter;

                return (
                  <View key={u.id} className="flex-row items-center px-4 py-3.5 border-b border-brand-line/20 gap-2">
                    <View className="flex-1 gap-0.5">
                      <Text className="font-bold text-sm text-brand-text" numberOfLines={1}>{u.full_name || 'Thành viên'}</Text>
                      <Text className="text-[11px] text-brand-textSoft" numberOfLines={1}>{u.email}</Text>
                    </View>

                    <View className="w-36 items-center">
                      <View
                        className="px-2.5 py-1 rounded-full border"
                        style={{
                          backgroundColor: isVip ? '#fefce8' : isStarter ? '#fff7ed' : '#f1f5f9',
                          borderColor: isVip ? '#fde047' : isStarter ? '#fdba74' : '#cbd5e1',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '800',
                            color: isVip ? '#a16207' : isStarter ? '#c2410c' : '#475569',
                          }}
                        >
                          {u.plan_name || (isPremium ? 'Premium' : 'Gói Miễn phí')}
                        </Text>
                      </View>
                    </View>

                    <View className="w-28 items-center">
                      <Text className="font-bold text-xs text-brand-text">
                        {u.trips_used ?? 0} chuyến
                      </Text>
                    </View>

                    {/* Flexible Action Buttons */}
                    <View className="flex-row items-center gap-1.5">
                      {/* Button Starter */}
                      <Pressable
                        onPress={() => updatePackageMutation.mutate({ userId: u.id, is_premium: true, plan: 'starter' })}
                        className="px-2.5 py-1 rounded-md border"
                        style={{
                          backgroundColor: isStarter ? '#ffedd5' : '#fff',
                          borderColor: isStarter ? '#f97316' : '#e2e8f0',
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: isStarter ? '#ea580c' : '#64748b' }}>
                          {isStarter ? '✓ Starter' : '+ Starter'}
                        </Text>
                      </Pressable>

                      {/* Button Premium */}
                      <Pressable
                        onPress={() => updatePackageMutation.mutate({ userId: u.id, is_premium: true, plan: 'premium' })}
                        className="px-2.5 py-1 rounded-md border"
                        style={{
                          backgroundColor: isVip ? '#fef9c3' : '#fff',
                          borderColor: isVip ? '#eab308' : '#e2e8f0',
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: isVip ? '#ca8a04' : '#64748b' }}>
                          {isVip ? '👑 Premium' : '+ Premium'}
                        </Text>
                      </Pressable>

                      {/* Downgrade to Free */}
                      {isPremium && (
                        <Pressable
                          onPress={() => updatePackageMutation.mutate({ userId: u.id, is_premium: false })}
                          className="px-2 py-1 rounded-md bg-rose-50 border border-rose-200"
                        >
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#e11d48' }}>
                            Hạ Free
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
