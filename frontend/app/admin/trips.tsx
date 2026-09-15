import { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Trash2, MapPin, Calendar, Wallet, ChevronRight, AlertTriangle } from 'lucide-react-native';
import { BRAND_COLORS, APP_ROUTES } from '../../constants';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import AdminNav from '../../components/admin/AdminNav';
import { cancelTripReminder } from '../../lib/notifications';
import { clearCache } from '../../lib/cache';

interface TripRecord { id: string; title: string; destination_city: string; start_date: string; end_date: string; budget_total: number; status: string; user_email: string; created_at: string; }

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

export default function AdminTrips() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ visible: boolean; title: string; message: string; onConfirm: () => void; confirmText?: string; cancelText?: string; isDestructive?: boolean } | null>(null);

  const { data: trips, isLoading: tripsLoading } = useQuery<TripRecord[]>({
    queryKey: ['adminTrips'],
    queryFn: async () => (await api.get('/admin/trips')).data,
    enabled: !!isAdmin,
  });

  const deleteTrip = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/trips/${id}`),
    onSuccess: (_, tripId) => {
      cancelTripReminder(tripId);
      clearCache(`trip_${tripId}`);
      qc.invalidateQueries({ queryKey: ['adminTrips'] });
      showToast('Đã xóa chuyến đi và toàn bộ lịch trình liên quan!', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
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

  const showConfirm = (title: string, message: string, onConfirm: () => void, options?: { confirmText?: string; cancelText?: string; isDestructive?: boolean }) => {
    setConfirmModal({ visible: true, title, message, onConfirm: () => { onConfirm(); setConfirmModal(null); }, confirmText: options?.confirmText || 'Xác nhận', cancelText: options?.cancelText || 'Hủy', isDestructive: options?.isDestructive ?? false });
  };

  const confirmDeleteTrip = (id: string, title: string) => {
    showConfirm(
      'Xác nhận xóa chuyến đi',
      `Bạn có chắc chắn muốn xóa chuyến đi "${title}"? Toàn bộ các ngày lịch trình, hoạt động chi tiết, dữ liệu chi tiêu và sự cố liên quan sẽ bị XÓA SẠCH khỏi hệ thống!`,
      () => deleteTrip.mutate(id),
      { confirmText: 'Xóa sạch', cancelText: 'Hủy', isDestructive: true }
    );
  };

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
        <View className="rounded-2xl border border-brand-line/40 overflow-hidden bg-brand-bgAlt/30">
          <TableHeader cols={['Chuyến đi', 'Chủ sở hữu', 'Ngân sách', 'Trạng thái', '']} />
          {tripsLoading ? (
            <View className="py-12 items-center gap-2">
              <ActivityIndicator color={BRAND_COLORS.primary} />
              <Text className="text-xs text-brand-textSoft">Đang tải danh sách chuyến đi...</Text>
            </View>
          ) : !trips?.length ? (
            <Text className="text-center py-12 text-brand-textSoft text-sm">Chưa có chuyến đi nào.</Text>
          ) : trips.map(t => {
            const statusMeta = t.status === 'completed'
              ? { label: 'Hoàn thành', bg: `${BRAND_COLORS.textSoft}20`, color: BRAND_COLORS.textSoft }
              : t.status === 'active'
              ? { label: 'Hoạt động', bg: `${BRAND_COLORS.primary}1A`, color: BRAND_COLORS.primary }
              : { label: 'Bản nháp', bg: `${BRAND_COLORS.gold}20`, color: BRAND_COLORS.primaryStrong };
            return (
              <View key={t.id} className="px-4 py-4 border-b border-brand-line/20 gap-2">
                <View className="flex-row justify-between items-start gap-2">
                  <View className="flex-1 gap-1">
                    <Text className="font-bold text-sm text-brand-text" numberOfLines={1}>{t.title}</Text>
                    <View className="flex-row flex-wrap gap-3">
                      <View className="flex-row items-center gap-1">
                        <MapPin size={11} color={BRAND_COLORS.primary} />
                        <Text className="text-[11px] text-brand-textSoft">{t.destination_city}</Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <Calendar size={11} color={BRAND_COLORS.primary} />
                        <Text className="text-[11px] text-brand-textSoft">{formatDate(t.start_date)} - {formatDate(t.end_date)}</Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <Wallet size={11} color={BRAND_COLORS.primary} />
                        <Text className="text-[11px] text-brand-textSoft">{new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND'}).format(t.budget_total)}</Text>
                      </View>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <View className="px-2 py-0.5 rounded" style={{ backgroundColor: statusMeta.bg }}>
                      <Text className="text-[10px] font-bold uppercase" style={{ color: statusMeta.color }}>{statusMeta.label}</Text>
                    </View>
                    <Pressable onPress={() => router.push(APP_ROUTES.TRIP_DETAIL(t.id) as any)} className="p-2 rounded-lg" style={{ backgroundColor: `${BRAND_COLORS.primary}1A` }}>
                      <ChevronRight size={14} color={BRAND_COLORS.primary} />
                    </Pressable>
                    <Pressable onPress={() => confirmDeleteTrip(t.id, t.title)} className="p-2 rounded-lg" style={{ backgroundColor: `${BRAND_COLORS.danger}1A` }}>
                      <Trash2 size={14} color={BRAND_COLORS.danger} />
                    </Pressable>
                  </View>
                </View>
                <Text className="text-[11px] text-brand-textSoft">Chủ sở hữu: <Text className="font-semibold">{t.user_email}</Text></Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {confirmModal && confirmModal.visible && (
        <View className="absolute inset-0 z-50 items-center justify-center bg-black/60 px-4">
          <View className="bg-brand-bg border border-brand-line/60 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <View className="flex-row items-center gap-2 mb-3">
              <AlertTriangle size={22} color={confirmModal.isDestructive ? BRAND_COLORS.danger : BRAND_COLORS.accent} />
              <Text className="text-lg font-display font-extrabold text-brand-text">{confirmModal.title}</Text>
            </View>
            <Text className="text-xs text-brand-textSoft leading-relaxed mb-6">{confirmModal.message}</Text>
            <View className="flex-row justify-end gap-3">
              <Pressable onPress={() => setConfirmModal(null)} className="px-4 py-2.5 rounded-xl border border-brand-line/60 bg-brand-bgAlt/50">
                <Text className="text-xs font-bold text-brand-textSoft">{confirmModal.cancelText}</Text>
              </Pressable>
              <Pressable onPress={confirmModal.onConfirm} className="px-4 py-2.5 rounded-xl" style={{ backgroundColor: confirmModal.isDestructive ? BRAND_COLORS.danger : BRAND_COLORS.primary }}>
                <Text className="text-xs font-bold text-white">{confirmModal.confirmText}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
