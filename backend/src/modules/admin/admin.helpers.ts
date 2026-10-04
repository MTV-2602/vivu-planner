/**
 * Helper functions & pure calculation logic for Admin Module
 * Chuẩn hóa múi giờ Asia/Ho_Chi_Minh, zero-fill buckets, doanh thu thật & ví lượt
 */

export type DateRangeKey = '7d' | '30d' | '90d' | '365d';

export interface DateRangeInfo {
  range: DateRangeKey;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  bucket: 'day' | 'month';
}

/**
 * Định dạng YYYY-MM-DD theo múi giờ Việt Nam (Asia/Ho_Chi_Minh)
 */
export function formatVNLocalDate(date: Date | string | number): string {
  const d = typeof date === 'object' ? date : new Date(date);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Định dạng YYYY-MM theo múi giờ Việt Nam (Asia/Ho_Chi_Minh)
 */
export function formatVNLocalMonth(date: Date | string | number): string {
  const d = typeof date === 'object' ? date : new Date(date);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
  }).format(d);
}

/**
 * Tính toán mốc thời gian hiện tại và kỳ trước dựa trên tham số range (7d, 30d, 90d, 365d)
 */
export function resolveDateRange(rangeParam?: string): DateRangeInfo {
  const range: DateRangeKey = ['7d', '30d', '90d', '365d'].includes(rangeParam as any)
    ? (rangeParam as DateRangeKey)
    : '30d';

  const daysMap: Record<DateRangeKey, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '365d': 365,
  };

  const days = daysMap[range];
  const now = new Date();
  const to = now.toISOString();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const prevTo = from;
  const prevFrom = new Date(now.getTime() - 2 * days * 24 * 60 * 60 * 1000).toISOString();
  const bucket: 'day' | 'month' = range === '365d' ? 'month' : 'day';

  return { range, from, to, prevFrom, prevTo, bucket };
}

/**
 * Sinh danh sách các bucket (ngày hoặc tháng) zero-fill theo múi giờ Asia/Ho_Chi_Minh
 */
export function generateDateBuckets(fromIso: string, toIso: string, bucket: 'day' | 'month'): string[] {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const result: string[] = [];

  if (bucket === 'day') {
    const endKey = formatVNLocalDate(to);
    const cur = new Date(from);
    let lastKey = '';
    while (cur.getTime() <= to.getTime() + 86400000) {
      const key = formatVNLocalDate(cur);
      if (key !== lastKey) {
        result.push(key);
        lastKey = key;
      }
      if (key === endKey) break;
      cur.setTime(cur.getTime() + 12 * 3600 * 1000);
    }
    if (result[result.length - 1] !== endKey) {
      result.push(endKey);
    }
  } else {
    const endKey = formatVNLocalMonth(to);
    const cur = new Date(from);
    let lastKey = '';
    while (cur.getTime() <= to.getTime() + 35 * 86400000) {
      const key = formatVNLocalMonth(cur);
      if (key !== lastKey) {
        result.push(key);
        lastKey = key;
      }
      if (key === endKey) break;
      cur.setTime(cur.getTime() + 15 * 86400 * 1000);
    }
    if (result[result.length - 1] !== endKey) {
      result.push(endKey);
    }
  }

  return result;
}

/**
 * Kiểm tra xem đơn hàng có phải là đơn thanh toán thật thành công hay không
 * (Trừ đơn tặng của admin và các trạng thái pending/cancelled/failed)
 */
export function isRealPaidOrder(order: { status?: string | null; method?: string | null }): boolean {
  const st = (order.status || '').toLowerCase();
  const isCompleted = st === 'completed' || st === 'success';
  const isNotAdmin = (order.method || '').toLowerCase() !== 'admin';
  return isCompleted && isNotAdmin;
}

/**
 * Kiểm tra xem đơn hàng có phải là gói do admin tặng hay không
 */
export function isAdminGrantOrder(order: { status?: string | null; method?: string | null }): boolean {
  const st = (order.status || '').toLowerCase();
  const isCompleted = st === 'completed' || st === 'success';
  const isAdmin = (order.method || '').toLowerCase() === 'admin';
  return isCompleted && isAdmin;
}

/**
 * Trích xuất nhãn gói cước từ pricing_plans, nếu không có thì fallback 'Gói cũ (<id>)'
 */
export function resolvePlanLabel(
  planId: string | null | undefined,
  plansMap: Map<string, { label?: string; name?: string }>
): string {
  if (!planId) return 'Gói dịch vụ';
  const matched = plansMap.get(planId);
  if (matched) {
    return matched.label || matched.name || planId;
  }
  return `Gói cũ (${planId})`;
}

/**
 * Làm sạch chuỗi tìm kiếm để ngăn PostgREST cú pháp injection
 */
export function sanitizeSearchQuery(q: string | undefined | null): string {
  if (!q) return '';
  return q.replace(/[,()%"'\\]/g, '').trim();
}

export interface AdjustCreditsInput {
  mode: 'set' | 'adjust' | 'revoke';
  proCredits?: number;
  monthlyCredits?: number;
  monthlyUntil?: string | null;
  proDelta?: number;
  monthlyDelta?: number;
  daysDelta?: number;
  note?: string;
}

export interface CurrentProfileCredits {
  pro_credits: number;
  monthly_credits: number;
  premium_until: string | null;
  is_premium?: boolean;
}

/**
 * Validate đầu vào cho API chỉnh sửa ví lượt
 */
export function validateCreditsInput(body: any): { valid: boolean; error?: string; data?: AdjustCreditsInput } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Dữ liệu yêu cầu không hợp lệ' };
  }

  const { mode, proCredits, monthlyCredits, monthlyUntil, proDelta, monthlyDelta, daysDelta, note } = body;

  if (!['set', 'adjust', 'revoke'].includes(mode)) {
    return { valid: false, error: 'Chế độ (mode) không hợp lệ. Chỉ chấp nhận: "set", "adjust", "revoke".' };
  }

  if (mode === 'revoke') {
    return { valid: true, data: { mode: 'revoke', note: note ? String(note) : undefined } };
  }

  if (mode === 'set') {
    if (proCredits !== undefined) {
      if (typeof proCredits !== 'number' || !Number.isInteger(proCredits) || proCredits < 0) {
        return { valid: false, error: 'proCredits phải là số nguyên không âm (>= 0).' };
      }
    }
    if (monthlyCredits !== undefined) {
      if (typeof monthlyCredits !== 'number' || !Number.isInteger(monthlyCredits) || monthlyCredits < 0) {
        return { valid: false, error: 'monthlyCredits phải là số nguyên không âm (>= 0).' };
      }
    }
    if (monthlyUntil !== undefined && monthlyUntil !== null) {
      if (typeof monthlyUntil !== 'string' || isNaN(new Date(monthlyUntil).getTime())) {
        return { valid: false, error: 'monthlyUntil phải là chuỗi ngày ISO hợp lệ hoặc null.' };
      }
    }

    return {
      valid: true,
      data: {
        mode: 'set',
        proCredits: proCredits !== undefined ? proCredits : undefined,
        monthlyCredits: monthlyCredits !== undefined ? monthlyCredits : undefined,
        monthlyUntil: monthlyUntil !== undefined ? monthlyUntil : undefined,
        note: note ? String(note) : undefined,
      },
    };
  }

  if (mode === 'adjust') {
    if (proDelta !== undefined) {
      if (typeof proDelta !== 'number' || !Number.isInteger(proDelta)) {
        return { valid: false, error: 'proDelta phải là số nguyên.' };
      }
    }
    if (monthlyDelta !== undefined) {
      if (typeof monthlyDelta !== 'number' || !Number.isInteger(monthlyDelta)) {
        return { valid: false, error: 'monthlyDelta phải là số nguyên.' };
      }
    }
    if (daysDelta !== undefined) {
      if (typeof daysDelta !== 'number' || !Number.isInteger(daysDelta)) {
        return { valid: false, error: 'daysDelta phải là số nguyên.' };
      }
    }

    return {
      valid: true,
      data: {
        mode: 'adjust',
        proDelta: proDelta !== undefined ? proDelta : undefined,
        monthlyDelta: monthlyDelta !== undefined ? monthlyDelta : undefined,
        daysDelta: daysDelta !== undefined ? daysDelta : undefined,
        note: note ? String(note) : undefined,
      },
    };
  }

  return { valid: false, error: 'Dữ liệu không hợp lệ' };
}

/**
 * Tính toán số lượt và hạn mới dựa trên mode: set | adjust | revoke
 */
export function calculateNewCredits(
  current: CurrentProfileCredits,
  input: AdjustCreditsInput,
  now: Date = new Date()
): { pro_credits: number; monthly_credits: number; premium_until: string | null; is_premium: boolean } {
  if (input.mode === 'revoke') {
    return {
      pro_credits: 0,
      monthly_credits: 0,
      premium_until: null,
      is_premium: false,
    };
  }

  if (input.mode === 'set') {
    const pro = input.proCredits !== undefined ? Math.max(0, input.proCredits) : Math.max(0, current.pro_credits);
    const monthly =
      input.monthlyCredits !== undefined ? Math.max(0, input.monthlyCredits) : Math.max(0, current.monthly_credits);
    let until = input.monthlyUntil !== undefined ? input.monthlyUntil : current.premium_until;

    if (until && isNaN(new Date(until).getTime())) {
      until = null;
    }

    const hasActiveMonthly = Boolean(until && new Date(until).getTime() > now.getTime());
    const activeMonthly = hasActiveMonthly ? monthly : 0;
    const is_premium = pro + activeMonthly > 0;

    return {
      pro_credits: pro,
      monthly_credits: monthly,
      premium_until: until,
      is_premium,
    };
  }

  if (input.mode === 'adjust') {
    const pro = Math.max(0, current.pro_credits + (input.proDelta ?? 0));
    const monthly = Math.max(0, current.monthly_credits + (input.monthlyDelta ?? 0));
    let until = current.premium_until;

    if (input.daysDelta !== undefined && input.daysDelta !== 0) {
      // daysDelta dời premium_until; nếu premium_until null và daysDelta > 0 thì tính từ now
      const isCurrentlyActive = Boolean(until && new Date(until).getTime() > now.getTime());
      const baseTime = isCurrentlyActive ? new Date(until!).getTime() : now.getTime();
      const newTime = baseTime + input.daysDelta * 24 * 60 * 60 * 1000;

      if (newTime <= now.getTime()) {
        until = null;
      } else {
        until = new Date(newTime).toISOString();
      }
    }

    const hasActiveMonthly = Boolean(until && new Date(until).getTime() > now.getTime());
    const activeMonthly = hasActiveMonthly ? monthly : 0;
    const is_premium = pro + activeMonthly > 0;

    return {
      pro_credits: pro,
      monthly_credits: monthly,
      premium_until: until,
      is_premium,
    };
  }

  throw new Error(`Mode không hợp lệ: ${(input as any).mode}`);
}
