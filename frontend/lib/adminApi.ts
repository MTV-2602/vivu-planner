import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from './api';

// ============================================================================
// 1. DATA TYPES (Fixed Backend Contract)
// ============================================================================

export type AdminRange = '7d' | '30d' | '90d' | '365d';
export type AdminBucket = 'day' | 'month';
export type OrderStatusFilter = 'completed' | 'pending' | 'cancelled' | 'all';
export type PaymentMethodFilter = 'payos' | 'momo' | 'admin' | 'all';

export interface OverviewKpis {
  revenue: {
    value: number;
    prev: number;
    orders: number;
    prevOrders: number;
  };
  users: {
    total: number;
    new: number;
    prevNew: number;
  };
  paidUsers: {
    total: number;
    newInRange: number;
  };
  proUsers: {
    withCredits: number;
  };
  trips: {
    total: number;
    new: number;
    prevNew: number;
    pro: number;
    proNew: number;
  };
  creditsOutstanding: number;
}

export interface OverviewSeriesItem {
  date: string;
  revenue: number;
  orders: number;
  newUsers: number;
  newTrips: number;
  newProTrips: number;
}

export interface PlanBreakdownItem {
  planId: string;
  label: string;
  orders: number;
  revenue: number;
  share?: number;
}

export interface MethodBreakdownItem {
  method: string;
  orders: number;
  revenue: number;
  share?: number;
}

export interface AdminGrantsStat {
  count: number;
  value: number;
}

export interface AdminSystemStats {
  apiKeys: number;
  partners: number;
  disruptions: number;
}

export interface AdminOverviewResponse {
  range: AdminRange;
  from: string;
  to: string;
  bucket: AdminBucket;
  kpis: OverviewKpis;
  series: OverviewSeriesItem[];
  plans: PlanBreakdownItem[];
  methods: MethodBreakdownItem[];
  adminGrants: AdminGrantsStat;
  system: AdminSystemStats;
}

export interface RevenueKpis {
  revenue: number;
  prev: number;
  orders: number;
  prevOrders: number;
  avgOrderValue: number;
  paidUsers: number;
  repeatBuyers: number;
}

export interface RevenueSeriesItem {
  date: string;
  revenue: number;
  orders: number;
}

export interface TopBuyerItem {
  userId: string;
  email: string;
  fullName: string;
  orders: number;
  revenue: number;
}

export interface AdminRevenueResponse {
  range: AdminRange;
  from: string;
  to: string;
  bucket: AdminBucket;
  kpis: RevenueKpis;
  series: RevenueSeriesItem[];
  byPlan: PlanBreakdownItem[];
  byMethod: MethodBreakdownItem[];
  topBuyers: TopBuyerItem[];
  adminGrants: AdminGrantsStat;
}

export interface AdminOrderItem {
  id: string;
  orderCode: string;
  userId: string;
  email: string;
  fullName: string;
  plan: string;
  planLabel: string;
  method: string;
  amount: number;
  status: 'completed' | 'pending' | 'cancelled';
  createdAt: string;
  completedAt: string | null;
  isAdminGrant: boolean;
}

export interface AdminOrdersResponse {
  items: AdminOrderItem[];
  total: number;
  page: number;
  limit: number;
  summary: {
    revenue: number;
    orders: number;
  };
}

export interface AdminOrdersQueryParams {
  status?: OrderStatusFilter;
  method?: PaymentMethodFilter;
  plan?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface AdminPlanItem {
  id: string;
  label: string;
  amount: number;
  quota_total_grant: number;
  duration_days: number;
  description?: string;
  is_active: boolean;
  sort_order?: number;
  ordersCompleted?: number;
  revenue?: number;
  lastSoldAt?: string | null;
}

export interface SavePlanPayload {
  id?: string;
  label: string;
  amount: number;
  quota_total_grant: number;
  duration_days: number;
  description?: string;
  is_active: boolean;
  sort_order?: number;
}

export interface AdminUserItem {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: string;
  createdAt: string;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  proCredits: number;
  monthlyCredits: number;
  monthlyUntil: string | null;
  monthlyRemainingDays: number;
  remainingTrips: number;
  freeUsed: number;
  freeTotal: number;
  tripsCount: number;
  totalSpent: number;
  ordersCount: number;
  pro_credits?: number;
  monthly_credits?: number;
  premium_until?: string | null;
  is_premium?: boolean;
}

export interface AdminUsersSummary {
  total: number;
  pro: number;
  free: number;
  admins: number;
  banned: number;
}

export interface AdminUsersResponse {
  success: boolean;
  users: AdminUserItem[];
  items?: AdminUserItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: AdminUsersSummary;
}

export interface AdminUsersQueryParams {
  search?: string;
  filter?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface UpdateCreditsPayload {
  mode: 'set' | 'adjust' | 'revoke';
  proCredits?: number;
  monthlyCredits?: number;
  monthlyDays?: number;
  monthlyUntil?: string | null;
  proDelta?: number;
  monthlyDelta?: number;
  daysDelta?: number;
  note?: string;
}

export interface UpdateUserProfilePayload {
  fullName?: string;
  phone?: string;
  quotaTotal?: number;
  newPassword?: string;
}

export interface AdminTripItem {
  id: string;
  title: string;
  destinationCity: string;
  startDate: string;
  endDate: string;
  status: string;
  isPro: boolean;
  travelerCount: number;
  budgetTotal: number;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  createdAt: string;
}

export interface AdminTripsSummary {
  total: number;
  pro: number;
  free: number;
}

export interface AdminTripsResponse {
  success: boolean;
  trips: AdminTripItem[];
  items?: AdminTripItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: AdminTripsSummary;
}

export interface AdminTripsQueryParams {
  search?: string;
  type?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface ApiKeyRecord {
  id: string;
  key_value: string;
  is_active: boolean;
  status: string;
  last_used_at: string | null;
  created_at: string;
  usage_count?: number;
}

export interface AiGatewayConfigData {
  provider: 'gemini' | 'custom_openai';
  baseUrl: string;
  apiKey: string;
  hasApiKey: boolean;
  model: string;
  isActive: boolean;
  maxTokens?: number;
  geminiMaxTokens?: number;
}

export interface TestAiConfigPayload {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface TestAiConfigResponse {
  success?: boolean;
  message?: string;
  durationMs?: number;
  modelUsed?: string;
  reply?: string;
  fallbackNotice?: string;
  error?: string;
  details?: string;
}

export interface PartnerRecord {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  city: string;
  district?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  website_url?: string | null;
  booking_url?: string | null;
  description?: string | null;
  image_urls?: string[] | null;
  price_level: number;
  cuisine_tags?: string[] | null;
  amenity_tags?: string[] | null;
  dietary_safe?: string[] | null;
  admin_rating: number;
  admin_notes?: string | null;
  partner_priority: number;
  active_status: boolean;
  impression_count: number;
  click_count: number;
  booking_count: number;
  created_at: string;
  updated_at?: string;
  tags?: string[];
  priority?: number;
}

export interface PartnerAnalyticsSummary {
  totalImpressions: number;
  totalClicks: number;
  totalBookings: number;
  averageCtr: number;
}

export interface AdminPartnersQueryParams {
  city?: string;
  category?: string;
  active_status?: boolean;
}

// ============================================================================
// 2. QUERY KEYS
// ============================================================================

export const adminQueryKeys = {
  all: ['admin'] as const,
  overview: (range: AdminRange) => ['admin', 'overview', range] as const,
  revenue: (range: AdminRange) => ['admin', 'revenue', range] as const,
  orders: (params: AdminOrdersQueryParams) => ['admin', 'orders', params] as const,
  plans: () => ['admin', 'plans'] as const,
  users: (params: AdminUsersQueryParams) => ['admin', 'users', params] as const,
  trips: (params: AdminTripsQueryParams) => ['admin', 'trips', params] as const,
  keys: () => ['admin', 'keys'] as const,
  aiConfig: () => ['admin', 'ai-config'] as const,
  partners: (params?: AdminPartnersQueryParams) => ['admin', 'partners', params] as const,
  partnerSummary: () => ['admin', 'partners', 'summary'] as const,
};

// ============================================================================
// 3. REACT QUERY HOOKS
// ============================================================================

/**
 * Hook tải dữ liệu Tổng quan (/admin/overview)
 */
export function useAdminOverview(range: AdminRange = '30d') {
  return useQuery<AdminOverviewResponse>({
    queryKey: adminQueryKeys.overview(range),
    queryFn: async () => {
      const res = await api.get('/admin/overview', { params: { range } });
      return res.data;
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Hook tải báo cáo Doanh thu (/admin/revenue)
 */
export function useAdminRevenue(range: AdminRange = '30d') {
  return useQuery<AdminRevenueResponse>({
    queryKey: adminQueryKeys.revenue(range),
    queryFn: async () => {
      const res = await api.get('/admin/revenue', { params: { range } });
      return res.data;
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Hook tải danh sách đơn hàng / giao dịch (/admin/orders)
 */
export function useAdminOrders(params: AdminOrdersQueryParams = {}) {
  const queryParams = {
    status: params.status || 'completed',
    method: params.method || 'all',
    plan: params.plan || 'all',
    q: params.q || '',
    from: params.from || '',
    to: params.to || '',
    page: params.page || 1,
    limit: params.limit || 20,
  };

  return useQuery<AdminOrdersResponse>({
    queryKey: adminQueryKeys.orders(queryParams),
    queryFn: async () => {
      const res = await api.get('/admin/orders', { params: queryParams });
      return res.data;
    },
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Hook kích hoạt thủ công giao dịch (/admin/orders/:id/activate)
 */
export function useActivateOrder() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; activated: boolean; reason?: string }, any, string>({
    mutationFn: async (orderId: string) => {
      const res = await api.post(`/admin/orders/${orderId}/activate`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'revenue'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

/**
 * Chuẩn hóa danh sách gói cước (hỗ trợ cả mảng trực tiếp lẫn { plans: [...] })
 */
export function normalizeAdminPlans(raw: any): AdminPlanItem[] {
  if (!raw) return [];
  let list: any[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw.plans && Array.isArray(raw.plans)) {
    list = raw.plans;
  } else if (typeof raw === 'object') {
    list = Object.entries(raw)
      .filter(([k]) => k !== 'success')
      .map(([key, val]: [string, any]) => ({ id: val?.id || key, ...val }));
  }

  return list.map((item, idx) => ({
    id: String(item.id || `plan_${idx}`),
    label: String(item.label || item.name || item.id || `Gói ${idx + 1}`),
    amount: Number(item.amount ?? item.price ?? 0),
    quota_total_grant: Number(item.quota_total_grant ?? 1),
    duration_days: Number(item.duration_days ?? 0),
    description: typeof item.description === 'string' ? item.description : '',
    is_active: item.is_active !== undefined ? Boolean(item.is_active) : true,
    sort_order: Number(item.sort_order ?? idx),
    ordersCompleted: Number(item.ordersCompleted ?? item.orders_completed ?? 0),
    revenue: Number(item.revenue ?? 0),
    lastSoldAt: item.lastSoldAt || item.last_sold_at || null,
  })).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/**
 * Hook tải danh sách toàn bộ gói cước (/admin/plans)
 */
export function useAdminPlans() {
  return useQuery<AdminPlanItem[]>({
    queryKey: adminQueryKeys.plans(),
    queryFn: async () => {
      const res = await api.get('/admin/plans');
      return normalizeAdminPlans(res.data);
    },
    staleTime: 30_000,
  });
}

/**
 * Hook lưu hoặc tạo mới gói cước (POST /admin/plans)
 */
export function useSaveAdminPlans() {
  const queryClient = useQueryClient();

  return useMutation<any, any, SavePlanPayload[]>({
    mutationFn: async (plans: SavePlanPayload[]) => {
      const res = await api.post('/admin/plans', { plans });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.plans() });
      queryClient.invalidateQueries({ queryKey: ['paymentPlansModal'] });
      queryClient.invalidateQueries({ queryKey: ['paymentPlans'] });
    },
  });
}

/**
 * Hook xóa gói cước (DELETE /admin/plans/:id)
 */
export function useDeleteAdminPlan() {
  const queryClient = useQueryClient();

  return useMutation<any, any, string>({
    mutationFn: async (planId: string) => {
      const res = await api.delete(`/admin/plans/${planId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.plans() });
      queryClient.invalidateQueries({ queryKey: ['paymentPlansModal'] });
      queryClient.invalidateQueries({ queryKey: ['paymentPlans'] });
    },
  });
}

// ============================================================================
// 4. USERS HOOKS
// ============================================================================

/**
 * Hook tải danh sách người dùng kèm ví lượt & chi tiêu (/admin/users)
 */
export function useAdminUsers(params: AdminUsersQueryParams = {}) {
  const queryParams = {
    search: params.search || '',
    filter: params.filter || 'all',
    sort: params.sort || 'created_desc',
    page: params.page || 1,
    limit: params.limit || 20,
  };

  return useQuery<AdminUsersResponse>({
    queryKey: adminQueryKeys.users(queryParams),
    queryFn: async () => {
      const res = await api.get('/admin/users', { params: queryParams });
      const data = res.data;
      return {
        ...data,
        users: data.users || data.items || [],
        totalPages:
          data.totalPages ||
          data.pagination?.totalPages ||
          Math.ceil((data.total || 0) / (data.limit || queryParams.limit)) ||
          1,
      };
    },
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Hook hạ/thu hồi/chỉnh ví lượt người dùng (POST /admin/users/:id/credits)
 */
export function useUpdateUserCredits() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; message?: string; data?: any },
    any,
    { userId: string; payload: UpdateCreditsPayload }
  >({
    mutationFn: async ({ userId, payload }) => {
      const body: any = { mode: payload.mode, note: payload.note };
      if (payload.mode === 'revoke') {
        // revoke
      } else if (payload.mode === 'set') {
        if (payload.proCredits !== undefined) body.proCredits = payload.proCredits;
        if (payload.monthlyCredits !== undefined) body.monthlyCredits = payload.monthlyCredits;
        if (payload.monthlyUntil !== undefined) {
          body.monthlyUntil = payload.monthlyUntil;
        } else if (payload.monthlyDays !== undefined) {
          body.monthlyUntil =
            payload.monthlyDays > 0
              ? new Date(Date.now() + payload.monthlyDays * 86400000).toISOString()
              : null;
        }
      } else if (payload.mode === 'adjust') {
        body.proDelta = payload.proDelta !== undefined ? payload.proDelta : (payload.proCredits ?? 0);
        body.monthlyDelta = payload.monthlyDelta !== undefined ? payload.monthlyDelta : (payload.monthlyCredits ?? 0);
        body.daysDelta = payload.daysDelta !== undefined ? payload.daysDelta : (payload.monthlyDays ?? 0);
      }
      const res = await api.post(`/admin/users/${userId}/credits`, body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

/**
 * Hook chỉnh sửa thông tin người dùng (PUT /admin/users/:id)
 */
export function useUpdateUserProfile() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; message?: string; data?: any },
    any,
    { userId: string; payload: UpdateUserProfilePayload }
  >({
    mutationFn: async ({ userId, payload }) => {
      const body: any = {};
      if (payload.fullName !== undefined) {
        body.full_name = payload.fullName;
        body.fullName = payload.fullName;
      }
      if (payload.phone !== undefined) {
        body.phone = payload.phone;
      }
      if (payload.quotaTotal !== undefined) {
        body.quota_total = payload.quotaTotal;
        body.quotaTotal = payload.quotaTotal;
      }
      if (payload.newPassword !== undefined) {
        body.new_password = payload.newPassword;
        body.newPassword = payload.newPassword;
      }
      const res = await api.put(`/admin/users/${userId}`, body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

/**
 * Hook khóa / mở khóa người dùng (PUT /admin/users/:id/toggle-ban)
 */
export function useToggleUserBan() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; isBanned?: boolean; message?: string }, any, string>({
    mutationFn: async (userId: string) => {
      const res = await api.put(`/admin/users/${userId}/toggle-ban`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

/**
 * Hook phân quyền người dùng (PUT /admin/users/:id/role)
 */
export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; message?: string; role?: string }, any, { userId: string; role: string }>({
    mutationFn: async ({ userId, role }) => {
      const res = await api.put(`/admin/users/${userId}/role`, { role });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

/**
 * Hook xóa người dùng và dữ liệu liên quan (DELETE /admin/users/:id)
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; message?: string; deletedTripIds?: string[] }, any, string>({
    mutationFn: async (userId: string) => {
      const res = await api.delete(`/admin/users/${userId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'trips'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

// ============================================================================
// 5. TRIPS HOOKS
// ============================================================================

/**
 * Hook tải danh sách toàn bộ chuyến đi (/admin/trips)
 */
export function useAdminTrips(params: AdminTripsQueryParams = {}) {
  const queryParams = {
    search: params.search || '',
    type: params.type || 'all',
    status: params.status || '',
    page: params.page || 1,
    limit: params.limit || 20,
  };

  return useQuery<AdminTripsResponse>({
    queryKey: adminQueryKeys.trips(queryParams),
    queryFn: async () => {
      const res = await api.get('/admin/trips', { params: queryParams });
      const data = res.data;
      return {
        ...data,
        trips: data.trips || data.items || [],
        totalPages:
          data.totalPages ||
          data.pagination?.totalPages ||
          Math.ceil((data.total || 0) / (data.limit || queryParams.limit)) ||
          1,
      };
    },
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Hook xóa chuyến đi (DELETE /admin/trips/:id)
 */
export function useDeleteAdminTrip() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; message?: string }, any, string>({
    mutationFn: async (tripId: string) => {
      const res = await api.delete(`/admin/trips/${tripId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'trips'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

// ============================================================================
// 6. KEYS & AI CONFIG HOOKS
// ============================================================================

/**
 * Hook tải danh sách API Keys (/admin/keys)
 */
export function useAdminApiKeys() {
  return useQuery<ApiKeyRecord[]>({
    queryKey: adminQueryKeys.keys(),
    queryFn: async () => {
      const res = await api.get('/admin/keys');
      return res.data;
    },
    staleTime: 15_000,
  });
}

/**
 * Hook thêm API Key mới (lẻ hoặc hàng loạt) (POST /admin/keys)
 */
export function useAddApiKey() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; message: string; data?: any },
    any,
    { key_value?: string; key_values?: string[] } | string[] | string
  >({
    mutationFn: async (payload) => {
      let body: any = {};
      if (Array.isArray(payload)) {
        body = { key_values: payload };
      } else if (typeof payload === 'string') {
        body = { key_value: payload };
      } else {
        body = payload;
      }
      const res = await api.post('/admin/keys', body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.keys() });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

/**
 * Hook cập nhật trạng thái hoạt động của API Key (PUT /admin/keys/:id)
 */
export function useToggleApiKey() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; message: string; data?: any },
    any,
    { id: string; is_active?: boolean; status?: string }
  >({
    mutationFn: async ({ id, is_active, status }) => {
      const res = await api.put(`/admin/keys/${id}`, { is_active, status });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.keys() });
    },
  });
}

/**
 * Hook xóa API Key (DELETE /admin/keys/:id)
 */
export function useDeleteApiKey() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; message: string }, any, string>({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/admin/keys/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.keys() });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

/**
 * Hook lấy cấu hình AI Gateway hiện tại (GET /admin/ai-config)
 */
export function useAdminAiConfig() {
  return useQuery<{ success: boolean; data: AiGatewayConfigData }>({
    queryKey: adminQueryKeys.aiConfig(),
    queryFn: async () => {
      const res = await api.get('/admin/ai-config');
      return res.data;
    },
    staleTime: 30_000,
  });
}

/**
 * Hook cập nhật cấu hình AI Gateway (PUT /admin/ai-config)
 */
export function useUpdateAiConfig() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; message: string },
    any,
    Partial<AiGatewayConfigData>
  >({
    mutationFn: async (payload) => {
      const res = await api.put('/admin/ai-config', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiConfig() });
    },
  });
}

/**
 * Hook kiểm tra kết nối AI Gateway (POST /admin/ai-config/test)
 */
export function useTestAiConfig() {
  return useMutation<TestAiConfigResponse, any, TestAiConfigPayload>({
    mutationFn: async (payload) => {
      const res = await api.post('/admin/ai-config/test', payload);
      return res.data;
    },
  });
}

// ============================================================================
// 7. PARTNERS HOOKS
// ============================================================================

/**
 * Hook tải danh sách đối tác (/admin/partners)
 */
export function useAdminPartners(params?: AdminPartnersQueryParams) {
  return useQuery<PartnerRecord[]>({
    queryKey: adminQueryKeys.partners(params),
    queryFn: async () => {
      const res = await api.get('/admin/partners', { params });
      return res.data;
    },
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Hook lấy số liệu tổng hợp hiệu suất đối tác (/admin/partners/analytics/summary)
 */
export function usePartnerAnalyticsSummary() {
  return useQuery<PartnerAnalyticsSummary>({
    queryKey: adminQueryKeys.partnerSummary(),
    queryFn: async () => {
      const res = await api.get('/admin/partners/analytics/summary');
      return res.data;
    },
    staleTime: 30_000,
  });
}

/**
 * Hook tạo mới hoặc cập nhật đối tác (POST / PUT /admin/partners)
 */
export function useSavePartner() {
  const queryClient = useQueryClient();

  return useMutation<
    PartnerRecord,
    any,
    { id?: string; data: Partial<PartnerRecord> }
  >({
    mutationFn: async ({ id, data }) => {
      if (id) {
        const res = await api.put(`/admin/partners/${id}`, data);
        return res.data;
      } else {
        const res = await api.post('/admin/partners', data);
        return res.data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

/**
 * Hook bật / tắt trạng thái hoạt động của đối tác (PUT /admin/partners/:id/toggle)
 */
export function useTogglePartnerActive() {
  const queryClient = useQueryClient();

  return useMutation<PartnerRecord, any, string>({
    mutationFn: async (id: string) => {
      const res = await api.put(`/admin/partners/${id}/toggle`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

/**
 * Hook xóa đối tác (DELETE /admin/partners/:id)
 */
export function useDeletePartner() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; message: string }, any, string>({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/admin/partners/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}
