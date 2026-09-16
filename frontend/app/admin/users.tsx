import { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Mail, Shield, AlertTriangle, Crown, Check, X, Search, Edit3, Phone, KeyRound, Filter } from 'lucide-react-native';
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
  phone?: string;
  role?: string;
  is_premium?: boolean;
  premium_until?: string | null;
  quota_total?: number;
  quota_used?: number;
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
  const [packageModal, setPackageModal] = useState<{ visible: boolean; userId: string; email: string; currentPlan: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'admin' | 'user' | 'free' | 'premium' | 'banned'>('all');
  const [editUserModal, setEditUserModal] = useState<{
    visible: boolean;
    user: UserRecord | null;
    fullName: string;
    phone: string;
    quotaTotal: string;
    newPassword: string;
  }>({
    visible: false,
    user: null,
    fullName: '',
    phone: '',
    quotaTotal: '3',
    newPassword: '',
  });

  const { data: users, isLoading: usersLoading } = useQuery<UserRecord[]>({
    queryKey: ['adminUsers'],
    queryFn: async () => (await api.get('/admin/users')).data,
    enabled: !!isAdmin,
  });

  const editUserMutation = useMutation({
    mutationFn: ({ id, full_name, phone, quota_total, new_password }: any) =>
      api.put(`/admin/users/${id}`, { full_name, phone, quota_total, new_password }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['adminUsers'] });
      showToast(res.data?.message || 'Đã cập nhật thông tin người dùng thành công!', 'success');
      setEditUserModal({ visible: false, user: null, fullName: '', phone: '', quotaTotal: '3', newPassword: '' });
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });

  const updatePackage = useMutation({
    mutationFn: ({ id, is_premium, plan, duration_days, custom_quota }: any) =>
      api.put(`/admin/users/${id}/package`, { is_premium, plan, duration_days, custom_quota }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['adminUsers'] });
      showToast(res.data?.message || 'Đã cập nhật gói thành viên thành công!', 'success');
      setPackageModal(null);
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
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

  const filteredUsers = (users || []).filter(u => {
    const term = searchTerm.toLowerCase().trim();
    if (term) {
      const matchEmail = (u.email || '').toLowerCase().includes(term);
      const matchName = (u.full_name || '').toLowerCase().includes(term);
      const matchPhone = (u.phone || '').toLowerCase().includes(term);
      if (!matchEmail && !matchName && !matchPhone) return false;
    }

    if (filterRole === 'admin') return u.role === UserRole.ADMIN;
    if (filterRole === 'user') return u.role !== UserRole.ADMIN;
    if (filterRole === 'free') return !u.is_premium;
    if (filterRole === 'premium') return !!u.is_premium;
    if (filterRole === 'banned') return !!(u.banned_until && new Date(u.banned_until) > new Date());

    return true;
  });

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

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 20 }}>
        {/* Page Title & Search / Filter Controls */}
        <View className="gap-4">
          <View className="flex-row justify-between items-center flex-wrap gap-2">
            <View>
              <Text className="font-display font-extrabold text-2xl text-brand-text">Quản Lý Người Dùng</Text>
              <Text className="text-xs text-brand-textSoft">
                Hiển thị {filteredUsers.length} / {users?.length || 0} tài khoản hệ thống
              </Text>
            </View>

            {/* Live Search Input */}
            <View className="flex-row items-center bg-white border border-brand-line/60 rounded-xl px-3 py-2 gap-2" style={{ minWidth: 260 }}>
              <Search size={15} color={BRAND_COLORS.textSoft} />
              <TextInput
                value={searchTerm}
                onChangeText={setSearchTerm}
                placeholder="Tìm theo tên, email, SĐT..."
                placeholderTextColor={BRAND_COLORS.textMuted}
                className="text-xs text-brand-text flex-1 outline-none"
                style={{ borderWidth: 0 }}
              />
              {searchTerm ? (
                <Pressable onPress={() => setSearchTerm('')}>
                  <X size={14} color={BRAND_COLORS.textSoft} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Quick Filter Tabs */}
          <View className="flex-row flex-wrap gap-2">
            {[
              { key: 'all', label: 'Tất cả' },
              { key: 'user', label: 'User thường' },
              { key: 'admin', label: 'Quản trị viên (Admin)' },
              { key: 'free', label: '🟢 Gói Free' },
              { key: 'premium', label: '👑 Gói Premium' },
              { key: 'banned', label: '🚫 Bị khóa' },
            ].map(f => {
              const active = filterRole === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setFilterRole(f.key as any)}
                  className="px-3 py-1.5 rounded-lg border"
                  style={{
                    backgroundColor: active ? BRAND_COLORS.primary : '#FFFFFF',
                    borderColor: active ? BRAND_COLORS.primary : `${BRAND_COLORS.line}60`,
                    cursor: 'pointer' as any,
                  }}
                >
                  <Text className="text-xs font-bold" style={{ color: active ? '#FFFFFF' : BRAND_COLORS.textSoft }}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Users Table */}
        <View className="rounded-2xl border border-brand-line/40 overflow-hidden bg-brand-bgAlt/30 shadow-sm">
          <View className="flex-row px-4 py-3 border-b border-brand-line/40 bg-brand-bgAlt/60 items-center">
            <Text className="flex-1 text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider">Tên / Email / SĐT</Text>
            <Text className="w-24 text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider text-center">Ngày ĐK</Text>
            <Text className="w-36 text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider text-center">Gói cước & Hạn</Text>
            <Text className="w-24 text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider text-center">Vai trò</Text>
            <Text className="w-20 text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider text-center">Trạng thái</Text>
            <Text className="w-20 text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider text-center">Thao tác</Text>
          </View>

          {usersLoading ? (
            <View className="py-12 items-center gap-2">
              <ActivityIndicator color={BRAND_COLORS.primary} />
              <Text className="text-xs text-brand-textSoft">Đang tải danh sách thành viên...</Text>
            </View>
          ) : !filteredUsers.length ? (
            <Text className="text-center py-12 text-brand-textSoft text-sm">Không tìm thấy người dùng nào phù hợp với bộ lọc.</Text>
          ) : filteredUsers.map(u => {
            const isAdminUser = u.role === UserRole.ADMIN;
            return (
              <View key={u.id} className="flex-row items-center px-4 py-4 border-b border-brand-line/20 gap-2 hover:bg-white/40">
                <View className="flex-1 gap-0.5">
                  <Text className="font-bold text-sm text-brand-text" numberOfLines={1}>{u.full_name || 'Khách Vô Danh'}</Text>
                  <View className="flex-row items-center gap-1.5 flex-wrap">
                    <View className="flex-row items-center gap-1">
                      <Mail size={11} color={BRAND_COLORS.textSoft} />
                      <Text className="text-[11px] text-brand-textSoft" numberOfLines={1}>{u.email}</Text>
                    </View>
                    {u.phone ? (
                      <View className="flex-row items-center gap-1">
                        <Phone size={10} color={BRAND_COLORS.textSoft} />
                        <Text className="text-[10px] text-brand-textSoft">{u.phone}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <Text className="text-xs text-brand-textSoft w-24 text-center">{formatDate(u.created_at)}</Text>

                {/* Package badge with click-to-change */}
                <View className="w-36 items-center">
                  <Pressable
                    onPress={() => setPackageModal({
                      visible: true,
                      userId: u.id,
                      email: u.email,
                      currentPlan: u.is_premium ? (u.quota_total && u.quota_total <= 10 ? 'starter' : 'pro') : 'free'
                    })}
                    className="flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-lg border"
                    style={{
                      backgroundColor: !u.is_premium ? '#05966915' : (u.quota_total && u.quota_total <= 10 ? '#D9770615' : '#7C3AED15'),
                      borderColor: !u.is_premium ? '#05966940' : (u.quota_total && u.quota_total <= 10 ? '#D9770640' : '#7C3AED40'),
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Crown size={12} color={!u.is_premium ? '#059669' : (u.quota_total && u.quota_total <= 10 ? '#D97706' : '#7C3AED')} />
                    <View className="items-center">
                      <Text className="text-[11px] font-extrabold" style={{ color: !u.is_premium ? '#059669' : (u.quota_total && u.quota_total <= 10 ? '#D97706' : '#7C3AED') }}>
                        {!u.is_premium ? `Free (${u.quota_total ?? 3} lượt)` : (u.quota_total && u.quota_total <= 10 ? 'Starter (10 lượt)' : 'Premium Pro')}
                      </Text>
                      {u.is_premium && u.premium_until ? (
                        <Text className="text-[9px] text-brand-textSoft">
                          Còn {Math.max(0, Math.ceil((new Date(u.premium_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} ngày
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                </View>

                {/* Role badge */}
                <View className="w-24 items-center">
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
                <View className="w-20 items-center">
                  <Pressable onPress={() => confirmToggleBan(u.id, u.email, !!u.banned_until)} className="flex-row items-center gap-1">
                    <View className="w-8 h-4 rounded-full items-center justify-center" style={{ backgroundColor: u.banned_until ? `${BRAND_COLORS.danger}20` : `${BRAND_COLORS.primary}20` }}>
                      <View className="w-3 h-3 rounded-full" style={{ backgroundColor: u.banned_until ? BRAND_COLORS.danger : BRAND_COLORS.primary, marginLeft: u.banned_until ? -5 : 5 }} />
                    </View>
                    <Text className="text-[9px] font-bold" style={{ color: u.banned_until ? BRAND_COLORS.danger : BRAND_COLORS.primary }}>
                      {u.banned_until ? 'Khóa' : 'Bật'}
                    </Text>
                  </Pressable>
                </View>

                {/* Action buttons: Sửa thông tin & Xóa */}
                <View className="w-20 flex-row items-center justify-center gap-1.5">
                  {/* Edit User Info Button */}
                  <Pressable
                    testID="edit-user-btn"
                    onPress={() => setEditUserModal({
                      visible: true,
                      user: u,
                      fullName: u.full_name || '',
                      phone: u.phone || '',
                      quotaTotal: String(u.quota_total ?? 3),
                      newPassword: '',
                    })}
                    className="p-1.5 rounded-lg border border-brand-primary/30 bg-brand-primary/10 hover:bg-brand-primary/20"
                    style={{ cursor: 'pointer' as any }}
                    accessibilityLabel="Chỉnh sửa thông tin"
                  >
                    <Edit3 size={13} color={BRAND_COLORS.primary} />
                  </Pressable>

                  {/* Delete button */}
                  <Pressable
                    onPress={() => confirmDeleteUser(u.id, u.email)}
                    disabled={u.email === 'mockuser@vivu.vn' || currentUser?.id === u.id}
                    className="p-1.5 rounded-lg border border-brand-danger/30 bg-brand-danger/10 hover:bg-brand-danger/20"
                    style={{
                      opacity: (u.email === 'mockuser@vivu.vn' || currentUser?.id === u.id) ? 0.3 : 1,
                      cursor: 'pointer' as any,
                    }}
                    accessibilityLabel="Xóa người dùng"
                  >
                    <Trash2 size={13} color={BRAND_COLORS.danger} />
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

      {packageModal && packageModal.visible && (
        <View className="absolute inset-0 z-50 items-center justify-center bg-black/60 px-4">
          <View className="bg-brand-bg border border-brand-line/60 rounded-2xl p-6 max-w-md w-full shadow-2xl gap-4">
            <View className="flex-row items-center justify-between border-b border-brand-line/40 pb-3">
              <View className="flex-row items-center gap-2">
                <Crown size={22} color={BRAND_COLORS.gold} />
                <View>
                  <Text className="text-base font-display font-extrabold text-brand-text">Điều Chỉnh Gói Thành Viên</Text>
                  <Text className="text-[11px] text-brand-textSoft" numberOfLines={1}>{packageModal.email}</Text>
                </View>
              </View>
              <Pressable onPress={() => setPackageModal(null)} className="p-1.5 rounded-lg bg-brand-bgAlt">
                <X size={16} color={BRAND_COLORS.textSoft} />
              </Pressable>
            </View>

            <View className="gap-2.5">
              {/* Option 1: Hạ về Free */}
              <Pressable
                onPress={() => updatePackage.mutate({
                  id: packageModal.userId,
                  is_premium: false,
                  plan: 'free',
                  duration_days: 0,
                  custom_quota: 3
                })}
                className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 flex-row items-center justify-between"
                style={{ cursor: 'pointer' as any }}
              >
                <View className="gap-0.5">
                  <Text className="text-xs font-extrabold text-emerald-600">🟢 Hạ về Gói Miễn Phí (Free)</Text>
                  <Text className="text-[11px] text-brand-textSoft">Giới hạn 3 lượt tạo chuyến đi, không có thời hạn</Text>
                </View>
                {packageModal.currentPlan === 'free' && <Check size={16} color="#059669" />}
              </Pressable>

              {/* Option 2: Nâng Starter */}
              <Pressable
                onPress={() => updatePackage.mutate({
                  id: packageModal.userId,
                  is_premium: true,
                  plan: 'starter',
                  duration_days: 30,
                  custom_quota: 10
                })}
                className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 flex-row items-center justify-between"
                style={{ cursor: 'pointer' as any }}
              >
                <View className="gap-0.5">
                  <Text className="text-xs font-extrabold text-amber-600">🟡 Gói Starter (Cơ bản)</Text>
                  <Text className="text-[11px] text-brand-textSoft">10 lượt tạo chuyến đi trong 30 ngày</Text>
                </View>
                {packageModal.currentPlan === 'starter' && <Check size={16} color="#D97706" />}
              </Pressable>

              {/* Option 3: Nâng Pro */}
              <Pressable
                onPress={() => updatePackage.mutate({
                  id: packageModal.userId,
                  is_premium: true,
                  plan: 'pro',
                  duration_days: 30,
                  custom_quota: 9999
                })}
                className="p-3.5 rounded-xl border border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 flex-row items-center justify-between"
                style={{ cursor: 'pointer' as any }}
              >
                <View className="gap-0.5">
                  <Text className="text-xs font-extrabold text-purple-600">🟣 Gói Premium Pro</Text>
                  <Text className="text-[11px] text-brand-textSoft">Không giới hạn chuyến đi trong 30 ngày</Text>
                </View>
                {packageModal.currentPlan === 'pro' && <Check size={16} color="#7C3AED" />}
              </Pressable>

              {/* Option 4: Nâng VIP */}
              <Pressable
                onPress={() => updatePackage.mutate({
                  id: packageModal.userId,
                  is_premium: true,
                  plan: 'vip',
                  duration_days: 365,
                  custom_quota: 9999
                })}
                className="p-3.5 rounded-xl border border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10 flex-row items-center justify-between"
                style={{ cursor: 'pointer' as any }}
              >
                <View className="gap-0.5">
                  <Text className="text-xs font-extrabold text-yellow-600">👑 Gói VIP Doanh Nghiệp (1 Năm)</Text>
                  <Text className="text-[11px] text-brand-textSoft">Không giới hạn chuyến đi trong 365 ngày</Text>
                </View>
                {packageModal.currentPlan === 'vip' && <Check size={16} color="#CA8A04" />}
              </Pressable>
            </View>

            <View className="flex-row justify-end pt-2 border-t border-brand-line/40">
              <Pressable onPress={() => setPackageModal(null)} className="px-4 py-2 rounded-xl bg-brand-bgAlt border border-brand-line/60">
                <Text className="text-xs font-bold text-brand-textSoft">Đóng</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Modal Chỉnh Sửa Thông Tin Người Dùng */}
      {editUserModal.visible && editUserModal.user && (
        <View className="absolute inset-0 z-50 items-center justify-center bg-black/60 px-4">
          <View className="bg-brand-bg border border-brand-line/60 rounded-2xl p-6 max-w-lg w-full shadow-2xl gap-4">
            <View className="flex-row items-center justify-between border-b border-brand-line/40 pb-3">
              <View className="flex-row items-center gap-2">
                <View className="w-8 h-8 rounded-lg bg-brand-primary/15 items-center justify-center">
                  <Edit3 size={18} color={BRAND_COLORS.primary} />
                </View>
                <View>
                  <Text className="text-base font-display font-extrabold text-brand-text">Sửa Thông Tin Tài Khoản</Text>
                  <Text className="text-[11px] text-brand-textSoft" numberOfLines={1}>{editUserModal.user.email}</Text>
                </View>
              </View>
              <Pressable
                onPress={() => setEditUserModal({ visible: false, user: null, fullName: '', phone: '', quotaTotal: '3', newPassword: '' })}
                className="p-1.5 rounded-lg bg-brand-bgAlt"
              >
                <X size={16} color={BRAND_COLORS.textSoft} />
              </Pressable>
            </View>

            <View className="gap-3.5">
              {/* Họ và tên */}
              <View className="gap-1">
                <Text className="text-xs font-bold text-brand-text">Họ và tên hiển thị</Text>
                <TextInput
                  value={editUserModal.fullName}
                  onChangeText={(val) => setEditUserModal(prev => ({ ...prev, fullName: val }))}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  placeholderTextColor={BRAND_COLORS.textMuted}
                  className="bg-white border border-brand-line/60 rounded-xl px-3 py-2.5 text-xs text-brand-text outline-none"
                />
              </View>

              {/* Số điện thoại */}
              <View className="gap-1">
                <Text className="text-xs font-bold text-brand-text">Số điện thoại liên hệ</Text>
                <View className="flex-row items-center bg-white border border-brand-line/60 rounded-xl px-3 py-2.5 gap-2">
                  <Phone size={14} color={BRAND_COLORS.textSoft} />
                  <TextInput
                    value={editUserModal.phone}
                    onChangeText={(val) => setEditUserModal(prev => ({ ...prev, phone: val }))}
                    placeholder="Ví dụ: 0987654321"
                    placeholderTextColor={BRAND_COLORS.textMuted}
                    keyboardType="phone-pad"
                    className="text-xs text-brand-text flex-1 outline-none"
                    style={{ borderWidth: 0 }}
                  />
                </View>
              </View>

              {/* Hạn mức số chuyến đi */}
              <View className="gap-1">
                <View className="flex-row justify-between items-center">
                  <Text className="text-xs font-bold text-brand-text">Hạn mức số chuyến đi (Quota)</Text>
                  <Text className="text-[11px] text-brand-textSoft">Đã dùng: {editUserModal.user.quota_used || 0}</Text>
                </View>
                <TextInput
                  value={editUserModal.quotaTotal}
                  onChangeText={(val) => setEditUserModal(prev => ({ ...prev, quotaTotal: val }))}
                  placeholder="Ví dụ: 5 hoặc 9999 (không giới hạn)"
                  placeholderTextColor={BRAND_COLORS.textMuted}
                  keyboardType="numeric"
                  className="bg-white border border-brand-line/60 rounded-xl px-3 py-2.5 text-xs text-brand-text outline-none font-bold"
                />
                {/* Quick Quota Chips */}
                <View className="flex-row flex-wrap gap-1.5 pt-1">
                  {[
                    { val: '3', label: '3 lượt (Free)' },
                    { val: '10', label: '+10 lượt' },
                    { val: '30', label: '+30 lượt' },
                    { val: '9999', label: '👑 Vô hạn (9999)' }
                  ].map(q => (
                    <Pressable
                      key={q.val}
                      onPress={() => setEditUserModal(prev => ({ ...prev, quotaTotal: q.val }))}
                      className="px-2.5 py-1 rounded-lg border text-[10px]"
                      style={{
                        borderColor: editUserModal.quotaTotal === q.val ? BRAND_COLORS.primary : 'rgba(27,36,32,0.15)',
                        backgroundColor: editUserModal.quotaTotal === q.val ? `${BRAND_COLORS.primary}15` : '#FFFFFF',
                        cursor: 'pointer' as any
                      }}
                    >
                      <Text
                        className="text-[10px] font-bold"
                        style={{ color: editUserModal.quotaTotal === q.val ? BRAND_COLORS.primary : BRAND_COLORS.textSoft }}
                      >
                        {q.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Đổi mật khẩu mới */}
              <View className="gap-1">
                <Text className="text-xs font-bold text-brand-text">Đổi mật khẩu mới (Tùy chọn)</Text>
                <View className="flex-row items-center bg-white border border-brand-line/60 rounded-xl px-3 py-2.5 gap-2">
                  <KeyRound size={14} color={BRAND_COLORS.textSoft} />
                  <TextInput
                    value={editUserModal.newPassword}
                    onChangeText={(val) => setEditUserModal(prev => ({ ...prev, newPassword: val }))}
                    placeholder="Bỏ trống nếu không muốn đổi mật khẩu"
                    placeholderTextColor={BRAND_COLORS.textMuted}
                    secureTextEntry
                    className="text-xs text-brand-text flex-1 outline-none"
                    style={{ borderWidth: 0 }}
                  />
                </View>
                <Text className="text-[10px] text-brand-textMuted italic">
                  * Tối thiểu 6 ký tự. Người dùng sẽ dùng mật khẩu này để đăng nhập ngay lập tức.
                </Text>
              </View>
            </View>

            <View className="flex-row justify-end gap-2.5 pt-3 border-t border-brand-line/40">
              <Pressable
                onPress={() => setEditUserModal({ visible: false, user: null, fullName: '', phone: '', quotaTotal: '3', newPassword: '' })}
                className="px-4 py-2.5 rounded-xl bg-brand-bgAlt border border-brand-line/60"
              >
                <Text className="text-xs font-bold text-brand-textSoft">Hủy</Text>
              </Pressable>
              <Pressable
                testID="save-user-btn"
                onPress={() => {
                  const quotaVal = parseInt(editUserModal.quotaTotal);
                  editUserMutation.mutate({
                    id: editUserModal.user!.id,
                    full_name: editUserModal.fullName,
                    phone: editUserModal.phone,
                    quota_total: isNaN(quotaVal) ? 3 : quotaVal,
                    new_password: editUserModal.newPassword || undefined,
                  });
                }}
                disabled={editUserMutation.isPending}
                className="px-5 py-2.5 rounded-xl bg-brand-primary flex-row items-center gap-2 shadow-sm"
                style={{ opacity: editUserMutation.isPending ? 0.7 : 1 }}
              >
                {editUserMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Check size={14} color="#FFFFFF" />
                )}
                <Text className="text-xs font-bold text-white">
                  {editUserMutation.isPending ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
