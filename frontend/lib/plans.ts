export interface PricingPlan {
  id: string;
  label: string;
  name?: string;
  amount: number;
  price?: number;
  quota_total_grant: number;
  duration_days: number;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
  features?: string[];
  icon?: string;
  badge?: string;
}

export interface PaymentStatus {
  isPremium: boolean;
  remainingTrips: number;
  singleCredits?: number;
  monthlyCredits?: number;
  proCredits?: number;
  pro_credits?: number;
  monthly_credits?: number;
  monthlyUntil?: string | null;
  monthlyRemainingDays?: number | null;
  freeRemaining?: number;
  freeTotal?: number;
  planName?: string;
  planId?: string;
  dbWarning?: string;
  // Fallbacks for compatibility with backend responses
  premiumUntil?: string | null;
  remainingDays?: number | null;
  tripsQuota?: number;
  tripsUsed?: number;
  hasActiveMonthly?: boolean;
}

/**
 * Chuẩn hóa danh sách plans trả về từ API (hỗ trợ cả dạng array lẫn object keyed-by-id)
 */
export function normalizePlans(raw: any): PricingPlan[] {
  if (!raw) return [];

  let list: any[] = [];

  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw.plans && Array.isArray(raw.plans)) {
    list = raw.plans;
  } else if (raw.plans && typeof raw.plans === 'object') {
    list = Object.entries(raw.plans).map(([key, val]: [string, any]) => ({
      id: val?.id || key,
      ...val,
    }));
  } else if (typeof raw === 'object') {
    list = Object.entries(raw)
      .filter(([k]) => k !== 'success')
      .map(([key, val]: [string, any]) => ({
        id: val?.id || key,
        ...val,
      }));
  }

  const normalized: PricingPlan[] = list
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const id = String(item.id || `plan_${index}`);
      const label = String(item.label || item.name || id);
      const amount = Number(item.amount ?? item.price ?? 0);
      const quota_total_grant = Number(item.quota_total_grant ?? 1);
      const duration_days = Number(item.duration_days ?? 0);
      const description = typeof item.description === 'string' ? item.description : '';
      const sort_order = Number(item.sort_order ?? index);
      const is_active = item.is_active !== undefined ? !!item.is_active : true;
      const features = Array.isArray(item.features) ? item.features : [];

      return {
        id,
        label,
        name: label,
        amount,
        price: amount,
        quota_total_grant,
        duration_days,
        description,
        sort_order,
        is_active,
        features,
        icon: item.icon,
        badge: item.badge,
      };
    });

  // Sắp xếp theo sort_order rồi đến amount
  return normalized.sort((a, b) => {
    if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) {
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    }
    return a.amount - b.amount;
  });
}

/**
 * Mô tả ngắn gọn của gói:
 * duration_days === 0 => `${N} lượt • Không thời hạn`
 * duration_days > 0 => `${N} lượt • ${D} ngày`
 */
export function describePlan(plan: { quota_total_grant?: number; duration_days?: number }): string {
  const quota = plan.quota_total_grant ?? 1;
  const days = plan.duration_days ?? 0;
  if (days <= 0) {
    return `${quota} lượt • Không thời hạn`;
  }
  return `${quota} lượt • ${days} ngày`;
}

/**
 * Badge hiển thị trên card gói:
 * duration_days === 0 => `+N LƯỢT`
 * duration_days > 0 => `+N LƯỢT / D NGÀY`
 */
export function getPlanBadge(plan: { quota_total_grant?: number; duration_days?: number }): string {
  const quota = plan.quota_total_grant ?? 1;
  const days = plan.duration_days ?? 0;
  if (days <= 0) {
    return `+${quota} LƯỢT`;
  }
  return `+${quota} LƯỢT / ${days} NGÀY`;
}

/**
 * Lấy mô tả chi tiết của gói (ưu tiên description, nếu không có tự sinh từ describePlan)
 */
export function getPlanDescription(plan: PricingPlan): string {
  if (plan.description && plan.description.trim()) {
    return plan.description.trim();
  }
  return describePlan(plan);
}

/**
 * Format tiền tệ VND
 */
export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

export interface WalletFormatResult {
  singleLine: string | null;
  monthlyLine: string | null;
  freeLine?: string;
  hasMonthly: boolean;
  singleCredits: number;
  monthlyCredits: number;
  monthlyRemainingDays: number | null;
  monthlyUntil: string | null;
  singleText: string;
  monthlyText: string;
  freeRemaining: number;
  freeTotal: number;
}

/**
 * Định dạng hiển thị ví lượt người dùng:
 * - Dòng lượt lẻ: `Lượt lẻ: X (không thời hạn)` (ẩn nếu 0 và có gói thời hạn)
 * - Dòng gói thời hạn: `Gói có thời hạn: Y lượt • còn Z ngày (đến dd/mm/yyyy)` chỉ hiện khi monthlyUntil != null và monthlyCredits>0 hoặc monthlyUntil còn hạn
 * - TUYỆT ĐỐI không in số ngày khi không có gói có thời hạn; không dùng ngày của gói lẻ.
 */
export function formatWallet(status?: PaymentStatus | null): WalletFormatResult {
  const remainingTrips = status?.remainingTrips ?? 0;

  const monthlyUntil = status?.monthlyUntil ?? status?.premiumUntil ?? null;

  let monthlyRemainingDays: number | null = null;
  if (status?.monthlyRemainingDays !== undefined && status?.monthlyRemainingDays !== null) {
    monthlyRemainingDays = status.monthlyRemainingDays;
  } else if (status?.remainingDays !== undefined && status?.remainingDays !== null) {
    monthlyRemainingDays = status.remainingDays;
  } else if (monthlyUntil) {
    const diff = new Date(monthlyUntil).getTime() - Date.now();
    monthlyRemainingDays = diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0;
  }

  const rawMonthlyCredits = status?.monthlyCredits ?? status?.monthly_credits ?? 0;

  // hasMonthly CHỈ TRUE khi monthlyUntil != null VÀ (monthlyRemainingDays == null || monthlyRemainingDays > 0) VÀ (status?.monthlyCredits ?? 0) > 0
  const hasMonthly = Boolean(
    monthlyUntil !== null &&
    (monthlyRemainingDays === null || monthlyRemainingDays > 0) &&
    rawMonthlyCredits > 0
  );

  const monthlyCredits = hasMonthly ? rawMonthlyCredits : 0;

  // singleCredits = status?.singleCredits ?? status?.proCredits ?? 0
  const singleCredits = status?.singleCredits ?? status?.proCredits ?? (status as any)?.pro_credits ?? (hasMonthly ? 0 : remainingTrips);

  // Dòng lượt lẻ: Nếu singleCredits > 0: hiển thị "🎫 Lượt không giới hạn thời gian: X lượt"
  let singleLine: string | null = null;
  if (singleCredits > 0) {
    singleLine = `🎫 Lượt không giới hạn thời gian: ${singleCredits} lượt`;
  }

  // Dòng gói thời hạn: Nếu monthlyCredits <= 0: hasMonthly = false, monthlyLine = null.
  let monthlyLine: string | null = null;
  if (hasMonthly && monthlyCredits > 0 && monthlyUntil) {
    const dateFormatted = new Date(monthlyUntil).toLocaleDateString('vi-VN');
    const daysText = monthlyRemainingDays != null ? `còn ${monthlyRemainingDays} ngày` : 'còn hạn';
    monthlyLine = `Gói có thời hạn: ${monthlyCredits} lượt • ${daysText} (đến ${dateFormatted})`;
  }

  // Lượt miễn phí cơ bản
  const freeRemaining = status?.freeRemaining ?? (status?.tripsQuota !== undefined && status?.tripsUsed !== undefined ? Math.max(0, status.tripsQuota - status.tripsUsed) : 0);
  const freeTotal = status?.freeTotal ?? status?.tripsQuota ?? 3;
  const freeLine = `🎁 Lượt miễn phí cơ bản: ${freeRemaining}/${freeTotal} chuyến`;

  return {
    singleLine,
    monthlyLine,
    freeLine,
    hasMonthly,
    singleCredits,
    monthlyCredits,
    monthlyRemainingDays,
    monthlyUntil,
    singleText: singleLine || `Lượt không giới hạn: ${singleCredits} lượt`,
    monthlyText: monthlyLine || (hasMonthly ? 'Gói có thời hạn' : 'Không có gói thời hạn'),
    freeRemaining,
    freeTotal,
  };
}

/**
 * Header chip:
 * khi remainingTrips > 0: `👑 Còn {remainingTrips} lượt Pro` (+ ` • {monthlyRemainingDays} ngày` CHỈ nếu monthlyRemainingDays != null).
 * khi 0: `✨ Nâng cấp Pro`
 */
export function formatHeaderChip(status?: PaymentStatus | null): { text: string; isPro: boolean; color: string } {
  const remaining = status?.remainingTrips ?? 0;
  if (remaining > 0) {
    let days: number | null = null;
    if (status?.monthlyRemainingDays !== undefined && status?.monthlyRemainingDays !== null) {
      days = status.monthlyRemainingDays;
    } else if (status?.monthlyUntil || status?.premiumUntil) {
      const until = status?.monthlyUntil || status?.premiumUntil;
      const diff = new Date(until!).getTime() - Date.now();
      if (diff > 0) {
        days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      }
    }

    let text = `👑 Còn ${remaining} lượt Pro`;
    if (days !== null && days > 0) {
      text += ` • ${days} ngày`;
    }
    return { text, isPro: true, color: '#D4A017' };
  }

  return { text: '✨ Nâng cấp Pro', isPro: false, color: '#059669' };
}
