export const VIETNAMESE_CITIES = [
  'Hà Nội',
  'Đà Nẵng',
  'TP. Hồ Chí Minh',
  'Hội An',
  'Huế',
  'Nha Trang',
  'Đà Lạt',
  'Phú Quốc',
  'Sa Pa',
  'Ninh Bình',
  'Vũng Tàu',
];

export const PREFERENCE_OPTIONS = [
  { id: 'history', label: 'Lịch sử & Văn hóa' },
  { id: 'nature', label: 'Thiên nhiên & Sinh thái' },
  { id: 'food', label: 'Ẩm thực & Đặc sản' },
  { id: 'relax', label: 'Nghỉ dưỡng & Chill' },
  { id: 'adventure', label: 'Khám phá mạo hiểm' },
  { id: 'shopping', label: 'Mua sắm & Giải trí' },
];

export const BRAND_COLORS = {
  bg: '#FBF5EA',
  bgAlt: '#F3ECDC',
  bgDark: '#14201B',
  text: '#1B2420',
  textSoft: '#3F4F45',
  textMuted: '#6E7B70',
  textDark: '#F3ECDC',
  primary: '#1F6F54',
  primaryStrong: '#134A37',
  accent: '#E2703A',
  accentStrong: '#C75A29',
  gold: '#F0B255',
  danger: '#B23B3B',
  line: 'rgba(27,36,32,0.12)',
};

// ─── ENUMS CHUẨN HÓA ────────────────────────────────────────────────────────
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

export enum TripStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}

export enum TravelerType {
  SOLO = 'solo',
  COUPLE = 'couple',
  FAMILY = 'family',
  FRIENDS = 'friends',
  OTHER = 'other',
}

export const TRAVELER_TYPES = [
  { value: TravelerType.SOLO, label: 'Đi một mình (Solo)' },
  { value: TravelerType.COUPLE, label: 'Cặp đôi (Couple)' },
  { value: TravelerType.FAMILY, label: 'Gia đình (Family)' },
  { value: TravelerType.FRIENDS, label: 'Nhóm bạn (Friends)' },
  { value: TravelerType.OTHER, label: 'Khác' },
];

export enum ItineraryItemType {
  ACCOMMODATION = 'accommodation',
  TRANSPORT = 'transport',
  DINING = 'dining',
  ATTRACTION = 'attraction',
  RENTAL = 'rental',
  EXPERIENCE = 'experience',
}

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum PaymentMethod {
  PAYOS = 'payos',
  MOMO = 'momo',
  ADMIN = 'admin',
}

// ─── ĐỊNH MỨC DỰ TOÁN NGÂN SÁCH (ĐỒNG BỘ 100% VỚI BACKEND) ─────────────────
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

  calculateDetailedBudget: (daysCount: number, nightsCount: number, travelerCount: number): { minBudget: number; daysCount: number; nightsCount: number } => {
    const days = Math.max(1, daysCount || 1);
    const nights = Math.max(0, nightsCount || 0);
    const minBudget = BUDGET_ESTIMATION_CONFIG.calculateMinimumBudget(days, nights, travelerCount);
    return { minBudget, daysCount: days, nightsCount: nights };
  },
};

// ─── ĐƯỜNG DẪN ỨNG DỤNG (APP ROUTES) ─────────────────────────────────────────
export const APP_ROUTES = {
  HOME: '/',
  LANDING: '/landing',
  SIGN_IN: '/(auth)/dang-nhap',
  SIGN_UP: '/(auth)/dang-ky',
  TRIPS: '/(app)/chuyen-di',
  NEW_TRIP: '/(app)/chuyen-di/moi',
  TRIP_DETAIL: (id: string) => `/(app)/chuyen-di/${id}`,
  ADMIN: '/admin',
  ADMIN_USERS: '/admin/users',
  ADMIN_TRIPS: '/admin/trips',
  ADMIN_KEYS: '/admin/keys',
  ADMIN_REVENUE: '/admin/revenue',
  ADMIN_PARTNERS: '/admin/partners',
  ADMIN_PACKAGES: '/admin/packages',
};

// ─── GIAO DIỆN & RESPONSIVE ──────────────────────────────────────────────────
export const UI_BREAKPOINTS = {
  DESKTOP: 900,
};

export const QUERY_CACHE_TIMES = {
  TRIPS_LIST_MS: 30_000,
  TRIP_DETAIL_MS: 10_000,
};
