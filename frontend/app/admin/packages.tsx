import { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { BRAND_COLORS } from '../../constants';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import AdminNav from '../../components/admin/AdminNav';

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

  if (!isAdmin) return null;

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
        
        {/* Prices Config */}
        <View className="gap-6">
          <View className="p-5 rounded-2xl border border-brand-line/40 bg-brand-bgAlt/30 gap-1">
            <Text className="font-bold text-base text-brand-text">⚙️ Cấu hình bảng giá gói cước</Text>
            <Text className="text-xs text-brand-textSoft">Admin thay đổi giá trị tại đây, giá trên Landing page và trang thanh toán của người dùng sẽ lập tức thay đổi đồng bộ.</Text>
          </View>

          <View className="flex-row flex-wrap gap-6">
            <View className="p-6 rounded-2xl border border-brand-line/40 bg-white flex-1" style={{ minWidth: 280 }}>
              <View className="flex-row justify-between items-center mb-4">
                <Text className="font-bold text-lg text-brand-text">Gói Starter</Text>
                <View className="px-2 py-0.5 rounded bg-orange-100">
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
                </View>
                <Pressable
                  onPress={() => updatePlansMutation.mutate({ starter: { amount: Number(starterPrice), label: 'Gói Starter', duration_days: 30 } })}
                  className="p-3 items-center rounded-lg mt-2"
                  style={{ backgroundColor: BRAND_COLORS.primary }}
                >
                  <Text className="text-white font-bold text-xs">Cập nhật giá Starter</Text>
                </Pressable>
              </View>
            </View>

            <View className="p-6 rounded-2xl border border-brand-line/40 bg-white flex-1" style={{ minWidth: 280 }}>
              <View className="flex-row justify-between items-center mb-4">
                <Text className="font-bold text-lg text-brand-text">Gói Premium</Text>
                <View className="px-2 py-0.5 rounded bg-yellow-100">
                  <Text className="text-[10px] font-bold text-yellow-700">Premium Full chức năng</Text>
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
                </View>
                <Pressable
                  onPress={() => updatePlansMutation.mutate({ premium: { amount: Number(premiumPrice), label: 'Gói Premium', duration_days: 30 } })}
                  className="p-3 items-center rounded-lg mt-2"
                  style={{ backgroundColor: '#D4A017' }}
                >
                  <Text className="text-white font-bold text-xs">Cập nhật giá Premium</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        {/* Packages Management */}
        <View className="rounded-2xl border border-brand-line/40 overflow-hidden bg-brand-bgAlt/30 mt-6">
          <TableHeader cols={['Tên / Email', 'Gói hiện tại', 'Số chuyến đi đã tạo', 'Thao tác Admin']} />
          {pkgsLoading ? (
            <View className="py-12 items-center gap-2">
              <ActivityIndicator color={BRAND_COLORS.primary} />
              <Text className="text-xs text-brand-textSoft">Đang tải dữ liệu gói cước...</Text>
            </View>
          ) : !userPackages?.length ? (
            <Text className="text-center py-12 text-brand-textSoft text-sm">Chưa có dữ liệu thành viên.</Text>
          ) : userPackages.map((u: any) => (
            <View key={u.id} className="flex-row items-center px-4 py-4 border-b border-brand-line/20 gap-2">
              <View className="flex-1 gap-0.5">
                <Text className="font-bold text-sm text-brand-text" numberOfLines={1}>{u.full_name || 'Thành viên'}</Text>
                <Text className="text-[11px] text-brand-textSoft" numberOfLines={1}>{u.email}</Text>
              </View>

              <View className="w-40 items-center">
                <View className="px-3 py-1 rounded-full" style={{ backgroundColor: u.is_premium ? '#e8f5f0' : '#f0ebe0' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: u.is_premium ? BRAND_COLORS.primary : '#555' }}>
                    {u.plan_name}
                  </Text>
                </View>
              </View>

              <View className="w-32 items-center">
                <Text className="font-bold text-sm text-brand-text">
                  {u.trips_used} chuyến đi
                </Text>
              </View>

              <View className="flex-row items-center gap-2">
                {!u.is_premium ? (
                  <>
                    <Pressable
                      onPress={() => updatePackageMutation.mutate({ userId: u.id, is_premium: true, plan: 'starter' })}
                      style={{ backgroundColor: '#E2703A', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
                    >
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>+ Gói Starter</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => updatePackageMutation.mutate({ userId: u.id, is_premium: true, plan: 'premium' })}
                      style={{ backgroundColor: '#D4A017', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
                    >
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>+ Gói Premium</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    onPress={() => updatePackageMutation.mutate({ userId: u.id, is_premium: false })}
                    style={{ backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                  >
                    <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '700' }}>Hạ xuống Free</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
