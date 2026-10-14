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
  targetWallet?: 'free' | 'permanent' | 'monthly';
  freeRemaining?: number;
  freeDelta?: number;
  proCredits?: number;
  monthlyCredits?: number;
  monthlyUntil?: string | null;
  proDelta?: number;
  monthlyDelta?: number;
  daysDelta?: number;
  note?: string;
}

export interface CurrentProfileCredits {
  quota_total?: number;
  quota_used?: number;
  pro_credits: number;
  monthly_credits: number;
  premium_until: string | null;
  is_premium?: boolean;
}

export function validateCreditsInput(body: any): { valid: boolean; error?: string; data?: AdjustCreditsInput } {
  const invalid = (error: string) => ({ valid: false, error });
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('Dữ liệu yêu cầu không hợp lệ');
  if (!['set', 'adjust', 'revoke'].includes(body.mode)) return invalid('Chế độ không hợp lệ.');
  if (body.targetWallet !== undefined && !['free', 'permanent', 'monthly'].includes(body.targetWallet)) return invalid('Ví lượt không hợp lệ.');
  const setFields = ['freeRemaining', 'proCredits', 'monthlyCredits'];
  const deltaFields = ['freeDelta', 'proDelta', 'monthlyDelta', 'daysDelta'];
  for (const field of [...setFields, ...deltaFields]) {
    if (body[field] !== undefined && (typeof body[field] !== 'number' || !Number.isSafeInteger(body[field]) || Math.abs(body[field]) > 2147483647 || (setFields.includes(field) && body[field] < 0))) return invalid(`${field} phải là số nguyên hợp lệ.`);
  }
  if (body.monthlyUntil !== undefined && body.monthlyUntil !== null) {
    const date = body.monthlyUntil;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(`${date.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== date.slice(0, 10)) return invalid('monthlyUntil phải là ngày ISO hợp lệ có múi giờ hoặc null.');
  }
  const allowed = body.mode === 'set' ? [...setFields, 'monthlyUntil'] : body.mode === 'adjust' ? deltaFields : [];
  if (body.mode !== 'revoke' && !allowed.some(field => body[field] !== undefined && (body.mode !== 'adjust' || body[field] !== 0))) return invalid('Chưa có thay đổi ví lượt.');
  if ([...setFields, ...deltaFields, 'monthlyUntil'].some(field => body[field] !== undefined && !allowed.includes(field))) return invalid('Trường cập nhật không phù hợp với chế độ.');
  const walletFields: Record<string, string[]> = { free: ['freeRemaining', 'freeDelta'], permanent: ['proCredits', 'proDelta'], monthly: ['monthlyCredits', 'monthlyUntil', 'monthlyDelta', 'daysDelta'] };
  if (body.targetWallet && allowed.some(field => body[field] !== undefined && !walletFields[body.targetWallet].includes(field))) return invalid('Chỉ được cập nhật ví đã chọn.');
  const data: any = { mode: body.mode };
  if (body.targetWallet) data.targetWallet = body.targetWallet;
  for (const field of allowed) if (body[field] !== undefined) data[field] = body[field];
  if (body.note) data.note = String(body.note).slice(0, 1000);
  return { valid: true, data };
}

export function calculateNewCredits(current: CurrentProfileCredits, input: AdjustCreditsInput, now: Date = new Date()) {
  const used = current.quota_used ?? 0;
  let total = current.quota_total ?? 3;
  let pro = current.pro_credits;
  let monthly = current.monthly_credits;
  let until = current.premium_until;
  const activeBefore = Boolean(until && Date.parse(until) > now.getTime());
  const monthlyTouched = input.monthlyCredits !== undefined || input.monthlyUntil !== undefined || input.monthlyDelta !== undefined || input.daysDelta !== undefined;
  if (input.mode === 'revoke') {
    if (input.targetWallet === 'free') total = used;
    if (!input.targetWallet || input.targetWallet === 'permanent') pro = 0;
    if (!input.targetWallet || input.targetWallet === 'monthly') { monthly = 0; until = null; }
  } else if (input.mode === 'set') {
    if (input.freeRemaining !== undefined) total = used + input.freeRemaining;
    if (input.proCredits !== undefined) pro = input.proCredits;
    if (input.monthlyCredits !== undefined) monthly = input.monthlyCredits;
    if (input.monthlyUntil !== undefined) until = input.monthlyUntil;
    // A new expiry must never revive a stored expired balance.
    if (!activeBefore && input.monthlyCredits === undefined && input.monthlyUntil !== undefined) monthly = 0;
  } else {
    if (input.freeDelta !== undefined) total = used + Math.max(0, total - used) + input.freeDelta;
    pro += input.proDelta ?? 0;
    if (monthlyTouched) monthly = (activeBefore ? monthly : 0) + (input.monthlyDelta ?? 0);
    if (input.daysDelta !== undefined && input.daysDelta !== 0) {
      const time = (activeBefore ? Date.parse(until!) : now.getTime()) + input.daysDelta * 86400000;
      if (!Number.isFinite(time) || Math.abs(time) > 8640000000000000) throw new Error('Ngày hết hạn vượt giới hạn.');
      until = time > now.getTime() ? new Date(time).toISOString() : null;
    }
  }
  if ([total, pro, monthly].some(value => !Number.isSafeInteger(value) || value < 0 || value > 2147483647) || total < used && (input.freeRemaining !== undefined || input.freeDelta !== undefined)) throw new Error('Số lượt sau cập nhật không được âm hoặc vượt giới hạn.');
  const active = Boolean(until && Date.parse(until) > now.getTime());
  if (monthlyTouched && monthly > 0 && !active) throw new Error('Lượt Pro có hạn phải có ngày hết hạn trong tương lai.');
  return { quota_total: total, pro_credits: pro, monthly_credits: monthly, premium_until: until, is_premium: pro + (active ? monthly : 0) > 0 };
}
