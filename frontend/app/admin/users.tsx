import { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Mail, Shield, AlertTriangle } from 'lucide-react-native';
import { BRAND_COLORS, UserRole } from '../../constants';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import AdminNav from '../../components/admin/AdminNav';
import { clearCache } from '../../lib/cache';
import { cancelTripReminder } from '../../lib/notifications';

interface UserRecord {
  id: string;
  email: string;
  full_name: string;
  role?: string;
  created_at: string;
  banned_until?: string | null;
}

function formatDate(s: string) {
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

export default function AdminUsers() {
  const qc = useQueryClient();
  const { user: currentUser, isAdmin } = useAuth();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ visible: boolean; title: string; message: string; onConfirm: () => void; confirmText?: string; cancelText?: string; isDestructive?: boolean } | null>(null);

  const { data: users, isLoading: usersLoading } = useQuery<UserRecord[]>({
    queryKey: ['adminUsers'],
    queryFn: async () => (await api.get('/admin/users')).data,
    enabled: !!isAdmin,
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/users/${id}`),
    onSuccess: (res) => { 
      const tripIds = res.data?.deletedTripIds || [];
      tripIds.forEach((tripId: string) => {
        cancelTripReminder(tripId);
        clearCache(`trip_${tripId}`);
      });
      qc.invalidateQueries({ queryKey: ['adminUsers'] }); 
      showToast('Đã xóa người dùng và toàn bộ dữ liệu liên quan thành công!', 'success'); 
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });

  const toggleBan = useMutation({
    mutationFn: (id: string) => api.put(`/admin/users/${id}/toggle-ban`),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['adminUsers'] }); 
      showToast('Đã thay đổi trạng thái người dùng!', 'success'); 
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'user' | 'admin' }) => api.put(`/admin/users/${id}/role`, { role }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['adminUsers'] });
      showToast(res.data?.message || 'Đã cập nhật quyền thành công!', 'success');
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

  const confirmDeleteUser = (id: string, email: string) => {
    showConfirm(
      'Xác nhận xóa tài khoản',
      `Bạn có chắc chắn muốn xóa tài khoản ${email}? Toàn bộ thông tin cá nhân, hành trình chuyến đi và các dữ liệu liên quan khác của người dùng này sẽ bị XÓA SẠCH HOÀN TOÀN khỏi cơ sở dữ liệu!`,
      () => deleteUser.mutate(id),
      { confirmText: 'Xóa sạch', cancelText: 'Hủy', isDestructive: true }
    );
  };

  const confirmToggleBan = (id: string, email: string, isBanned: boolean) => {
    const title = isBanned ? 'Xác nhận mở khóa tài khoản' : 'Xác nhận khóa tài khoản';
    const message = isBanned 
      ? `Bạn có chắc chắn muốn mở khóa cho tài khoản ${email}? Người dùng sẽ lấy lại quyền đăng nhập và tạo chuyến đi.` 
      : `Bạn có chắc chắn muốn khóa tài khoản ${email}? Người dùng này sẽ lập tức bị đăng xuất và không thể truy cập hệ thống.`;
    showConfirm(
      title,
      message,
      () => toggleBan.mutate(id),
      { confirmText: isBanned ? 'Mở khóa' : 'Khóa tài khoản', cancelText: 'Hủy', isDestructive: !isBanned }
    );
  };

  const confirmToggleRole = (id: string, email: string, currentRole: string) => {
    if (currentUser?.id === id) {
      showToast('Bạn không thể tự thay đổi quyền Admin của chính tài khoản mình đang đăng nhập!', 'error');
      return;
    }

    const targetRole = currentRole === UserRole.ADMIN ? UserRole.USER : UserRole.ADMIN;
    const title = targetRole === UserRole.ADMIN ? 'Cấp quyền Quản trị viên (Admin)' : 'Hạ quyền Quản trị viên xuống User';
    const message = targetRole === UserRole.ADMIN
      ? `Bạn có chắc chắn muốn cấp quyền Admin cho tài khoản ${email}? Người dùng này sẽ có toàn quyền truy cập hệ thống quản trị, xem doanh thu và quản lý người dùng khác.`
      : `Bạn có chắc chắn muốn hủy quyền Admin của tài khoản ${email}? Người dùng này sẽ trở thành thành viên thông thường.`;
    showConfirm(
      title,
      message,
      () => updateRole.mutate({ id, role: targetRole }),
      { confirmText: targetRole === UserRole.ADMIN ? 'Cấp quyền Admin' : 'Hạ quyền', cancelText: 'Hủy', isDestructive: targetRole !== UserRole.ADMIN }
    );
  };

  return (
    <View className="flex-1 bg-brand-bg">
      <AdminNav />

      {toast && (
        <View className="absolute top-20 left-0 right-0 z-50 items-center px-4">
          <View className="flex-row items-center gap-2 px-4 py-3 rounded-xl shadow-lg border border-brand-line/40 max-w-md w-full bg-white">
            <Text className="text-xs font-bold flex-1" style={{ color: toast.type === 'success' ? BRAND_COLORS.primaryStrong : toast.type === 'error' ? BRAND_COLORS.danger : BRAND_COLORS.accentStrong }}>
              {toast.message}
            </Text>
          </View>
        </View>
      )}

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 24 }}>
        <View className="rounded-2xl border border-brand-line/40 overflow-hidden bg-brand-bgAlt/30">
          <View className="flex-row px-4 py-3 border-b border-brand-line/40 bg-brand-bgAlt/60 items-center">
            <Text className="flex-1 text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider">Tên / Email</Text>
            <Text className="w-24 text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider text-center">Ngày đăng ký</Text>
            <Text className="w-28 text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider text-center">Vai trò (Role)</Text>
            <Text className="w-24 text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider text-center">Trạng thái</Text>
            <Text className="w-10 text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider text-center">Xóa</Text>
          </View>

          {usersLoading ? (
            <View className="py-12 items-center gap-2">
              <ActivityIndicator color={BRAND_COLORS.primary} />
              <Text className="text-xs text-brand-textSoft">Đang tải danh sách thành viên...</Text>
            </View>
          ) : !users?.length ? (
            <Text className="text-center py-12 text-brand-textSoft text-sm">Chưa có người dùng nào.</Text>
          ) : users.map(u => {
            const isAdminUser = u.role === UserRole.ADMIN;
            return (
              <View key={u.id} className="flex-row items-center px-4 py-4 border-b border-brand-line/20 gap-2">
                <View className="flex-1 gap-0.5">
                  <Text className="font-bold text-sm text-brand-text" numberOfLines={1}>{u.full_name || 'Khách Vô Danh'}</Text>
                  <View className="flex-row items-center gap-1">
                    <Mail size={11} color={BRAND_COLORS.textSoft} />
                    <Text className="text-[11px] text-brand-textSoft" numberOfLines={1}>{u.email}</Text>
                  </View>
                </View>

                <Text className="text-xs text-brand-textSoft w-24 text-center">{formatDate(u.created_at)}</Text>

                {/* Role badge with direct click-to-promote/demote */}
                <View className="w-28 items-center">
                  <Pressable
                    onPress={() => confirmToggleRole(u.id, u.email, u.role || 'user')}
                    className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-lg border"
                    style={{
                      backgroundColor: isAdminUser ? '#7C3AED15' : `${BRAND_COLORS.line}25`,
                      borderColor: isAdminUser ? '#7C3AED50' : `${BRAND_COLORS.line}60`
                    }}
                  >
                    <Shield size={12} color={isAdminUser ? '#7C3AED' : BRAND_COLORS.textSoft} />
                    <Text className="text-[11px] font-bold" style={{ color: isAdminUser ? '#7C3AED' : BRAND_COLORS.textSoft }}>
                      {isAdminUser ? 'Admin' : 'User'}
                    </Text>
                  </Pressable>
                </View>

                {/* Ban / Active status */}
                <View className="w-24 items-center">
                  <Pressable onPress={() => confirmToggleBan(u.id, u.email, !!u.banned_until)} className="flex-row items-center gap-1">
                    <View className="w-9 h-5 rounded-full items-center justify-center" style={{ backgroundColor: u.banned_until ? `${BRAND_COLORS.danger}20` : `${BRAND_COLORS.primary}20` }}>
                      <View className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: u.banned_until ? BRAND_COLORS.danger : BRAND_COLORS.primary, marginLeft: u.banned_until ? -6 : 6 }} />
                    </View>
                    <Text className="text-[10px] font-bold" style={{ color: u.banned_until ? BRAND_COLORS.danger : BRAND_COLORS.primary }}>
                      {u.banned_until ? 'Bị khóa' : 'Hoạt động'}
                    </Text>
                  </Pressable>
                </View>

                {/* Delete button */}
                <View className="w-10 items-center">
                  <Pressable
                    onPress={() => confirmDeleteUser(u.id, u.email)}
                    disabled={u.email === 'mockuser@vivu.vn' || currentUser?.id === u.id}
                    className="p-2 rounded-lg"
                    style={{
                      backgroundColor: `${BRAND_COLORS.danger}1A`,
                      opacity: (u.email === 'mockuser@vivu.vn' || currentUser?.id === u.id) ? 0.3 : 1
                    }}
                  >
                    <Trash2 size={15} color={BRAND_COLORS.danger} />
                  </Pressable>
                </View>
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
