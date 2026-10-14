import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import {
  Users,
  UserCheck,
  Crown,
  Ban,
  Unlock,
  Coins,
  Edit3,
  Trash2,
  RefreshCw,
  Mail,
  Phone,
  Shield,
  Sparkles,
  Calendar,
} from 'lucide-react-native';
import { BRAND_COLORS, UserRole } from '../../constants';
import { useAuth } from '../../hooks/useAuth';
import {
  PageHeader,
  Card,
  StatCard,
  DataTable,
  Badge,
  Button,
  SearchInput,
  FilterChips,
  Modal,
  ConfirmDialog,
  Field,
  Input,
  Select,
  Pagination,
  useAdminToast,
  formatVND,
  formatDate,
} from '../../components/admin/ui';
import {
  useAdminUsers,
  useUpdateUserCredits,
  useUpdateUserProfile,
  useToggleUserBan,
  useUpdateUserRole,
  useDeleteUser,
  AdminUserItem,
} from '../../lib/adminApi';
import { clearCache } from '../../lib/cache';
import { cancelTripReminder } from '../../lib/notifications';

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const { showToast } = useAdminToast();

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Query users
  const { data, isLoading, isFetching, refetch } = useAdminUsers({
    search: searchTerm,
    filter: filterType,
    page,
    limit,
  });

  const users = data?.users || [];
  const summary = data?.summary;
  const totalPages = data?.totalPages || 1;
  const totalItems = data?.total || 0;

  // Mutations
  const updateUserCredits = useUpdateUserCredits();
  const updateUserProfile = useUpdateUserProfile();
  const toggleUserBan = useToggleUserBan();
  const updateUserRole = useUpdateUserRole();
  const deleteUser = useDeleteUser();

  // Credit Modal state
  const [creditUser, setCreditUser] = useState<AdminUserItem | null>(null);
  const [creditWallet, setCreditWallet] = useState<'free' | 'permanent' | 'monthly'>('free');
  const [freeCreditsInput, setFreeCreditsInput] = useState('0');
  const [creditMode, setCreditMode] = useState<'set' | 'adjust' | 'revoke'>('set');
  const [proCreditsInput, setProCreditsInput] = useState('0');
  const [monthlyCreditsInput, setMonthlyCreditsInput] = useState('0');
  const [monthlyDaysInput, setMonthlyDaysInput] = useState('30');
  const [creditNote, setCreditNote] = useState('');

  const openCreditModal = (user: AdminUserItem) => {
    setCreditUser(user);
    setCreditMode('set');
    setCreditWallet('free');
    setFreeCreditsInput(String(user.freeRemaining ?? Math.max(0, user.freeTotal - user.freeUsed)));
    setProCreditsInput(String(user.proCredits ?? 0));
    setMonthlyCreditsInput(String(user.rawMonthlyCredits ?? user.monthlyCredits ?? 0));
    setMonthlyDaysInput(String(user.monthlyRemainingDays > 0 ? user.monthlyRemainingDays : 30));
    setCreditNote('');
  };

  const resetCreditInputs = (wallet: 'free' | 'permanent' | 'monthly', mode: 'set' | 'adjust' | 'revoke') => {
    setCreditWallet(wallet); setCreditMode(mode);
    setFreeCreditsInput(mode === 'set' ? String(creditUser?.freeRemaining ?? Math.max(0, (creditUser?.freeTotal || 0) - (creditUser?.freeUsed || 0))) : '0');
    setProCreditsInput(mode === 'set' ? String(creditUser?.proCredits || 0) : '0');
    setMonthlyCreditsInput(mode === 'set' ? String(creditUser?.rawMonthlyCredits ?? creditUser?.monthlyCredits ?? 0) : '0');
    setMonthlyDaysInput(mode === 'set' ? String(creditUser?.monthlyRemainingDays || 30) : '0');
  };
  const creditPreview = useMemo(() => {
    if (!creditUser) return null;
    const current = creditWallet === 'free' ? creditUser.freeRemaining ?? Math.max(0, creditUser.freeTotal - creditUser.freeUsed) : creditWallet === 'permanent' ? creditUser.proCredits : creditUser.monthlyCredits;
    if (creditMode === 'revoke') return { current, next: 0 };
    const text = creditWallet === 'free' ? freeCreditsInput : creditWallet === 'permanent' ? proCreditsInput : monthlyCreditsInput;
    if (!/^-?\d+$/.test(text)) return null;
    const value = Number(text);
    const next = creditMode === 'adjust' ? current + value : value;
    if (!Number.isSafeInteger(next) || next < 0) return null;
    return { current, next };
  }, [creditUser, creditWallet, creditMode, freeCreditsInput, proCreditsInput, monthlyCreditsInput]);
  const handleSaveCredits = async () => {
    if (!creditUser || updateUserCredits.isPending) return;
    if (!creditPreview) return showToast('Nhập số nguyên hợp lệ; số lượt sau điều chỉnh không được âm.', 'error');
    const payload: any = { mode: creditMode, targetWallet: creditWallet, note: creditNote.trim() || undefined };
    if (creditMode !== 'revoke') {
      const text = creditWallet === 'free' ? freeCreditsInput : creditWallet === 'permanent' ? proCreditsInput : monthlyCreditsInput;
      if (creditMode === 'set' && Number(text) < 0) return showToast('Số lượt đặt lại không được âm.', 'error');
      payload[creditWallet === 'free' ? (creditMode === 'set' ? 'freeRemaining' : 'freeDelta') : creditWallet === 'permanent' ? (creditMode === 'set' ? 'proCredits' : 'proDelta') : (creditMode === 'set' ? 'monthlyCredits' : 'monthlyDelta')] = Number(text);
      if (creditWallet === 'monthly') {
        if (!/^-?\d+$/.test(monthlyDaysInput) || !Number.isSafeInteger(Number(monthlyDaysInput)) || (creditMode === 'set' && Number(monthlyDaysInput) < 0)) return showToast('Nhập số ngày nguyên hợp lệ.', 'error');
        if (creditMode === 'set' && Number(text) > 0 && Number(monthlyDaysInput) <= 0) return showToast('Lượt Pro có hạn phải có số ngày hiệu lực lớn hơn 0.', 'error');
        payload[creditMode === 'set' ? 'monthlyDays' : 'daysDelta'] = Number(monthlyDaysInput);
      }
    }
    try {
      await updateUserCredits.mutateAsync({ userId: creditUser.id, payload });
      showToast('Đã cập nhật ví đã chọn; hai ví còn lại được giữ nguyên.', 'success'); setCreditUser(null);
    } catch (err: any) { showToast(err.response?.data?.error || err.message || 'Lỗi cập nhật ví lượt', 'error'); }
  };

  // Edit Profile Modal state
  const [editUser, setEditUser] = useState<AdminUserItem | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editQuotaTotal, setEditQuotaTotal] = useState('3');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [editRole, setEditRole] = useState<'user' | 'admin'>('user');

  const openEditModal = (user: AdminUserItem) => {
    setEditUser(user);
    setEditFullName(user.fullName || '');
    setEditPhone(user.phone || '');
    setEditQuotaTotal(String(user.freeTotal ?? 3));
    setEditNewPassword('');
    setEditRole(user.role === 'admin' ? 'admin' : 'user');
  };

  const handleSaveProfile = async () => {
    if (!editUser) return;
    if (!/^\d+$/.test(editQuotaTotal) || !Number.isSafeInteger(Number(editQuotaTotal)) || Number(editQuotaTotal) < editUser.freeUsed) {
      return showToast('Tổng lượt Free phải là số nguyên và không nhỏ hơn số lượt đã dùng. Để cộng lượt còn lại, dùng Quản lý 3 ví lượt.', 'error');
    }
    try {
      await updateUserProfile.mutateAsync({
        userId: editUser.id,
        payload: {
          fullName: editFullName.trim(),
          phone: editPhone.trim() || undefined,
          quotaTotal: Number(editQuotaTotal),
          newPassword: editNewPassword.trim() ? editNewPassword.trim() : undefined,
        },
      });

      const isSelf = editUser.id === currentUser?.id || editUser.email === 'team89a6@gmail.com';
      if (!isSelf && editRole !== editUser.role) {
        await updateUserRole.mutateAsync({
          userId: editUser.id,
          role: editRole,
        });
      }

      showToast('Đã cập nhật thông tin người dùng thành công!', 'success');
      setEditUser(null);
    } catch (err: any) {
      showToast(err.response?.data?.error || err.message || 'Lỗi cập nhật người dùng', 'error');
    }
  };

  // Ban / Unban confirm state
  const [userToToggleBan, setUserToToggleBan] = useState<AdminUserItem | null>(null);
  const isTargetBanned = Boolean(
    userToToggleBan?.bannedUntil && new Date(userToToggleBan.bannedUntil) > new Date()
  );

  const handleToggleBan = async () => {
    if (!userToToggleBan) return;
    try {
      const res = await toggleUserBan.mutateAsync(userToToggleBan.id);
      showToast(res.message || 'Đã thay đổi trạng thái tài khoản!', 'success');
      setUserToToggleBan(null);
    } catch (err: any) {
      showToast(err.response?.data?.error || err.message || 'Lỗi thao tác khóa tài khoản', 'error');
    }
  };

  // Delete User confirm state
  const [userToDelete, setUserToDelete] = useState<AdminUserItem | null>(null);

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      const res = await deleteUser.mutateAsync(userToDelete.id);
      const tripIds = res.deletedTripIds || [];
      tripIds.forEach((tripId: string) => {
        cancelTripReminder(tripId);
        clearCache(`trip_${tripId}`);
      });
      showToast('Đã xóa người dùng và toàn bộ dữ liệu liên quan!', 'success');
      setUserToDelete(null);
    } catch (err: any) {
      showToast(err.response?.data?.error || err.message || 'Lỗi khi xóa người dùng', 'error');
    }
  };

  // Table columns definition
  const columns = [
    {
      key: 'user',
      title: 'Người dùng',
      width: 250,
      render: (u: AdminUserItem) => {
        const initial = (u.fullName || u.email || 'U').charAt(0).toUpperCase();
        const isAdmin = u.role === UserRole.ADMIN;
        return (
          <View className="flex-row items-center gap-3">
            <View
              className="w-9 h-9 rounded-full items-center justify-center border"
              style={{
                backgroundColor: isAdmin ? 'rgba(31, 111, 84, 0.15)' : '#F3F4F6',
                borderColor: isAdmin ? BRAND_COLORS.primary : BRAND_COLORS.line,
              }}
            >
              <Text
                className="font-bold text-xs"
                style={{ color: isAdmin ? BRAND_COLORS.primary : BRAND_COLORS.textSoft }}
              >
                {initial}
              </Text>
            </View>
            <View className="flex-1 justify-center">
              <View className="flex-row items-center gap-1.5 flex-wrap">
                <Text className="font-bold text-xs text-brand-text" numberOfLines={1}>
                  {u.fullName || 'Chưa đặt tên'}
                </Text>
                <Badge
                  size="sm"
                  tone={isAdmin ? 'brand' : 'neutral'}
                  label={isAdmin ? 'Admin' : 'User'}
                />
              </View>
              <Text className="text-[11px] text-brand-textSoft mt-0.5" numberOfLines={1}>
                {u.email}
              </Text>
              {u.phone ? (
                <Text className="text-[10px] text-brand-textMuted" numberOfLines={1}>
                  {u.phone}
                </Text>
              ) : null}
            </View>
          </View>
        );
      },
    },
    {
      key: 'credits',
      title: 'Gói & Ví lượt',
      width: 260,
      render: (u: AdminUserItem) => {
        const hasPro = u.remainingTrips > 0;
        return (
          <View className="gap-1">
            <View className="flex-row items-center gap-1.5">
              <Badge
                size="sm"
                tone={hasPro ? 'brand' : 'neutral'}
                label={hasPro ? `PRO (${u.remainingTrips} lượt)` : 'FREE'}
              />
            </View>
            <Text className="text-[11px] text-brand-text font-medium">
              • Pro không thời hạn: <Text className="font-bold text-brand-primary">{u.proCredits}</Text> lượt
            </Text>
            <Text className="text-[11px] text-brand-text font-medium">
              • Pro có hạn: <Text className="font-bold text-brand-primary">{u.monthlyCredits}</Text> lượt{' '}
              {u.monthlyRemainingDays > 0 ? (
                <Text className="text-emerald-700">({u.monthlyRemainingDays} ngày còn lại)</Text>
              ) : (
                <Text className="text-brand-textMuted">({u.monthlyUntil ? `Hết hạn ${new Date(u.monthlyUntil).toLocaleDateString('vi-VN')}` : 'Chưa có thời hạn'})</Text>
              )}
            </Text>
            <Text className="text-[10px] text-brand-textMuted">
              • Free: còn {u.freeRemaining ?? Math.max(0, u.freeTotal - u.freeUsed)} lượt • đã dùng {u.freeUsed} / {u.freeTotal}
            </Text>
          </View>
        );
      },
    },
    {
      key: 'activity',
      title: 'Chi tiêu & Hoạt động',
      width: 190,
      render: (u: AdminUserItem) => (
        <View className="gap-0.5">
          <Text className="text-xs font-bold text-brand-text">
            {formatVND(u.totalSpent)}{' '}
            <Text className="text-[11px] font-normal text-brand-textMuted">
              ({u.ordersCount} đơn)
            </Text>
          </Text>
          <Text className="text-[11px] text-brand-textSoft">
            {u.tripsCount} chuyến đi
          </Text>
          <Text className="text-[10px] text-brand-textMuted">
            Đăng ký: {formatDate(u.createdAt)}
          </Text>
        </View>
      ),
    },
    {
      key: 'status',
      title: 'Trạng thái',
      width: 120,
      align: 'center' as const,
      render: (u: AdminUserItem) => {
        const isBanned = Boolean(u.bannedUntil && new Date(u.bannedUntil) > new Date());
        return (
          <Badge
            size="sm"
            tone={isBanned ? 'danger' : 'success'}
            label={isBanned ? 'Bị khóa' : 'Hoạt động'}
            dot
          />
        );
      },
    },
    {
      key: 'actions',
      title: 'Thao tác',
      width: 260,
      align: 'right' as const,
      render: (u: AdminUserItem) => {
        const isBanned = Boolean(u.bannedUntil && new Date(u.bannedUntil) > new Date());
        const isSelf = currentUser?.id === u.id;
        const isAdmin = u.role === UserRole.ADMIN;

        return (
          <View className="flex-row items-center gap-1.5 flex-wrap justify-end">
            <Button
              size="sm"
              variant="secondary"
              icon={<Coins size={12} color={BRAND_COLORS.primary} />}
              label="Ví lượt"
              testID={`admin-user-wallet-${u.id}`}
              disabled={isAdmin}
              onPress={() => openCreditModal(u)}
            />
            <Button
              size="sm"
              variant="outline"
              icon={<Edit3 size={12} color={BRAND_COLORS.text} />}
              label="Sửa"
              onPress={() => openEditModal(u)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={isSelf}
              icon={
                isBanned ? (
                  <Unlock size={12} color="#059669" />
                ) : (
                  <Ban size={12} color="#DC2626" />
                )
              }
              label={isBanned ? 'Mở' : 'Khóa'}
              onPress={() => setUserToToggleBan(u)}
            />
            <Button
              size="sm"
              variant="danger"
              disabled={isSelf}
              icon={<Trash2 size={12} color="#FFFFFF" />}
              label="Xóa"
              onPress={() => setUserToDelete(u)}
            />
          </View>
        );
      },
    },
  ];

  return (
    <ScrollView
      className="flex-1 bg-brand-bg"
      contentContainerStyle={{ padding: 20, gap: 20 }}
    >
      {/* 1. Header */}
      <PageHeader
        title="Quản lý Người dùng"
        description="Theo dõi danh sách tài khoản, phân quyền, số dư 2 ví lượt Pro và lịch sử hoạt động"
        action={
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw size={13} color={BRAND_COLORS.primary} />}
            label="Làm mới"
            loading={isFetching}
            onPress={() => refetch()}
          />
        }
      />

      {/* 2. Stat Cards */}
      <View className="flex-row flex-wrap gap-4">
        <View className="min-w-[200px] flex-1">
          <StatCard
            label="Tổng người dùng"
            value={summary?.total ?? 0}
            icon={<Users size={18} color="#1F6F54" />}
            iconBg="rgba(31, 111, 84, 0.1)"
            loading={isLoading}
          />
        </View>
        <View className="min-w-[200px] flex-1">
          <StatCard
            label="Người dùng Pro"
            value={summary?.pro ?? 0}
            icon={<Crown size={18} color="#D97706" />}
            iconBg="rgba(245, 158, 11, 0.15)"
            loading={isLoading}
          />
        </View>
        <View className="min-w-[200px] flex-1">
          <StatCard
            label="Người dùng Free"
            value={summary?.free ?? 0}
            icon={<UserCheck size={18} color="#2563EB" />}
            iconBg="rgba(37, 99, 235, 0.1)"
            loading={isLoading}
          />
        </View>
        <View className="min-w-[200px] flex-1">
          <StatCard
            label="Tài khoản bị khóa"
            value={summary?.banned ?? 0}
            icon={<Ban size={18} color="#DC2626" />}
            iconBg="rgba(220, 38, 38, 0.1)"
            loading={isLoading}
          />
        </View>
      </View>

      {/* 3. Main Card with Search, Filters, DataTable & Pagination */}
      <Card padding="none">
        {/* Search & Filters Header */}
        <View className="p-4 border-b border-brand-line/20 gap-3">
          <View className="flex-row items-center justify-between gap-3 flex-wrap">
            <View className="flex-1 min-w-[280px]">
              <SearchInput
                value={searchTerm}
                onChangeText={(text) => {
                  setSearchTerm(text);
                  setPage(1);
                }}
                placeholder="Tìm theo tên, email hoặc số điện thoại..."
              />
            </View>
          </View>

          <FilterChips
            options={[
              { value: 'all', label: 'Tất cả', count: summary?.total },
              { value: 'pro', label: 'Người dùng Pro', count: summary?.pro },
              { value: 'free', label: 'Người dùng Free', count: summary?.free },
              { value: 'admin', label: 'Quản trị viên', count: summary?.admins },
              { value: 'banned', label: 'Đang bị khóa', count: summary?.banned },
            ]}
            value={filterType}
            onChange={(val) => {
              setFilterType(val);
              setPage(1);
            }}
          />
        </View>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={users}
          keyExtractor={(u) => u.id}
          loading={isLoading}
          emptyTitle="Không có người dùng nào"
          emptyMessage="Không tìm thấy người dùng phù hợp với từ khóa hoặc bộ lọc đã chọn."
          minWidth={1080}
        />

        {/* Pagination Footer */}
        <View className="p-3 border-t border-brand-line/20">
          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            limit={limit}
            onPageChange={(newPage) => setPage(newPage)}
            disabled={isLoading || isFetching}
          />
        </View>
      </Card>

      {/* 4. CreditModal: Quản lý 3 ví lượt */}
      <Modal
        visible={Boolean(creditUser)}
        onClose={() => !updateUserCredits.isPending && setCreditUser(null)}
        title="Quản lý 3 ví lượt"
        subtitle={creditUser ? `${creditUser.fullName} (${creditUser.email})` : ''}
        maxWidth={540}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              label="Hủy"
              disabled={updateUserCredits.isPending}
              onPress={() => setCreditUser(null)}
            />
            <Button
              variant="primary"
              size="sm"
              label="Lưu thay đổi"
              testID="admin-wallet-save"
              loading={updateUserCredits.isPending}
              onPress={handleSaveCredits}
            />
          </>
        }
      >
        <View className="gap-4">
          <View className="p-3 rounded-xl bg-slate-50 border border-brand-line gap-1">
            <Text className="text-xs font-bold">Free: còn {creditUser?.freeRemaining ?? Math.max(0, (creditUser?.freeTotal || 0) - (creditUser?.freeUsed || 0))} • đã dùng {creditUser?.freeUsed || 0} / tổng {creditUser?.freeTotal || 0}</Text>
            <Text className="text-xs">Pro không thời hạn: {creditUser?.proCredits || 0} lượt</Text>
            <Text className="text-xs">Pro có hạn: {creditUser?.monthlyCredits || 0} lượt khả dụng • {creditUser?.monthlyUntil ? `hạn ${new Date(creditUser.monthlyUntil).toLocaleDateString('vi-VN')}${creditUser.monthlyRemainingDays <= 0 ? ' (đã hết hạn)' : ''}` : 'chưa có thời hạn'}</Text>
          </View>
          <Field label="Ví cần điều chỉnh">
            <Select value={creditWallet} disabled={updateUserCredits.isPending} options={[{value:'free',label:'Free — AI Tiêu chuẩn'},{value:'permanent',label:'Pro không thời hạn'},{value:'monthly',label:'Pro có hạn'}]} onChange={value=>resetCreditInputs(value as any, creditMode)} />
          </Field>
          <Field label="Chế độ cập nhật">
            <FilterChips
              options={[
                { value: 'set', label: 'Đặt lại (Set)' },
                { value: 'adjust', label: 'Cộng/Trừ (+/-)' },
                { value: 'revoke', label: 'Thu hồi ví đã chọn' },
              ]}
              value={creditMode}
              onChange={(val) => !updateUserCredits.isPending && resetCreditInputs(creditWallet, val as any)}
            />
          </Field>

          {creditMode === 'revoke' ? (
            <View className="p-3 rounded-xl bg-red-50 border border-red-200"><Text className="text-xs text-red-800">Thu hồi toàn bộ lượt của ví đã chọn. Hai ví khác và lịch sử Free đã dùng được giữ nguyên.</Text></View>
          ) : (
            <>
              <Field label={creditMode === 'set' ? 'Số lượt còn lại của ví đã chọn' : 'Cộng / trừ lượt (+ / -)'} hint={creditWallet === 'free' ? 'Chỉ thay đổi lượt Free còn lại; giữ nguyên số lượt đã dùng.' : creditWallet === 'permanent' ? 'Lượt Pro này không có ngày hết hạn.' : 'Lượt Pro chỉ khả dụng trước ngày hết hạn.'}>
                <Input testID="admin-wallet-amount" value={creditWallet === 'free' ? freeCreditsInput : creditWallet === 'permanent' ? proCreditsInput : monthlyCreditsInput} onChangeText={value=>{if(updateUserCredits.isPending)return; if(creditWallet==='free')setFreeCreditsInput(value);else if(creditWallet==='permanent')setProCreditsInput(value);else setMonthlyCreditsInput(value);}} keyboardType="numbers-and-punctuation" placeholder="0" />
              </Field>
              {creditWallet === 'monthly' && <Field label={creditMode === 'set' ? 'Số ngày hiệu lực kể từ hiện tại' : 'Cộng / trừ thời hạn (ngày)'} hint={creditMode === 'set' ? 'Ví Pro có hạn cần ngày hết hạn riêng.' : '0 giữ nguyên thời hạn; số dương gia hạn, số âm rút ngắn.'}><Input testID="admin-wallet-days" value={monthlyDaysInput} onChangeText={value=>!updateUserCredits.isPending && setMonthlyDaysInput(value)} keyboardType="numbers-and-punctuation" /></Field>}
            </>
          )}

          {creditWallet === 'monthly' && creditMode === 'adjust' && creditUser?.monthlyUntil && creditUser.monthlyRemainingDays <= 0 && <Text className="text-xs text-amber-800">Gói cũ đã hết hạn. Lượt cũ không được khôi phục. Chỉ lượt cộng thêm được giữ; cần gia hạn thêm ngày để sử dụng.</Text>}
          <Field label="Lý do điều chỉnh (ghi chú hệ thống)">
            <Input
              value={creditNote}
              onChangeText={setCreditNote}
              placeholder="VD: Khách hàng thanh toán qua ngân hàng, CSKH bù lượt..."
            />
          </Field>

          {creditPreview && <View className="p-3 rounded-xl bg-emerald-50 border border-emerald-200"><Text className="text-xs text-emerald-900">Ví đã chọn: {creditPreview.current} → {creditPreview.next} lượt. Hai ví khác giữ nguyên.</Text></View>}
        </View>
      </Modal>

      {/* 5. EditUserModal: Chỉnh sửa thông tin cá nhân */}
      <Modal
        visible={Boolean(editUser)}
        onClose={() => setEditUser(null)}
        title="Chỉnh sửa thông tin người dùng"
        subtitle={editUser?.email}
        maxWidth={500}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              label="Hủy"
              onPress={() => setEditUser(null)}
            />
            <Button
              variant="primary"
              size="sm"
              label="Lưu thông tin"
              loading={updateUserProfile.isPending || updateUserRole.isPending}
              onPress={handleSaveProfile}
            />
          </>
        }
      >
        <View className="gap-3.5">
          <Field label="Họ và tên" required>
            <Input
              value={editFullName}
              onChangeText={setEditFullName}
              placeholder="Nguyễn Văn A"
            />
          </Field>

          <Field label="Số điện thoại">
            <Input
              value={editPhone}
              onChangeText={setEditPhone}
              keyboardType="phone-pad"
              placeholder="0912345678"
            />
          </Field>

          <Field
            label="Hạn mức chuyến miễn phí (Quota)"
            hint={`Tổng lượt gồm ${editUser?.freeUsed || 0} lượt đã dùng. Để cộng lượt còn lại, dùng Quản lý 3 ví lượt.`}
          >
            <Input
              value={editQuotaTotal}
              onChangeText={setEditQuotaTotal}
              keyboardType="numeric"
              placeholder="3"
            />
          </Field>

          {editUser?.id === currentUser?.id || editUser?.email === 'team89a6@gmail.com' ? (
            <View className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 gap-1">
              <Text className="text-xs font-bold text-amber-800">
                🛡️ Bạn không thể tự thay đổi vai trò tài khoản của chính mình.
              </Text>
            </View>
          ) : (
            <Field
              label="Vai trò tài khoản"
              hint="Quản trị viên có toàn quyền truy cập khu vực Admin"
            >
              <Select
                options={[
                  { value: 'user', label: 'Người dùng tiêu chuẩn (User)' },
                  { value: 'admin', label: 'Quản trị viên (Admin)' },
                ]}
                value={editRole}
                onChange={(val) => setEditRole(val as any)}
              />
            </Field>
          )}

          <Field
            label="Mật khẩu mới (tùy chọn)"
            hint="Để trống nếu không muốn đổi mật khẩu (tối thiểu 6 ký tự)"
          >
            <Input
              value={editNewPassword}
              onChangeText={setEditNewPassword}
              secureTextEntry
              placeholder="••••••••"
            />
          </Field>
        </View>
      </Modal>

      {/* 6. Confirm Dialog Toggle Ban */}
      <ConfirmDialog
        visible={Boolean(userToToggleBan)}
        title={isTargetBanned ? 'Mở khóa tài khoản' : 'Xác nhận khóa tài khoản'}
        message={
          isTargetBanned
            ? `Bạn có chắc chắn muốn mở khóa cho người dùng "${userToToggleBan?.fullName}" (${userToToggleBan?.email})? Người dùng sẽ có thể đăng nhập và hoạt động bình thường.`
            : `Bạn có chắc chắn muốn khóa tài khoản "${userToToggleBan?.fullName}" (${userToToggleBan?.email})? Người dùng sẽ bị chặn đăng nhập và thao tác trên hệ thống.`
        }
        confirmText={isTargetBanned ? 'Mở khóa ngay' : 'Khóa tài khoản'}
        cancelText="Hủy"
        isDestructive={!isTargetBanned}
        loading={toggleUserBan.isPending}
        onConfirm={handleToggleBan}
        onCancel={() => setUserToToggleBan(null)}
      />

      {/* 7. Confirm Dialog Delete User */}
      <ConfirmDialog
        visible={Boolean(userToDelete)}
        title="Xác nhận xóa người dùng"
        message={`Bạn có chắc chắn muốn xóa vĩnh viễn người dùng "${userToDelete?.fullName}" (${userToDelete?.email})? Toàn bộ các chuyến đi, lịch trình chi tiết và dữ liệu liên quan sẽ bị XÓA SẠCH khỏi hệ thống.`}
        confirmText="Xóa vĩnh viễn"
        cancelText="Hủy"
        isDestructive
        loading={deleteUser.isPending}
        onConfirm={handleDeleteUser}
        onCancel={() => setUserToDelete(null)}
      />
    </ScrollView>
  );
}
