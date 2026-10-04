import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import {
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Sparkles,
  ShoppingBag,
  TrendingUp,
  Calendar,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react-native';
import { BRAND_COLORS } from '../../constants';
import { supabase } from '../../lib/supabase';
import { describePlan, formatVND } from '../../lib/plans';
import {
  PageHeader,
  Card,
  Button,
  Badge,
  ConfirmDialog,
  Modal,
  Field,
  Input,
  Textarea,
  Switch,
  ErrorState,
  EmptyState,
  useAdminToast,
  formatDate,
} from '../../components/admin/ui';
import {
  useAdminPlans,
  useSaveAdminPlans,
  useDeleteAdminPlan,
  AdminPlanItem,
} from '../../lib/adminApi';

interface PlanFormData {
  id?: string;
  label: string;
  amount: string;
  quota_total_grant: string;
  duration_days: string;
  sort_order: string;
  description: string;
  is_active: boolean;
}

const INITIAL_FORM: PlanFormData = {
  label: '',
  amount: '29000',
  quota_total_grant: '3',
  duration_days: '0',
  sort_order: '0',
  description: '',
  is_active: true,
};

export default function AdminPackagesPage() {
  const { showToast } = useAdminToast();
  const [showHiddenPlans, setShowHiddenPlans] = useState(false);

  // Form modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [packageType, setPackageType] = useState<'per_turn' | 'duration'>('per_turn');
  const [formData, setFormData] = useState<PlanFormData>(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Delete confirm dialog
  const [planToDelete, setPlanToDelete] = useState<AdminPlanItem | null>(null);

  // Queries & Mutations
  const {
    data: plans,
    isLoading,
    isRefetching,
    error,
    refetch: refetchPlans,
  } = useAdminPlans();

  const saveMutation = useSaveAdminPlans();
  const deleteMutation = useDeleteAdminPlan();

  const broadcastRealtimeUpdate = () => {
    try {
      const channel = supabase.channel('pricing_realtime');
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel
            .send({
              type: 'broadcast',
              event: 'plans_updated',
              payload: { timestamp: Date.now() },
            })
            .then(() => {
              supabase.removeChannel(channel);
            });
        }
      });
    } catch (_) {}
  };

  const handleOpenAdd = () => {
    setPackageType('per_turn');
    setFormData({
      ...INITIAL_FORM,
      duration_days: '0',
      sort_order: String((plans?.length || 0) + 1),
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEdit = (plan: AdminPlanItem) => {
    const isDuration = Number(plan.duration_days) > 0;
    setPackageType(isDuration ? 'duration' : 'per_turn');
    setFormData({
      id: plan.id,
      label: plan.label,
      amount: String(plan.amount),
      quota_total_grant: String(plan.quota_total_grant),
      duration_days: String(plan.duration_days),
      sort_order: String(plan.sort_order ?? 0),
      description: plan.description || '',
      is_active: plan.is_active,
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleToggleActiveQuick = (plan: AdminPlanItem) => {
    const updatedStatus = !plan.is_active;
    saveMutation.mutate(
      [
        {
          id: plan.id,
          label: plan.label,
          amount: plan.amount,
          quota_total_grant: plan.quota_total_grant,
          duration_days: plan.duration_days,
          description: plan.description,
          sort_order: plan.sort_order,
          is_active: updatedStatus,
        },
      ],
      {
        onSuccess: () => {
          showToast(
            `Đã ${updatedStatus ? 'bật hiển thị' : 'ẩn'} gói "${plan.label}"`,
            'success'
          );
          broadcastRealtimeUpdate();
          refetchPlans();
        },
        onError: (err: any) => {
          showToast(
            `Không thể cập nhật trạng thái gói: ${err?.message || 'Lỗi kết nối'}`,
            'error'
          );
        },
      }
    );
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.label.trim()) {
      errors.label = 'Tên gói không được để trống';
    }

    const amountNum = Number(formData.amount);
    if (isNaN(amountNum) || !Number.isInteger(amountNum) || amountNum <= 0) {
      errors.amount = 'Giá gói phải là số nguyên dương lớn hơn 0';
    }

    const quotaNum = Number(formData.quota_total_grant);
    if (isNaN(quotaNum) || !Number.isInteger(quotaNum) || quotaNum < 1) {
      errors.quota_total_grant = 'Số lượt cấp phải là số nguyên tối thiểu là 1';
    }

    if (packageType === 'duration') {
      const durationNum = Number(formData.duration_days);
      if (isNaN(durationNum) || !Number.isInteger(durationNum) || durationNum < 1) {
        errors.duration_days = 'Gói theo thời hạn yêu cầu số ngày >= 1';
      }
    }

    const sortNum = Number(formData.sort_order);
    if (isNaN(sortNum) || !Number.isInteger(sortNum)) {
      errors.sort_order = 'Thứ tự hiển thị phải là số nguyên';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) return;

    const payload = {
      id: formData.id,
      label: formData.label.trim(),
      amount: Number(formData.amount),
      quota_total_grant: Number(formData.quota_total_grant),
      duration_days: packageType === 'per_turn' ? 0 : Number(formData.duration_days),
      sort_order: Number(formData.sort_order),
      description: formData.description.trim(),
      is_active: formData.is_active,
    };

    saveMutation.mutate([payload], {
      onSuccess: () => {
        showToast(
          formData.id
            ? `Cập nhật gói "${formData.label}" thành công!`
            : `Đã tạo gói mới "${formData.label}" thành công!`,
          'success'
        );
        setIsModalOpen(false);
        broadcastRealtimeUpdate();
        refetchPlans();
      },
      onError: (err: any) => {
        const resData = err?.response?.data;
        if (resData?.field && resData?.error) {
          setFormErrors((prev) => ({
            ...prev,
            [resData.field]: resData.error,
          }));
        }
        showToast(
          resData?.error || err?.message || 'Có lỗi xảy ra khi lưu gói cước',
          'error'
        );
      },
    });
  };

  const handleConfirmDelete = () => {
    if (!planToDelete) return;

    deleteMutation.mutate(planToDelete.id, {
      onSuccess: () => {
        showToast(`Đã xóa gói "${planToDelete.label}" thành công!`, 'success');
        setPlanToDelete(null);
        broadcastRealtimeUpdate();
        refetchPlans();
      },
      onError: (err: any) => {
        const res = err?.response?.data;
        if (res?.code === 'PLAN_HAS_PENDING_ORDERS') {
          showToast(
            'Không thể xóa gói này do đang có đơn hàng chờ xử lý. Bạn hãy chọn Ẩn gói thay vì Xóa.',
            'warning',
            5000
          );
        } else {
          showToast(
            res?.error || err?.message || 'Lỗi khi xóa gói cước trên hệ thống',
            'error'
          );
        }
        setPlanToDelete(null);
      },
    });
  };

  // Split active and hidden plans
  const allPlans = plans || [];
  const activePlans = allPlans.filter((p) => p.is_active);
  const hiddenPlans = allPlans.filter((p) => !p.is_active);

  // Live preview description for form modal
  const previewQuota = Number(formData.quota_total_grant) || 1;
  const previewDays = packageType === 'per_turn' ? 0 : (Number(formData.duration_days) || 0);
  const previewAmount = Number(formData.amount) || 0;
  const previewDescription = describePlan({
    quota_total_grant: previewQuota,
    duration_days: previewDays,
  });

  return (
    <ScrollView
      className="flex-1 bg-brand-bg"
      contentContainerStyle={{ padding: 24, gap: 24 }}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Header */}
      <PageHeader
        title="Quản lý Gói cước & Bảng giá"
        description="Cấu hình danh mục gói thành viên ViVu Pro, biểu phí và thời hạn sử dụng"
        action={
          <View className="flex-row items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={isRefetching}
              icon={<RefreshCw size={13} color={BRAND_COLORS.textSoft} />}
              onPress={() => refetchPlans()}
            />
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={15} color="#FFFFFF" />}
              label="Thêm gói mới"
              onPress={handleOpenAdd}
            />
          </View>
        }
      />

      {error && !plans ? (
        <ErrorState
          title="Không thể tải danh sách gói cước"
          message="Lỗi khi truy vấn API GET /admin/plans. Vui lòng kiểm tra lại dịch vụ backend."
          onRetry={() => refetchPlans()}
        />
      ) : (
        <>
          {/* 2. Danh sách gói đang kích hoạt (Active) */}
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-display font-bold text-base text-brand-text">
                Gói đang kinh doanh ({activePlans.length})
              </Text>
              <Text className="text-xs text-brand-textMuted">
                Hiển thị trực tiếp trên Modal nâng cấp người dùng
              </Text>
            </View>

            {isLoading ? (
              <View className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <View className="gap-3 py-2">
                      <View className="h-6 w-1/2 bg-slate-200 rounded-md animate-pulse" />
                      <View className="h-8 w-2/3 bg-slate-200 rounded-md animate-pulse" />
                      <View className="h-4 w-full bg-slate-200 rounded-md animate-pulse" />
                    </View>
                  </Card>
                ))}
              </View>
            ) : activePlans.length === 0 ? (
              <Card>
                <EmptyState
                  title="Chưa có gói cước nào đang bật"
                  description="Hãy bấm '+ Thêm gói mới' để thiết lập gói cước cho người dùng."
                  action={
                    <Button
                      variant="primary"
                      size="sm"
                      label="Thêm gói mới ngay"
                      onPress={handleOpenAdd}
                    />
                  }
                />
              </Card>
            ) : (
              <View className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activePlans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    onEdit={() => handleOpenEdit(plan)}
                    onToggleActive={() => handleToggleActiveQuick(plan)}
                    onDelete={() => setPlanToDelete(plan)}
                  />
                ))}
              </View>
            )}
          </View>

          {/* 3. Danh sách gói đã ẩn (Hidden Accordion) */}
          {hiddenPlans.length > 0 && (
            <View className="gap-3 pt-4 border-t border-brand-line/20">
              <Pressable
                onPress={() => setShowHiddenPlans(!showHiddenPlans)}
                className="flex-row items-center justify-between p-3 rounded-xl bg-white border border-brand-line/40 hover:bg-slate-50"
                style={{ cursor: 'pointer' as any }}
              >
                <View className="flex-row items-center gap-2">
                  <EyeOff size={16} color={BRAND_COLORS.textMuted} />
                  <Text className="text-sm font-bold text-brand-textSoft">
                    Gói đã ẩn ({hiddenPlans.length})
                  </Text>
                  <Text className="text-xs text-brand-textMuted">
                    (Không hiển thị cho người dùng)
                  </Text>
                </View>
                {showHiddenPlans ? (
                  <ChevronUp size={16} color={BRAND_COLORS.textMuted} />
                ) : (
                  <ChevronDown size={16} color={BRAND_COLORS.textMuted} />
                )}
              </Pressable>

              {showHiddenPlans && (
                <View className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
                  {hiddenPlans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      onEdit={() => handleOpenEdit(plan)}
                      onToggleActive={() => handleToggleActiveQuick(plan)}
                      onDelete={() => setPlanToDelete(plan)}
                    />
                  ))}
                </View>
              )}
            </View>
          )}
        </>
      )}

      {/* 4. Modal / Drawer Tạo & Chỉnh Sửa Gói */}
      <Modal
        visible={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={formData.id ? `Chỉnh sửa: ${formData.label}` : 'Tạo gói cước mới'}
        subtitle="Cấu hình thông tin chi tiết và định mức sử dụng của gói"
        footer={
          <>
            <Button
              variant="outline"
              size="md"
              label="Hủy bỏ"
              onPress={() => setIsModalOpen(false)}
            />
            <Button
              variant="primary"
              size="md"
              loading={saveMutation.isPending}
              label={formData.id ? 'Lưu thay đổi' : 'Tạo gói'}
              onPress={handleSave}
            />
          </>
        }
      >
        <View className="gap-4">
          {/* Tên gói */}
          <Field label="Tên hiển thị gói cước" error={formErrors.label} required>
            <Input
              value={formData.label}
              onChangeText={(text) => setFormData({ ...formData, label: text })}
              placeholder="VD: ViVu Pro 5 Chuyến"
            />
          </Field>

          {/* Lựa chọn loại gói cước */}
          <Field label="Loại gói cước" required hint="Chọn quy cách tính hạn cho gói">
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => {
                  setPackageType('per_turn');
                  setFormData((prev) => ({ ...prev, duration_days: '0' }));
                  setFormErrors((prev) => {
                    const next = { ...prev };
                    delete next.duration_days;
                    return next;
                  });
                }}
                className={`flex-1 p-3 rounded-xl border flex-row items-center justify-center gap-2 ${
                  packageType === 'per_turn'
                    ? 'border-brand-primary bg-brand-primary/10'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
                style={{ cursor: 'pointer' as any }}
              >
                <Text
                  className={`text-xs font-bold ${
                    packageType === 'per_turn' ? 'text-brand-primary' : 'text-slate-600'
                  }`}
                >
                  ⚡ Gói theo lượt (Không thời hạn)
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setPackageType('duration');
                  const currentDays = Number(formData.duration_days);
                  if (currentDays <= 0) {
                    setFormData((prev) => ({ ...prev, duration_days: '30' }));
                  }
                }}
                className={`flex-1 p-3 rounded-xl border flex-row items-center justify-center gap-2 ${
                  packageType === 'duration'
                    ? 'border-brand-primary bg-brand-primary/10'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
                style={{ cursor: 'pointer' as any }}
              >
                <Text
                  className={`text-xs font-bold ${
                    packageType === 'duration' ? 'text-brand-primary' : 'text-slate-600'
                  }`}
                >
                  👑 Gói theo thời hạn (Ngày & Lượt)
                </Text>
              </Pressable>
            </View>
          </Field>

          {/* Hàng 2: Giá VNĐ + Thứ tự */}
          <View className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Giá cước (VNĐ)" error={formErrors.amount} required hint="Nhập số nguyên, vd: 49000">
              <Input
                keyboardType="numeric"
                value={formData.amount}
                onChangeText={(text) =>
                  setFormData({ ...formData, amount: text.replace(/\D/g, '') })
                }
                placeholder="49000"
              />
            </Field>

            <Field label="Thứ tự sắp xếp" error={formErrors.sort_order} hint="Số nhỏ hơn sẽ hiển thị trước">
              <Input
                keyboardType="numeric"
                value={formData.sort_order}
                onChangeText={(text) =>
                  setFormData({ ...formData, sort_order: text.replace(/\D/g, '') })
                }
                placeholder="1"
              />
            </Field>
          </View>

          {/* Hàng 3: Lượt cấp + Thời hạn */}
          <View className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Số lượt Pro cấp" error={formErrors.quota_total_grant} required hint="Tối thiểu 1 lượt">
              <Input
                keyboardType="numeric"
                value={formData.quota_total_grant}
                onChangeText={(text) =>
                  setFormData({
                    ...formData,
                    quota_total_grant: text.replace(/\D/g, ''),
                  })
                }
                placeholder="5"
              />
            </Field>

            {packageType === 'duration' ? (
              <Field label="Thời hạn sử dụng (ngày)" error={formErrors.duration_days} required hint="Nhập số ngày hiệu lực (tối thiểu 1 ngày)">
                <Input
                  keyboardType="numeric"
                  value={formData.duration_days}
                  onChangeText={(text) =>
                    setFormData({
                      ...formData,
                      duration_days: text.replace(/\D/g, ''),
                    })
                  }
                  placeholder="30"
                />
              </Field>
            ) : (
              <Field label="Thời hạn sử dụng" hint="Không giới hạn thời hạn">
                <View className="h-10 px-3 bg-slate-100 rounded-lg justify-center border border-slate-200">
                  <Text className="text-xs text-slate-500 font-medium">
                    ⚡ Không giới hạn thời hạn (Dùng vĩnh viễn)
                  </Text>
                </View>
              </Field>
            )}
          </View>

          {/* Mô tả gói */}
          <Field label="Mô tả bổ sung (nếu có)" hint="Hiển thị chi tiết lợi ích khi người dùng xem gói">
            <Textarea
              value={formData.description}
              onChangeText={(text) =>
                setFormData({ ...formData, description: text })
              }
              placeholder="VD: Không giới hạn thời gian sử dụng, gợi ý lịch trình AI không giới hạn điểm đến..."
              rows={2}
            />
          </Field>

          {/* Bật / Tắt trạng thái */}
          <View className="p-3 bg-slate-50 rounded-xl border border-brand-line/20">
            <Switch
              value={formData.is_active}
              onValueChange={(val) => setFormData({ ...formData, is_active: val })}
              label="Kích hoạt gói ngay lập tức"
              description="Nếu tắt, gói sẽ bị ẩn và người dùng sẽ không thấy gói trên ứng dụng"
            />
          </View>

          {/* Box Preview thời gian thực */}
          <View className="p-3.5 bg-brand-surface rounded-xl border border-brand-primary/20 gap-1.5">
            <View className="flex-row items-center gap-1.5">
              <Sparkles size={14} color={BRAND_COLORS.primary} />
              <Text className="text-xs font-bold text-brand-primary uppercase tracking-wider">
                Khách hàng sẽ nhìn thấy:
              </Text>
            </View>
            <Text className="text-sm font-bold text-brand-text">
              {formData.label || 'Tên gói cước'} — {formatVND(previewAmount)}
            </Text>
            <Text className="text-xs text-brand-textSoft">
              ✨ {previewDescription}
            </Text>
          </View>
        </View>
      </Modal>

      {/* 5. Confirm Dialog Xóa Gói */}
      <ConfirmDialog
        visible={Boolean(planToDelete)}
        title="Xác nhận xóa gói cước?"
        message={`Bạn có chắc chắn muốn xóa vĩnh viễn gói "${planToDelete?.label}" (Mã: ${planToDelete?.id})? Nếu gói đang có đơn hàng chờ xử lý, hệ thống sẽ từ chối xóa để đảm bảo an toàn dữ liệu.`}
        confirmText="Xóa vĩnh viễn"
        cancelText="Giữ lại"
        isDestructive
        loading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPlanToDelete(null)}
      />
    </ScrollView>
  );
}

/**
 * Thẻ hiển thị từng Gói cước (Gọn gàng, đầy đủ số liệu bán)
 */
function PlanCard({
  plan,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  plan: AdminPlanItem;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const quotaDesc = describePlan(plan);

  return (
    <Card className="justify-between flex-1">
      <View className="gap-3">
        {/* Top: Tên + Trạng thái */}
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1">
            <Text className="font-display font-bold text-lg text-brand-text" numberOfLines={1}>
              {plan.label}
            </Text>
            <Text className="text-xs text-brand-textMuted font-mono mt-0.5">
              ID: {plan.id}
            </Text>
          </View>
          <Badge
            label={plan.is_active ? 'Đang mở bán' : 'Đã ẩn'}
            tone={plan.is_active ? 'success' : 'neutral'}
            size="sm"
            dot
          />
        </View>

        {/* Giá & Định mức lượt */}
        <View className="py-2 px-3 bg-brand-surface rounded-xl border border-brand-line/20 gap-1">
          <Text className="font-display font-black text-2xl text-brand-primary">
            {formatVND(plan.amount)}
          </Text>
          <Text className="text-xs font-semibold text-brand-textSoft">
            👑 {quotaDesc}
          </Text>
          {plan.description ? (
            <Text className="text-[11px] text-brand-textMuted mt-1" numberOfLines={2}>
              {plan.description}
            </Text>
          ) : null}
        </View>

        {/* Thống kê bán */}
        <View className="grid grid-cols-2 gap-2 pt-1 border-t border-brand-line/10">
          <View className="flex-row items-center gap-1.5">
            <ShoppingBag size={13} color={BRAND_COLORS.textMuted} />
            <Text className="text-[11px] text-brand-textSoft font-medium">
              Đã bán: <Text className="font-bold text-brand-text">{plan.ordersCompleted ?? 0}</Text>
            </Text>
          </View>

          <View className="flex-row items-center gap-1.5">
            <TrendingUp size={13} color={BRAND_COLORS.textMuted} />
            <Text className="text-[11px] text-brand-textSoft font-medium">
              Thu: <Text className="font-bold text-brand-primary">{formatVND(plan.revenue ?? 0)}</Text>
            </Text>
          </View>

          <View className="flex-row items-center gap-1.5 col-span-2">
            <Calendar size={13} color={BRAND_COLORS.textMuted} />
            <Text className="text-[11px] text-brand-textMuted font-medium">
              Gần nhất: {plan.lastSoldAt ? formatDate(plan.lastSoldAt) : 'Chưa có'}
            </Text>
          </View>
        </View>
      </View>

      {/* Hành động dưới thẻ */}
      <View className="flex-row items-center justify-between pt-3 mt-3 border-t border-brand-line/20 gap-2">
        <Pressable
          onPress={onToggleActive}
          className="flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-brand-line/30 hover:bg-slate-50"
          style={{ cursor: 'pointer' as any }}
        >
          {plan.is_active ? (
            <>
              <EyeOff size={13} color={BRAND_COLORS.textMuted} />
              <Text className="text-xs font-semibold text-brand-textMuted">Ẩn gói</Text>
            </>
          ) : (
            <>
              <Eye size={13} color={BRAND_COLORS.primary} />
              <Text className="text-xs font-semibold text-brand-primary">Bật lại</Text>
            </>
          )}
        </Pressable>

        <View className="flex-row items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            icon={<Edit2 size={13} color={BRAND_COLORS.text} />}
            label="Sửa"
            onPress={onEdit}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={14} color={BRAND_COLORS.danger} />}
            onPress={onDelete}
          />
        </View>
      </View>
    </Card>
  );
}
