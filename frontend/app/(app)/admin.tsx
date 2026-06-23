import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Compass, Users, Map, Trash2, Shield, BarChart3, AlertTriangle,
  Key, Check, X, Eye, LogOut, MapPin, Calendar, Wallet,
  Mail, RefreshCw, ChevronRight,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabaseClient';
import { apiClient } from '../../lib/apiClient';
import { cancelTripReminder } from '../../lib/notifications';
import { clearCache } from '../../lib/cache';
import Reveal from '../../components/Reveal';
import { BRAND_COLORS } from '../../constants';

const canUseLocalStorage = Platform.OS === 'web' && typeof localStorage !== 'undefined';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AdminStats { totalUsers: number; totalTrips: number; totalDisruptions: number; totalApiKeys: number; }
interface UserRecord { id: string; email: string; full_name: string; created_at: string; banned_until?: string | null; }
interface TripRecord { id: string; title: string; destination_city: string; start_date: string; end_date: string; budget_total: number; status: string; user_email: string; created_at: string; }
interface ApiKeyRecord { id: string; key_value: string; is_active: boolean; status: string; last_used_at: string | null; created_at: string; }

const ADMIN_EMAILS = ['team89a6@gmail.com', 'vinhvip4508@gmail.com', 'mockuser@vivu.vn'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(s: string) {
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function maskKey(v: string) {
  if (v.length <= 15) return v;
  return `${v.substring(0,8)}...${v.substring(v.length-5)}`;
}

// ─── Row helpers ──────────────────────────────────────────────────────────────
function TableHeader({ cols }: { cols: string[] }) {
  return (
    <View className="flex-row px-4 py-3 border-b border-brand-line/40 bg-brand-bgAlt/60">
      {cols.map((c, i) => (
        <Text key={i} className="flex-1 text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider">{c}</Text>
      ))}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Admin() {
  const router = useRouter();
  const qc = useQueryClient();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<'users'|'trips'|'keys'>('users');
  const [bulkKeys, setBulkKeys] = useState('');
  const [visibleKeys, setVisibleKeys] = useState<Record<string,boolean>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    options?: { confirmText?: string; cancelText?: string; isDestructive?: boolean }
  ) => {
    setConfirmModal({
      visible: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(null);
      },
      confirmText: options?.confirmText || 'Xác nhận',
      cancelText: options?.cancelText || 'Hủy',
      isDestructive: options?.isDestructive ?? false,
    });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    const checkAdmin = async () => {
      const hasAdminToken = canUseLocalStorage && !!localStorage.getItem('vivu_admin_token');
      if (hasAdminToken) {
        setIsAdmin(true);
        setChecking(false);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const email = session?.user?.email;
        const allAdminEmails = [
          ...ADMIN_EMAILS,
          process.env.EXPO_PUBLIC_ADMIN_EMAIL
        ].filter(Boolean).map(e => e!.toLowerCase().trim());

        const isUserAdmin = email && allAdminEmails.includes(email.toLowerCase().trim());

        if (isUserAdmin) {
          setIsAdmin(true);
          setChecking(false);
        } else {
          if (Platform.OS === 'web') {
            window.alert('Từ chối truy cập: Bạn không có quyền truy cập trang quản trị!');
            router.replace('/chuyen-di');
          } else {
            Alert.alert('Từ chối truy cập', 'Bạn không có quyền truy cập trang quản trị!', [
              { text: 'OK', onPress: () => router.replace('/chuyen-di') },
            ]);
          }
          setChecking(false);
        }
      } catch (err) {
        if (Platform.OS === 'web') {
          window.alert('Từ chối truy cập: Bạn không có quyền truy cập trang quản trị!');
          router.replace('/chuyen-di');
        } else {
          Alert.alert('Từ chối truy cập', 'Bạn không có quyền truy cập trang quản trị!', [
            { text: 'OK', onPress: () => router.replace('/chuyen-di') },
          ]);
        }
        setChecking(false);
      }
    };

    checkAdmin();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    if (canUseLocalStorage) {
      localStorage.removeItem('vivu_admin_token');
      localStorage.removeItem('vivu_mock_user');
      localStorage.removeItem('vivu_mock_token');
    }
    router.replace('/(auth)/dang-nhap');
  };

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ['adminStats'],
    queryFn: async () => (await apiClient.get('/admin/stats')).data,
    enabled: isAdmin,
  });
  const { data: users, isLoading: usersLoading } = useQuery<UserRecord[]>({
    queryKey: ['adminUsers'],
    queryFn: async () => (await apiClient.get('/admin/users')).data,
    enabled: isAdmin,
  });
  const { data: trips, isLoading: tripsLoading } = useQuery<TripRecord[]>({
    queryKey: ['adminTrips'],
    queryFn: async () => (await apiClient.get('/admin/trips')).data,
    enabled: isAdmin,
  });
  const { data: apiKeys, isLoading: keysLoading } = useQuery<ApiKeyRecord[]>({
    queryKey: ['adminKeys'],
    queryFn: async () => (await apiClient.get('/admin/keys')).data,
    enabled: isAdmin,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const deleteUser = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/users/${id}`),
    onSuccess: (res) => { 
      const tripIds = res.data?.deletedTripIds || [];
      tripIds.forEach((tripId: string) => {
        cancelTripReminder(tripId);
        clearCache(`trip_${tripId}`);
      });
      qc.invalidateQueries({ queryKey: ['adminUsers'] }); 
      qc.invalidateQueries({ queryKey: ['adminStats'] }); 
      showToast('Đã xóa người dùng và toàn bộ dữ liệu liên quan thành công!', 'success'); 
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });
  const toggleBan = useMutation({
    mutationFn: (id: string) => apiClient.put(`/admin/users/${id}/toggle-ban`),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['adminUsers'] }); 
      showToast('Đã thay đổi trạng thái người dùng!', 'success'); 
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });
  const deleteTrip = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/trips/${id}`),
    onSuccess: (_, tripId) => {
      cancelTripReminder(tripId);
      clearCache(`trip_${tripId}`);
      qc.invalidateQueries({ queryKey: ['adminTrips'] });
      qc.invalidateQueries({ queryKey: ['adminStats'] });
      showToast('Đã xóa chuyến đi và toàn bộ lịch trình liên quan!', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });
  const addKeys = useMutation({
    mutationFn: (keyValues: string[]) => apiClient.post('/admin/keys', { key_values: keyValues }),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['adminKeys'] }); 
      qc.invalidateQueries({ queryKey: ['adminStats'] }); 
      setBulkKeys(''); 
      showToast('Đã thêm danh sách API Key thành công!', 'success'); 
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });
  const updateKey = useMutation({
    mutationFn: ({ id, is_active, status }: { id: string; is_active: boolean; status: string }) => apiClient.put(`/admin/keys/${id}`, { is_active, status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminKeys'] });
      showToast('Đã thay đổi cấu hình API Key!', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });
  const deleteKey = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/keys/${id}`),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['adminKeys'] }); 
      qc.invalidateQueries({ queryKey: ['adminStats'] }); 
      showToast('Đã xóa API Key thành công!', 'success'); 
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });

  // ── Confirm helpers ──────────────────────────────────────────────────────────
  const confirmDeleteUser = (id: string, email: string) => {
    showConfirm(
      'Xác nhận xóa tài khoản',
      `Bạn có chắc chắn muốn xóa tài khoản ${email}? Toàn bộ thông tin cá nhân, hành trình chuyến đi và các dữ liệu liên quan khác của người dùng này sẽ bị XÓA SẠCH HOÀN TOÀN khỏi cơ sở dữ liệu!`,
      () => deleteUser.mutate(id),
      { confirmText: 'Xóa sạch', cancelText: 'Hủy', isDestructive: true }
    );
  };
  const confirmDeleteTrip = (id: string, title: string) => {
    showConfirm(
      'Xác nhận xóa chuyến đi',
      `Bạn có chắc chắn muốn xóa chuyến đi "${title}"? Toàn bộ các ngày lịch trình, hoạt động chi tiết, dữ liệu chi tiêu và sự cố liên quan sẽ bị XÓA SẠCH khỏi hệ thống!`,
      () => deleteTrip.mutate(id),
      { confirmText: 'Xóa sạch', cancelText: 'Hủy', isDestructive: true }
    );
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

  // ── Auth check ────────────────────────────────────────────────────────────────
  if (checking) {
    return (
      <View className="flex-1 bg-brand-bg items-center justify-center gap-3">
        <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
        <Text className="text-sm font-semibold text-brand-textSoft">Đang kiểm tra quyền quản trị viên...</Text>
      </View>
    );
  }
  if (!isAdmin) return null;

  const STAT_CARDS = [
    { icon: <Users size={22} color={BRAND_COLORS.primary} />, bg: `${BRAND_COLORS.primary}1A`, label: 'Người dùng', value: stats?.totalUsers },
    { icon: <Map size={22} color={BRAND_COLORS.accent} />, bg: `${BRAND_COLORS.accent}1A`, label: 'Chuyến đi', value: stats?.totalTrips },
    { icon: <AlertTriangle size={22} color={BRAND_COLORS.danger} />, bg: `${BRAND_COLORS.danger}1A`, label: 'Sự cố AI', value: stats?.totalDisruptions },
    { icon: <Key size={22} color={BRAND_COLORS.gold} />, bg: `${BRAND_COLORS.gold}1A`, label: 'Bể API Keys', value: stats?.totalApiKeys },
  ];

  return (
    <View className="flex-1 bg-brand-bg">
      {/* Toast Notification */}
      {toast && (
        <View className="absolute top-4 left-4 right-4 z-50 items-center pointer-events-none">
          <View 
            className="flex-row items-center gap-2 px-4 py-3 rounded-xl shadow-lg border border-brand-line/40 max-w-md w-full"
            style={{ 
              backgroundColor: toast.type === 'success' ? '#EBF8F4' : toast.type === 'error' ? '#FDE8E8' : '#FFF3ED',
              borderColor: toast.type === 'success' ? '#CBECE1' : toast.type === 'error' ? '#FBD5D5' : '#FFE4D6',
              shadowColor: '#000', 
              shadowOffset: { width: 0, height: 4 }, 
              shadowOpacity: 0.1, 
              shadowRadius: 10,
              elevation: 5
            }}
          >
            {toast.type === 'success' ? (
              <Check size={16} color={BRAND_COLORS.primary} />
            ) : toast.type === 'error' ? (
              <X size={16} color={BRAND_COLORS.danger} />
            ) : (
              <AlertTriangle size={16} color={BRAND_COLORS.accent} />
            )}
            <Text 
              className="text-xs font-bold flex-1" 
              style={{ color: toast.type === 'success' ? BRAND_COLORS.primaryStrong : toast.type === 'error' ? BRAND_COLORS.danger : BRAND_COLORS.accentStrong }}
            >
              {toast.message}
            </Text>
          </View>
        </View>
      )}

      {/* Navbar */}
      <View className="bg-brand-bg border-b border-brand-line/40 px-6 py-4 flex-row justify-between items-center">
        <View className="flex-row items-center gap-2">
          <Compass size={26} color={BRAND_COLORS.primary} />
          <Text className="font-display font-bold text-xl text-brand-primary">ViVu Planner</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border" style={{ backgroundColor: `${BRAND_COLORS.accent}1A`, borderColor: `${BRAND_COLORS.accent}4D` }}>
            <Shield size={12} color={BRAND_COLORS.accent} />
            <Text className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: BRAND_COLORS.accent }}>Quản Trị</Text>
          </View>
          <Pressable onPress={handleLogout} className="flex-row items-center gap-1 px-3 py-2 rounded-lg" style={{ backgroundColor: `${BRAND_COLORS.danger}1A` }}>
            <LogOut size={13} color={BRAND_COLORS.danger} />
            <Text className="text-xs font-bold" style={{ color: BRAND_COLORS.danger }}>Đăng xuất</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 24 }}>
        {/* Page title */}
        <View className="gap-1">
          <View className="flex-row items-center gap-2.5">
            <Shield size={28} color={BRAND_COLORS.primary} />
            <Text className="font-display font-extrabold text-3xl text-brand-text">Quản Trị Hệ Thống</Text>
          </View>
          <Text className="text-sm text-brand-textSoft">Giám sát người dùng, chuyến đi và xoay vòng API Key</Text>
        </View>

        {/* Stats Grid */}
        <Reveal>
          <View className="flex-row flex-wrap gap-4">
            {STAT_CARDS.map((s, i) => (
              <View key={i} className="p-5 rounded-2xl border border-brand-line/40 flex-row items-center gap-4 bg-brand-bgAlt/50" style={{ minWidth: 140, flex: 1 }}>
                <View className="w-12 h-12 rounded-xl items-center justify-center shrink-0" style={{ backgroundColor: s.bg }}>
                  {s.icon}
                </View>
                <View>
                  <Text className="text-[10px] font-bold text-brand-textSoft uppercase tracking-wider">{s.label}</Text>
                  <Text className="font-display font-bold text-2xl text-brand-text mt-0.5">
                    {statsLoading ? '...' : (s.value ?? 0)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Reveal>

        {/* Tabs */}
        <View className="flex-row border-b border-brand-line/40 gap-0">
          {(['users','trips','keys'] as const).map(tab => {
            const labels = { users: 'Người dùng', trips: 'Chuyến đi', keys: 'Gemini Keys' };
            const active = activeTab === tab;
            return (
              <Pressable key={tab} onPress={() => setActiveTab(tab)} className="px-5 py-3 border-b-2" style={{ borderBottomColor: active ? BRAND_COLORS.primary : 'transparent' }}>
                <Text className={`font-bold text-sm ${active ? 'text-brand-primary' : 'text-brand-textSoft'}`}>{labels[tab]}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── USERS TAB ───────────────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <View className="rounded-2xl border border-brand-line/40 overflow-hidden bg-brand-bgAlt/30">
            <TableHeader cols={['Tên / Email', 'Ngày đăng ký', 'Trạng thái', '']} />
            {usersLoading ? (
              <View className="py-12 items-center gap-2">
                <ActivityIndicator color={BRAND_COLORS.primary} />
                <Text className="text-xs text-brand-textSoft">Đang tải danh sách thành viên...</Text>
              </View>
            ) : !users?.length ? (
              <Text className="text-center py-12 text-brand-textSoft text-sm">Chưa có người dùng nào.</Text>
            ) : users.map(u => (
              <View key={u.id} className="flex-row items-center px-4 py-4 border-b border-brand-line/20 gap-2">
                {/* Name + email */}
                <View className="flex-1 gap-0.5">
                  <Text className="font-bold text-sm text-brand-text" numberOfLines={1}>{u.full_name || 'Khách Vô Danh'}</Text>
                  <View className="flex-row items-center gap-1">
                    <Mail size={11} color={BRAND_COLORS.textSoft} />
                    <Text className="text-[11px] text-brand-textSoft" numberOfLines={1}>{u.email}</Text>
                  </View>
                </View>
                {/* Date */}
                <Text className="text-xs text-brand-textSoft w-20 text-center">{formatDate(u.created_at)}</Text>
                {/* Status toggle */}
                <View className="w-24 items-center">
                  {u.email === 'mockuser@vivu.vn' || ADMIN_EMAILS.includes(u.email) ? (
                    <View className="px-2 py-0.5 rounded" style={{ backgroundColor: `${BRAND_COLORS.accent}1A` }}>
                      <Text className="text-[10px] font-bold uppercase" style={{ color: BRAND_COLORS.accent }}>Hệ thống</Text>
                    </View>
                  ) : (
                    <Pressable onPress={() => confirmToggleBan(u.id, u.email, !!u.banned_until)} className="flex-row items-center gap-1">
                      <View className="w-9 h-5 rounded-full items-center justify-center" style={{ backgroundColor: u.banned_until ? `${BRAND_COLORS.danger}20` : `${BRAND_COLORS.primary}20` }}>
                        <View className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: u.banned_until ? BRAND_COLORS.danger : BRAND_COLORS.primary, marginLeft: u.banned_until ? -6 : 6 }} />
                      </View>
                      <Text className="text-[10px] font-bold" style={{ color: u.banned_until ? BRAND_COLORS.danger : BRAND_COLORS.primary }}>
                        {u.banned_until ? 'Bị khóa' : 'Hoạt động'}
                      </Text>
                    </Pressable>
                  )}
                </View>
                {/* Delete */}
                <Pressable
                  onPress={() => confirmDeleteUser(u.id, u.email)}
                  disabled={u.email === 'mockuser@vivu.vn'}
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: `${BRAND_COLORS.danger}1A`, opacity: u.email === 'mockuser@vivu.vn' ? 0.3 : 1 }}
                >
                  <Trash2 size={15} color={BRAND_COLORS.danger} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* ── TRIPS TAB ───────────────────────────────────────────────────── */}
        {activeTab === 'trips' && (
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
                  {/* Row 1: Title + actions */}
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
                      <Pressable onPress={() => router.push(`/chuyen-di/${t.id}` as any)} className="p-2 rounded-lg" style={{ backgroundColor: `${BRAND_COLORS.primary}1A` }}>
                        <ChevronRight size={14} color={BRAND_COLORS.primary} />
                      </Pressable>
                      <Pressable onPress={() => confirmDeleteTrip(t.id, t.title)} className="p-2 rounded-lg" style={{ backgroundColor: `${BRAND_COLORS.danger}1A` }}>
                        <Trash2 size={14} color={BRAND_COLORS.danger} />
                      </Pressable>
                    </View>
                  </View>
                  {/* Owner */}
                  <Text className="text-[11px] text-brand-textSoft">Chủ sở hữu: <Text className="font-semibold">{t.user_email}</Text></Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── KEYS TAB ────────────────────────────────────────────────────── */}
        {activeTab === 'keys' && (
          <View className="gap-8">
            {/* Add keys form */}
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

            {/* Keys table */}
            <View className="gap-3">
              <View className="flex-row items-center gap-2">
                <BarChart3 size={15} color={BRAND_COLORS.primary} />
                <Text className="font-bold text-base text-brand-text">Danh sách Keys đang xoay vòng</Text>
              </View>
              <View className="rounded-2xl border border-brand-line/40 overflow-hidden bg-brand-bgAlt/30">
                <TableHeader cols={['API Key', 'Ngày thêm', 'Trạng thái', 'Xoay', '']} />
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
                    <View key={k.id} className="flex-row items-center px-4 py-4 border-b border-brand-line/20 gap-2">
                      {/* Key value */}
                      <View className="flex-1 flex-row items-center gap-2">
                        <Text className="text-[11px] font-mono text-brand-textSoft flex-1" numberOfLines={1}>
                          {visibleKeys[k.id] ? k.key_value : maskKey(k.key_value)}
                        </Text>
                        <Pressable onPress={() => setVisibleKeys(p => ({ ...p, [k.id]: !p[k.id] }))} className="p-1 rounded bg-brand-line/10">
                          <Eye size={13} color={BRAND_COLORS.textSoft} />
                        </Pressable>
                      </View>
                      {/* Date */}
                      <Text className="text-[11px] text-brand-textSoft w-16 text-center">{formatDate(k.created_at)}</Text>
                      {/* Status + reset */}
                      <View className="gap-1 items-center">
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
                      {/* Toggle rotation */}
                      <Pressable onPress={() => confirmToggleRotation(k.id, k.key_value, k.is_active, k.status)} className="px-2">
                        <View className="w-10 h-5 rounded-full items-center justify-center" style={{ backgroundColor: k.is_active ? `${BRAND_COLORS.primary}20` : `${BRAND_COLORS.textSoft}20` }}>
                          <View className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: k.is_active ? BRAND_COLORS.primary : BRAND_COLORS.textSoft, marginLeft: k.is_active ? 6 : -6 }} />
                        </View>
                      </Pressable>
                      {/* Delete */}
                      <Pressable onPress={() => confirmDeleteKey(k.id, k.key_value)} className="p-2 rounded-lg" style={{ backgroundColor: `${BRAND_COLORS.danger}1A` }}>
                        <Trash2 size={14} color={BRAND_COLORS.danger} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Custom Confirmation Modal */}
      {confirmModal && confirmModal.visible && (
        <View className="absolute inset-0 z-50 items-center justify-center bg-black/60 px-4">
          <View 
            className="bg-brand-bg border border-brand-line/60 rounded-2xl p-6 max-w-md w-full shadow-2xl"
            style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 }}
          >
            <View className="flex-row items-center gap-2 mb-3">
              <AlertTriangle size={22} color={confirmModal.isDestructive ? BRAND_COLORS.danger : BRAND_COLORS.accent} />
              <Text className="text-lg font-display font-extrabold text-brand-text">{confirmModal.title}</Text>
            </View>
            <Text className="text-xs text-brand-textSoft leading-relaxed mb-6">
              {confirmModal.message}
            </Text>
            <View className="flex-row justify-end gap-3">
              <Pressable 
                onPress={() => setConfirmModal(null)}
                className="px-4 py-2.5 rounded-xl border border-brand-line/60 bg-brand-bgAlt/50"
              >
                <Text className="text-xs font-bold text-brand-textSoft">{confirmModal.cancelText}</Text>
              </Pressable>
              <Pressable 
                onPress={confirmModal.onConfirm}
                className="px-4 py-2.5 rounded-xl"
                style={{ backgroundColor: confirmModal.isDestructive ? BRAND_COLORS.danger : BRAND_COLORS.primary }}
              >
                <Text className="text-xs font-bold text-white">{confirmModal.confirmText}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
