/**
 * Quy chuẩn nghiệp vụ (Business Rules & Constants) cho Backend ViVu Planner v2.0
 */

export const BUDGET_ESTIMATION_CONFIG = {
  ROOM_COST_PER_NIGHT_PER_ROOM: 200_000,
  DAILY_EXPENSE_PER_GUEST: 120_000,

  /**
   * Tính toán ngân sách tối thiểu cho chuyến đi dựa trên số ngày, số đêm và số lượng khách.
   * Quy ước: 1 phòng đôi cho 2 khách (200k/đêm/phòng), chi phí ăn uống & di chuyển cơ bản 120k/khách/ngày.
   */
  calculateMinimumBudget: (daysCount: number, nightsCount: number, travelerCount: number): number => {
    const travelers = Math.max(1, travelerCount || 1);
    const days = Math.max(1, daysCount || 1);
    const nights = Math.max(0, nightsCount || 0);

    const roomCount = Math.ceil(travelers / 2);
    const estimatedRoomCost = roomCount * nights * BUDGET_ESTIMATION_CONFIG.ROOM_COST_PER_NIGHT_PER_ROOM;
    const estimatedDailyCost = travelers * days * BUDGET_ESTIMATION_CONFIG.DAILY_EXPENSE_PER_GUEST;

    return estimatedRoomCost + estimatedDailyCost;
  },
};

export const QUOTA_CONFIG = {
  DEFAULT_FREE_TRIPS: 3,
  UNLIMITED_ADMIN_TRIPS: 9999,
};

export const ORDER_CONFIG = {
  EXPIRATION_MS: 10 * 60 * 1000, // 10 phút tự hủy đơn pending
};

export const KEY_COOLDOWN_CONFIG = {
  RATE_LIMITED_MS: 3 * 60 * 1000, // 3 phút tự động phục hồi rate_limited key
  INVALID_MS: 15 * 60 * 1000,     // 15 phút tự động thử lại invalid key
};

export const AI_CANDIDATE_LIMITS = {
  ACCOMMODATION: 8,
  DINING: 24,
  ATTRACTION: 24,
  RENTAL: 6,
};

export const PARTNER_MATCH_WEIGHTS = {
  EXACT_PRICE_MATCH: 0.3,
  CLOSE_PRICE_MATCH: 0.15,
  CUISINE_MATCH: 0.3,
  AMENITY_MATCH: 0.2,
  DIETARY_MATCH: 0.2,
  INTEREST_MATCH: 0.2,
};

export const BUDGET_PRICE_TIERS = {
  BUDGET_MAX: 500_000,     // Phân khúc 1 ($)
  MID_MAX: 1_500_000,      // Phân khúc 2 ($$)
  UPSCALE_MAX: 4_000_000,  // Phân khúc 3 ($$$)
};

export const USER_BAN_CONFIG = {
  DEFAULT_BAN_DURATION: '87600h', // 10 năm
  UNBAN_DURATION: 'none',
};

// Ngưỡng tự động quy đổi đơn vị nghìn đồng: nếu người dùng hoặc AI nhập giá trị < 10,000 (VD: viết tắt 50 thay vì 50,000)
export const BUDGET_AUTO_SCALE_THRESHOLD = 10_000;
export const BUDGET_AUTO_SCALE_FACTOR = 1_000;

// Tham số rating giả lập cho OpenStreetMap (vì OpenStreetMap không lưu số sao đánh giá như Google Places)
export const OSM_FALLBACK_RATING_MIN = 4.0;
export const OSM_FALLBACK_RATING_RANGE = 0.9;

export const DEFAULT_PLANS_CONFIG = {
  single_trip: {
    amount: 19_000,
    label: 'Gói Chuyến Đơn',
    duration_days: 0,
    quota_total_grant: 1,
    description: '1 lượt nâng cấp hoặc tạo mới chuyến đi Pro (không thời hạn)'
  },
  monthly: {
    amount: 49_000,
    label: 'Gói 1 Tháng',
    duration_days: 30,
    quota_total_grant: 10,
    description: '10 lượt sử dụng trong 30 ngày (hết tháng hết hạn)'
  }
};

export interface ProCreditsInfo {
  proCredits: number;
  monthlyCredits: number;
  monthlyUntil: string | null;
  monthlyRemainingDays: number | null;
  total: number;
  hasActiveMonthly: boolean;
}

export interface FreeQuotaInfo {
  total: number;
  used: number;
  remaining: number;
}

/**
 * Kiểm tra xem một gói cước có thời hạn hay không.
 * Quy ước: duration_days > 0 => có thời hạn (theo ngày+lượt); duration_days = 0 => không thời hạn (theo lượt).
 */
export function isTimedPlan(plan?: { duration_days?: number | string | null } | null): boolean {
  return Number(plan?.duration_days ?? 0) > 0;
}

/**
 * Lấy chi tiết số lượt Pro của người dùng từ profile.
 * - proCredits: Lượt Pro không thời hạn (gói theo lượt).
 * - monthlyCredits: Lượt Pro theo ngày+lượt (chỉ hợp lệ khi premium_until > now VÀ monthly_credits > 0). Nếu hết hạn hoặc <= 0 => 0.
 * - total = proCredits + monthlyCredits.
 * - hasActiveMonthly: CHỈ TRUE khi profile.premium_until > now VÀ Number(profile.monthly_credits ?? 0) > 0.
 *   Nếu profile.monthly_credits <= 0 hoặc không có gói ngày: monthlyUntil = null, monthlyRemainingDays = null, monthlyCredits = 0, hasActiveMonthly = false.
 *   Tuyệt đối không trả về số ngày còn lại (như 60 ngày) khi người dùng chỉ mua gói theo lượt hoặc monthly_credits = 0.
 */
export function getProCredits(profile: any, now: Date = new Date()): ProCreditsInfo {
  if (!profile) {
    return {
      proCredits: 0,
      monthlyCredits: 0,
      monthlyUntil: null,
      monthlyRemainingDays: null,
      total: 0,
      hasActiveMonthly: false,
    };
  }

  if (profile.role === 'admin') {
    return {
      proCredits: 9999,
      monthlyCredits: 0,
      monthlyUntil: null,
      monthlyRemainingDays: null,
      total: 9999,
      hasActiveMonthly: false,
    };
  }

  const proCredits = Math.max(0, Number(profile.pro_credits ?? 0));
  const rawMonthlyCredits = Math.max(0, Number(profile.monthly_credits ?? 0));
  const hasActiveMonthly = Boolean(
    profile.premium_until &&
    new Date(profile.premium_until).getTime() > now.getTime() &&
    rawMonthlyCredits > 0
  );

  const monthlyCredits = hasActiveMonthly ? rawMonthlyCredits : 0;
  const monthlyUntil = hasActiveMonthly ? new Date(profile.premium_until).toISOString() : null;
  const monthlyRemainingDays = hasActiveMonthly
    ? Math.max(0, Math.ceil((new Date(profile.premium_until).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  return {
    proCredits,
    monthlyCredits,
    monthlyUntil,
    monthlyRemainingDays,
    total: proCredits + monthlyCredits,
    hasActiveMonthly,
  };
}

/**
 * Lấy thông tin hạn mức chuyến miễn phí (Free Tier)
 */
export function getFreeQuota(profile: any): FreeQuotaInfo {
  const total = Math.max(0, Number(profile?.custom_quota ?? QUOTA_CONFIG.DEFAULT_FREE_TRIPS));
  const used = Math.max(0, Number(profile?.quota_used ?? 0));
  const remaining = Math.max(0, total - used);
  return { total, used, remaining };
}

/**
 * Kiểm tra trạng thái gói Premium duy nhất cho toàn hệ thống.
 * Trả về true khi user là admin HOẶC còn ít nhất 1 lượt Pro khả dụng (total > 0).
 * Lưu ý: dù premium_until còn hạn nhưng monthly_credits = 0 và pro_credits = 0 thì vẫn là false.
 */
export function isUserPremium(profile?: any, now: Date = new Date()): boolean {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  return getProCredits(profile, now).total > 0;
}

/**
 * Tính toán giá trị mới của pro_credits, monthly_credits, premium_until sau khi cộng gói cước.
 * Phân tách rạch ròi 2 loại gói cước:
 * 1. Gói theo lượt (duration_days <= 0): Không thời hạn. Cộng dồn pro_credits.
 *    - Nếu có gói ngày đang active (premium_until > now VÀ monthly_credits > 0): giữ nguyên monthly_credits và premium_until.
 *    - Nếu không có gói ngày active: monthly_credits = 0, premium_until = null (tuyệt đối không để sót ngày hết hạn cũ).
 * 2. Gói theo ngày+lượt (duration_days > 0): Có thời hạn.
 *    - Nếu đang còn gói ngày active: cộng dồn cả lượt VÀ cộng dồn ngày gia hạn (baseTime + durationDays).
 *    - Nếu chưa có hoặc đã hết hạn (hoặc monthly_credits <= 0): lượt tháng = grant mới, hạn tính từ now().
 */
export function computeGrant(
  profile: any,
  plan: { quota_total_grant: number | string; duration_days: number | string },
  now: Date = new Date()
): { pro_credits: number; monthly_credits: number; premium_until: string | null } {
  const currentPro = Math.max(0, Number(profile?.pro_credits ?? 0));
  const currentMonthly = Math.max(0, Number(profile?.monthly_credits ?? 0));
  const hasActiveMonthly = Boolean(
    profile?.premium_until &&
    new Date(profile.premium_until).getTime() > now.getTime() &&
    currentMonthly > 0
  );
  const durationDays = Number(plan.duration_days ?? 0);
  const grant = Math.max(0, Number(plan.quota_total_grant ?? 0));

  if (durationDays <= 0) {
    // Gói không thời hạn (theo lượt): cộng dồn pro_credits
    return {
      pro_credits: currentPro + grant,
      monthly_credits: hasActiveMonthly ? currentMonthly : 0,
      premium_until: hasActiveMonthly ? new Date(profile.premium_until).toISOString() : null,
    };
  }

  // Gói có thời hạn (theo ngày+lượt)
  if (hasActiveMonthly) {
    // Đang còn hạn và còn lượt: cộng dồn cả lượt VÀ cộng dồn ngày
    const baseTime = new Date(profile.premium_until).getTime();
    return {
      pro_credits: currentPro,
      monthly_credits: currentMonthly + grant,
      premium_until: new Date(baseTime + durationDays * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  // Chưa có, đã hết hạn, hoặc monthly_credits <= 0: lượt mới bắt đầu từ now
  return {
    pro_credits: currentPro,
    monthly_credits: grant,
    premium_until: new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
  };
}

