import { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Key, BarChart3, Eye, Check, AlertTriangle, X } from 'lucide-react-native';
import { BRAND_COLORS } from '../../constants';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import AdminNav from '../../components/admin/AdminNav';
import Reveal from '../../components/Reveal';

interface ApiKeyRecord { id: string; key_value: string; is_active: boolean; status: string; last_used_at: string | null; created_at: string; usage_count?: number; }

function maskKey(v: string) {
  if (v.length <= 15) return v;
  return `${v.substring(0,8)}...${v.substring(v.length-5)}`;
}

export default function AdminKeys() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ visible: boolean; title: string; message: string; onConfirm: () => void; confirmText?: string; cancelText?: string; isDestructive?: boolean } | null>(null);
  const [bulkKeys, setBulkKeys] = useState('');
  const [visibleKeys, setVisibleKeys] = useState<Record<string,boolean>>({});

  const { data: apiKeys, isLoading: keysLoading } = useQuery<ApiKeyRecord[]>({
    queryKey: ['adminKeys'],
    queryFn: async () => (await api.get('/admin/keys')).data,
    enabled: !!isAdmin,
  });

  const addKeys = useMutation({
    mutationFn: (keyValues: string[]) => api.post('/admin/keys', { key_values: keyValues }),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['adminKeys'] }); 
      setBulkKeys(''); 
      showToast('Đã thêm danh sách API Key thành công!', 'success'); 
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });

  const updateKey = useMutation({
    mutationFn: ({ id, is_active, status }: { id: string; is_active: boolean; status: string }) => api.put(`/admin/keys/${id}`, { is_active, status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminKeys'] });
      showToast('Đã thay đổi cấu hình API Key!', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });

  const deleteKey = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/keys/${id}`),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['adminKeys'] }); 
      showToast('Đã xóa API Key thành công!', 'success'); 
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

  const confirmDeleteKey = (id: string, value: string) => {
    const masked = maskKey(value);
    showConfirm(
      'Xác nhận xóa API Key',
      `Bạn có chắc chắn muốn xóa API Key ${masked} khỏi bể khóa xoay vòng không? Hành động này không thể hoàn tác!`,
      () => deleteKey.mutate(id),
      { confirmText: 'Xóa', cancelText: 'Hủy', isDestructive: true }
    );
  };

  const confirmToggleRotation = (id: string, value: string, isActive: boolean, status: string) => {
    const masked = maskKey(value);
    const title = isActive ? 'Tắt xoay vòng Key' : 'Bật xoay vòng Key';
    const message = isActive 
      ? `Bạn có chắc chắn muốn tắt tính năng xoay vòng đối với key ${masked}?` 
      : `Bạn có chắc chắn muốn bật tính năng xoay vòng đối với key ${masked}?`;
    showConfirm(
      title,
      message,
      () => updateKey.mutate({ id, is_active: !isActive, status }),
      { confirmText: isActive ? 'Tắt xoay' : 'Bật xoay', cancelText: 'Hủy' }
    );
  };

  const confirmResetKey = (id: string, value: string) => {
    const masked = maskKey(value);
    showConfirm(
      'Đặt lại trạng thái Key',
      `Bạn có chắc chắn muốn khôi phục trạng thái hoạt động bình thường cho key ${masked}?`,
      () => updateKey.mutate({ id, is_active: true, status: 'active' }),
      { confirmText: 'Đặt lại', cancelText: 'Hủy' }
    );
  };

  const handleAddBulkKeys = () => {
    if (!bulkKeys.trim()) return;
    const parsed = bulkKeys.split('\n').map(k => k.trim()).filter(k => k.length > 10 && (k.startsWith('AIzaSy') || k.startsWith('AQ') || k.startsWith('AO')));
    if (parsed.length === 0) { 
      showToast('Không tìm thấy API Key hợp lệ (bắt đầu bằng AIzaSy, AQ hoặc AO).', 'error'); 
      return; 
    }
    addKeys.mutate(parsed);
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
        <View className="gap-8">
          <Reveal>
            <View className="p-5 rounded-2xl border border-brand-line/40 bg-brand-bgAlt/40 gap-4">
              <View className="gap-0.5">
                <View className="flex-row items-center gap-2">
                  <Key size={15} color={BRAND_COLORS.primary} />
                  <Text className="font-bold text-base text-brand-text">Thêm nhanh Gemini API Keys</Text>
                </View>
                <Text className="text-xs text-brand-textSoft">Dán danh sách API Keys (mỗi key nằm trên một dòng riêng biệt)</Text>
              </View>
              <TextInput
                value={bulkKeys}
                onChangeText={setBulkKeys}
                multiline
                numberOfLines={4}
                placeholder={'AIzaSyBHPaLXoSL8vXh0r0...\nAQ.Ab8RN6KCHEwv9Xa...\nAO.Ab8RN6IIWn40...'}
                className="w-full px-4 py-3 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text font-mono"
                placeholderTextColor={BRAND_COLORS.textMuted}
                style={{ minHeight: 90, textAlignVertical: 'top' }}
              />
              <View className="items-end">
                <Pressable
                  onPress={handleAddBulkKeys}
                  disabled={addKeys.isPending || !bulkKeys.trim()}
                  className="flex-row items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-primary"
                  style={(addKeys.isPending || !bulkKeys.trim()) ? { opacity: 0.5 } : undefined}
                >
                  {addKeys.isPending ? <ActivityIndicator size="small" color="white" /> : <Key size={14} color="white" />}
                  <Text className="text-white text-xs font-bold">{addKeys.isPending ? 'Đang thêm...' : 'Thêm danh sách Keys'}</Text>
                </Pressable>
              </View>
            </View>
          </Reveal>

          <View className="gap-3">
            <View className="flex-row items-center gap-2">
              <BarChart3 size={15} color={BRAND_COLORS.primary} />
              <Text className="font-bold text-base text-brand-text">Danh sách Keys đang xoay vòng</Text>
            </View>
            <View className="rounded-2xl border border-brand-line/40 overflow-hidden bg-brand-bgAlt/30">
              <View className="flex-row px-4 py-3 border-b border-brand-line/40 bg-brand-bgAlt/60 items-center">
                <Text className="flex-[3] text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider">API Key</Text>
                <Text className="w-24 text-center text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider">Số lượt gọi</Text>
                <Text className="w-32 text-center text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider">Trạng thái</Text>
                <Text className="w-20 text-center text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider">Xoay</Text>
                <Text className="w-16 text-center text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider"></Text>
              </View>
              {keysLoading ? (
                <View className="py-12 items-center gap-2">
                  <ActivityIndicator color={BRAND_COLORS.primary} />
                  <Text className="text-xs text-brand-textSoft">Đang tải bể API Keys...</Text>
                </View>
              ) : !apiKeys?.length ? (
                <Text className="text-center py-10 text-brand-textSoft text-sm px-6">Chưa có API Key nào. Hãy thêm key ở trên!</Text>
              ) : apiKeys.map(k => {
                const statusMeta = k.status === 'active'
                  ? { label: 'Hoạt động', icon: <Check size={10} color={BRAND_COLORS.primary} />, bg: `${BRAND_COLORS.primary}1A`, color: BRAND_COLORS.primary }
                  : k.status === 'rate_limited'
                  ? { label: 'Hạn chế', icon: <AlertTriangle size={10} color={BRAND_COLORS.gold} />, bg: `${BRAND_COLORS.gold}20`, color: BRAND_COLORS.gold }
                  : { label: 'Không hợp lệ', icon: <X size={10} color={BRAND_COLORS.danger} />, bg: `${BRAND_COLORS.danger}1A`, color: BRAND_COLORS.danger };
                return (
                  <View key={k.id} className="flex-row items-center px-4 py-3 border-b border-brand-line/20">
                    <View className="flex-[3] flex-row items-center gap-2 pr-4">
                      <Text className="text-[11px] font-mono text-brand-textSoft flex-1" numberOfLines={1}>
                        {visibleKeys[k.id] ? k.key_value : maskKey(k.key_value)}
                      </Text>
                      <Pressable onPress={() => setVisibleKeys(p => ({ ...p, [k.id]: !p[k.id] }))} className="p-1 rounded bg-brand-line/10">
                        <Eye size={13} color={BRAND_COLORS.textSoft} />
                      </Pressable>
                    </View>
                    <Text className="w-24 text-center text-[11px] font-bold text-brand-textSoft">
                      {k.usage_count || 0} lượt
                    </Text>
                    <View className="w-32 items-center gap-1">
                      <View className="flex-row items-center gap-1 px-1.5 py-0.5 rounded" style={{ backgroundColor: statusMeta.bg }}>
                        {statusMeta.icon}
                        <Text className="text-[9px] font-bold uppercase" style={{ color: statusMeta.color }}>{statusMeta.label}</Text>
                      </View>
                      {k.status !== 'active' && (
                        <Pressable onPress={() => confirmResetKey(k.id, k.key_value)}>
                          <Text className="text-[10px] font-bold text-brand-primary">Đặt lại</Text>
                        </Pressable>
                      )}
                    </View>
                    <View className="w-20 items-center">
                      <Pressable onPress={() => confirmToggleRotation(k.id, k.key_value, k.is_active, k.status)}>
                        <View className="w-10 h-5 rounded-full items-center justify-center" style={{ backgroundColor: k.is_active ? `${BRAND_COLORS.primary}20` : `${BRAND_COLORS.textSoft}20` }}>
                          <View className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: k.is_active ? BRAND_COLORS.primary : BRAND_COLORS.textSoft, marginLeft: k.is_active ? 6 : -6 }} />
                        </View>
                      </Pressable>
                    </View>
                    <View className="w-16 items-center">
                      <Pressable onPress={() => confirmDeleteKey(k.id, k.key_value)} className="p-2 rounded-lg" style={{ backgroundColor: `${BRAND_COLORS.danger}1A` }}>
                        <Trash2 size={14} color={BRAND_COLORS.danger} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
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
