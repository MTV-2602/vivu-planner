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
  const [creditMode, setCreditMode] = useState<'set' | 'adjust' | 'revoke'>('set');
  const [proCreditsInput, setProCreditsInput] = useState('0');
  const [monthlyCreditsInput, setMonthlyCreditsInput] = useState('0');
  const [monthlyDaysInput, setMonthlyDaysInput] = useState('30');
  const [creditNote, setCreditNote] = useState('');

  const openCreditModal = (user: AdminUserItem) => {
    setCreditUser(user);
    setCreditMode('set');
    setProCreditsInput(String(user.proCredits ?? 0));
    setMonthlyCreditsInput(String(user.monthlyCredits ?? 0));
    setMonthlyDaysInput(String(user.monthlyRemainingDays > 0 ? user.monthlyRemainingDays : 30));
    setCreditNote('');
  };

  const creditPreview = useMemo(() => {
    if (!creditUser) return null;
    const curPro = creditUser.proCredits ?? 0;
    const curMonthly = creditUser.monthlyCredits ?? 0;
    const curDays = creditUser.monthlyRemainingDays ?? 0;

    if (creditMode === 'revoke') {
      return { pro: 0, monthly: 0, days: 0, isPro: false };
    }

    const proVal = parseInt(proCreditsInput, 10) || 0;
    const monthlyVal = parseInt(monthlyCreditsInput, 10) || 0;
    const daysVal = parseInt(monthlyDaysInput, 10) || 0;

    if (creditMode === 'set') {
      const nextPro = Math.max(0, proVal);
      const nextMonthly = Math.max(0, monthlyVal);
      const nextDays = Math.max(0, daysVal);
      return {
        pro: nextPro,
        monthly: nextMonthly,
        days: nextDays,
        isPro: nextPro + (nextDays > 0 ? nextMonthly : 0) > 0,
      };
    }

    const nextPro = Math.max(0, curPro + proVal);
    const nextMonthly = Math.max(0, curMonthly + monthlyVal);
    const nextDays = Math.max(0, curDays + daysVal);
    return {
      pro: nextPro,
      monthly: nextMonthly,
      days: nextDays,
      isPro: nextPro + (nextDays > 0 ? nextMonthly : 0) > 0,
    };
  }, [creditUser, creditMode, proCreditsInput, monthlyCreditsInput, monthlyDaysInput]);

  const handleSaveCredits = async () => {
    if (!creditUser) return;
    try {
      if (creditMode === 'revoke') {
        await updateUserCredits.mutateAsync({
          userId: creditUser.id,
          payload: { mode: 'revoke', note: creditNote.trim() || undefined },
        });
      } else if (creditMode === 'set') {
        await updateUserCredits.mutateAsync({
          userId: creditUser.id,
          payload: {
            mode: 'set',
            proCredits: Math.max(0, parseInt(proCreditsInput, 10) || 0),
            monthlyCredits: Math.max(0, parseInt(monthlyCreditsInput, 10) || 0),
            monthlyDays: Math.max(0, parseInt(monthlyDaysInput, 10) || 0),
            note: creditNote.trim() || undefined,
          },
        });
      } else {
        await updateUserCredits.mutateAsync({
          userId: creditUser.id,
          payload: {
            mode: 'adjust',
            proDelta: parseInt(proCreditsInput, 10) || 0,
            monthlyDelta: parseInt(monthlyCreditsInput, 10) || 0,
            daysDelta: parseInt(monthlyDaysInput, 10) || 0,
            note: creditNote.trim() || undefined,
          },
        });
      }
      showToast('Đã cập nhật ví lượt thành công!', 'success');
      setCreditUser(null);
    } catch (err: any) {
      showToast(err.response?.data?.error || err.message || 'Lỗi cập nhật ví lượt', 'error');
    }
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
    try {
      await updateUserProfile.mutateAsync({
        userId: editUser.id,
        payload: {
          fullName: editFullName.trim(),
          phone: editPhone.trim() || undefined,
          quotaTotal: Math.max(0, parseInt(editQuotaTotal, 10) || 0),
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
              • Mua lẻ: <Text className="font-bold text-brand-primary">{u.proCredits}</Text> lượt vĩnh viễn
            </Text>
            <Text className="text-[11px] text-brand-text font-medium">
              • Theo tháng: <Text className="font-bold text-brand-primary">{u.monthlyCredits}</Text> lượt{' '}
              {u.monthlyRemainingDays > 0 ? (
                <Text className="text-emerald-700">({u.monthlyRemainingDays} ngày còn lại)</Text>
              ) : (
                <Text className="text-brand-textMuted">(Hết hạn)</Text>
              )}
            </Text>
            <Text className="text-[10px] text-brand-textMuted">
              Quota miễn phí: {u.freeUsed} / {u.freeTotal} lượt
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

      {/* 4. CreditModal: Quản lý 2 ví lượt Pro */}
      <Modal
        visible={Boolean(creditUser)}
        onClose={() => setCreditUser(null)}
        title="Quản lý Ví lượt Pro"
        subtitle={creditUser ? `${creditUser.fullName} (${creditUser.email})` : ''}
        maxWidth={540}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              label="Hủy"
              onPress={() => setCreditUser(null)}
            />
            <Button
              variant="primary"
              size="sm"
              label="Lưu thay đổi"
              loading={updateUserCredits.isPending}
              onPress={handleSaveCredits}
            />
          </>
        }
      >
        <View className="gap-4">
          <Field label="Chế độ cập nhật">
            <FilterChips
              options={[
                { value: 'set', label: 'Đặt lại (Set)' },
                { value: 'adjust', label: 'Cộng/Trừ (+/-)' },
                { value: 'revoke', label: 'Thu hồi toàn bộ (Revoke)' },
              ]}
              value={creditMode}
              onChange={(val) => setCreditMode(val as any)}
            />
          </Field>

          {creditMode === 'revoke' ? (
            <View className="p-3.5 rounded-xl bg-red-50 border border-red-200 gap-1.5">
              <Text className="text-xs font-bold text-red-800">
                Cảnh báo thu hồi toàn bộ gói Pro:
              </Text>
              <Text className="text-xs text-red-700 leading-relaxed">
                Thao tác này sẽ hạ toàn bộ số lượt mua lẻ về 0, lượt tháng về 0 và hủy
                thời hạn gói Pro của tài khoản này ngay lập tức.
              </Text>
            </View>
          ) : (
            <>
              <Field
                label={
                  creditMode === 'set'
                    ? 'Lượt mua lẻ vĩnh viễn (pro_credits)'
                    : 'Thay đổi lượt mua lẻ (+ / -)'
                }
                hint={
                  creditMode === 'set'
                    ? 'Số lượt mua lẻ không thời hạn'
                    : 'Nhập số dương để cộng thêm, số âm để trừ bớt'
                }
              >
                <Input
                  value={proCreditsInput}
                  onChangeText={setProCreditsInput}
                  keyboardType="numbers-and-punctuation"
                  placeholder={creditMode === 'set' ? '0' : '+0'}
                />
              </Field>

              <Field
                label={
                  creditMode === 'set'
                    ? 'Lượt theo tháng (monthly_credits)'
                    : 'Thay đổi lượt theo tháng (+ / -)'
                }
                hint={
                  creditMode === 'set'
                    ? 'Số lượt có thời hạn gắn với ngày hiệu lực'
                    : 'Nhập số dương để cộng thêm, số âm để trừ bớt'
                }
              >
                <Input
                  value={monthlyCreditsInput}
                  onChangeText={setMonthlyCreditsInput}
                  keyboardType="numbers-and-punctuation"
                  placeholder={creditMode === 'set' ? '0' : '+0'}
                />
              </Field>

              <Field
                label={
                  creditMode === 'set'
                    ? 'Số ngày hiệu lực (kể từ hiện tại)'
                    : 'Thay đổi số ngày hiệu lực (+ / - ngày)'
                }
                hint={
                  creditMode === 'set'
                    ? 'Thời hạn lượt tháng (VD: 30 ngày)'
                    : 'Kéo dài (+) hoặc rút ngắn (-) thời hạn gói'
                }
              >
                <Input
                  value={monthlyDaysInput}
                  onChangeText={setMonthlyDaysInput}
                  keyboardType="numbers-and-punctuation"
                  placeholder={creditMode === 'set' ? '30' : '+0'}
                />
              </Field>
            </>
          )}

          <Field label="Lý do điều chỉnh (ghi chú hệ thống)">
            <Input
              value={creditNote}
              onChangeText={setCreditNote}
              placeholder="VD: Khách hàng thanh toán qua ngân hàng, CSKH bù lượt..."
            />
          </Field>

          {/* Preview Box */}
          {creditPreview && creditUser && (
            <View className="p-3.5 bg-slate-50 border border-brand-line/40 rounded-xl gap-2">
              <Text className="text-xs font-bold text-brand-text">
                Đối soát thay đổi ví lượt:
              </Text>
              <View className="flex-row items-center justify-between text-xs py-1 border-b border-brand-line/20">
                <Text className="text-[11px] text-brand-textSoft">Hiện tại:</Text>
                <Text className="text-[11px] font-semibold text-brand-text">
                  Mua lẻ: {creditUser.proCredits} | Tháng: {creditUser.monthlyCredits} (
                  {creditUser.monthlyRemainingDays} ngày)
                </Text>
              </View>
              <View className="flex-row items-center justify-between text-xs py-1">
                <Text className="text-[11px] font-bold text-brand-primary">Dự kiến sau đổi:</Text>
                <Text className="text-[11px] font-bold text-brand-primary">
                  Mua lẻ: {creditPreview.pro} | Tháng: {creditPreview.monthly} (
                  {creditPreview.days} ngày)
                </Text>
              </View>
            </View>
          )}
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
            hint="Số chuyến đi tạo miễn phí mặc định cho người dùng Free"
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
