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
  ACCOMMODATION: 4,
  DINING: 8,
  ATTRACTION: 8,
  RENTAL: 3,
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
  plus:    { amount: 29_000, label: 'Gói Starter', duration_days: 30, quota_total_grant: 10 },
  starter: { amount: 29_000, label: 'Gói Starter', duration_days: 30, quota_total_grant: 10 },
  monthly: { amount: 49_000, label: 'Gói Premium', duration_days: 30, quota_total_grant: 9999 },
  pro:     { amount: 49_000, label: 'Gói Premium', duration_days: 30, quota_total_grant: 9999 },
  premium: { amount: 49_000, label: 'Gói Premium', duration_days: 30, quota_total_grant: 9999 },
  quarterly:{ amount: 119_000, label: 'Gói 3 Tháng Tiết Kiệm', duration_days: 90, quota_total_grant: 9999 },
  yearly:  { amount: 99_000, label: 'Gói VIP', duration_days: 365, quota_total_grant: 9999 },
  vip:     { amount: 99_000, label: 'Gói VIP', duration_days: 365, quota_total_grant: 9999 },
};

/**
 * Kiểm tra trạng thái gói Premium duy nhất cho toàn hệ thống
 */
export function isUserPremium(profile?: { is_premium?: boolean | null; premium_until?: string | Date | null } | null): boolean {
  if (!profile) return false;
  // Nếu quản trị viên đã chủ động tắt gói (hạ gói về false) -> Dứt khoát không phải Premium
  if (profile.is_premium === false) return false;
  // Nếu có hạn dùng premium_until -> Bắt buộc ngày hết hạn phải lớn hơn thời điểm hiện tại
  if (profile.premium_until) {
    return new Date(profile.premium_until) > new Date();
  }
  // Nếu is_premium là true và không có hạn dùng -> Gói vô hạn
  return !!profile.is_premium;
}

