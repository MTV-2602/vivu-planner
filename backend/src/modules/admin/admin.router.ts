import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { requireAdmin } from '../../middleware/requireAdmin';
import { supabaseAdmin, isDbMocked } from '../../config/supabase';

import { autoCancelExpiredOrders, loadPlansFromDb, activatePremiumForUser } from '../payment/payment.router';
import * as paymentRouter from '../payment/payment.router';
import {
  UserRole,
  USER_BAN_CONFIG,
  PaymentStatus,
  PaymentMethod,
  isUserPremium,
  getProCredits,
  getFreeQuota,
  computeGrant,
} from '../../constants';

import {
  resolveDateRange,
  generateDateBuckets,
  formatVNLocalDate,
  formatVNLocalMonth,
  isRealPaidOrder,
  isAdminGrantOrder,
  resolvePlanLabel,
  sanitizeSearchQuery,
  validateCreditsInput,
  calculateNewCredits,
} from './admin.helpers';

import { getEffectiveAiConfig, saveAiGatewayConfig, testAiGatewayConnection } from '../ai/aiGateway.service';

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);

/**
 * Gọi hàm activateOrderById từ payment.router (nếu có) hoặc fallback an toàn
 */
async function callActivateOrderById(
  orderId: string,
  opts: { force?: boolean; source?: 'gateway' | 'admin' } = { force: true, source: 'admin' }
): Promise<{ activated: boolean; reason?: string; userId?: string; plan?: string }> {
  if (typeof (paymentRouter as any).activateOrderById === 'function') {
    return (paymentRouter as any).activateOrderById(orderId, opts);
  }

  // Fallback an toàn khi payment.router chưa hoàn tất export
  const { data: order } = await supabaseAdmin
    .from('payment_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) {
    return { activated: false, reason: 'not_found' };
  }

  if (order.status === PaymentStatus.COMPLETED || order.status === 'success') {
    return { activated: false, reason: 'already_completed' };
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('payment_orders')
    .update({
      status: PaymentStatus.COMPLETED,
      completed_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .in('status', [PaymentStatus.PENDING, PaymentStatus.CANCELLED])
    .select();

  if (updErr || !updated || updated.length === 0) {
    return { activated: false, reason: 'already_completed' };
  }

  await activatePremiumForUser(order.user_id, order.plan || 'monthly');
  return {
    activated: true,
    reason: 'admin_force_activated',
    userId: order.user_id,
    plan: order.plan,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /api/admin/overview - Tổng quan KPI, biểu đồ & thống kê hệ thống
// ─────────────────────────────────────────────────────────────────────────────
router.get('/overview', async (req: Request, res: Response) => {
  try {
    await autoCancelExpiredOrders();

    const rangeInfo = resolveDateRange(req.query.range as string);
    const { range, from, to, prevFrom, prevTo, bucket } = rangeInfo;

    // 1. Chạy song song các truy vấn nền tảng
    const [
      ordersRes,
      plansRes,
      profilesRes,
      tripsRes,
      keysCountRes,
      partnersCountRes,
      disruptionsCountRes,
    ] = await Promise.all([
      supabaseAdmin
        .from('payment_orders')
        .select('id, user_id, plan, method, amount, status, created_at, completed_at')
        .order('created_at', { ascending: true }),
      supabaseAdmin.from('pricing_plans').select('id, label, name'),
      supabaseAdmin
        .from('profiles')
        .select('id, role, pro_credits, monthly_credits, premium_until, created_at'),
      supabaseAdmin
        .from('trips')
        .select('id, preferences, created_at'),
      supabaseAdmin.from('gemini_api_keys').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('partners').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('disruption_events').select('*', { count: 'exact', head: true }),
    ]);

    if (ordersRes.error) throw ordersRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (tripsRes.error) throw tripsRes.error;

    const allOrders = ordersRes.data || [];
    const plansMap = new Map((plansRes.data || []).map((p: any) => [p.id, p]));
    const profiles = profilesRes.data || [];
    const trips = tripsRes.data || [];

    const now = new Date();

    // 2. Lọc đơn thanh toán thật thành công (bỏ đơn admin, bỏ cancelled/pending)
    const realOrders = allOrders.filter(isRealPaidOrder);
    const ordersInRange = realOrders.filter((o: any) => o.created_at >= from && o.created_at <= to);
    const prevOrdersInRange = realOrders.filter((o: any) => o.created_at >= prevFrom && o.created_at < from);

    const revenueValue = ordersInRange.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0);
    const prevRevenueValue = prevOrdersInRange.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0);

    // 3. User KPIs
    const usersTotal = profiles.length;
    const usersNew = profiles.filter((p: any) => p.created_at >= from && p.created_at <= to).length;
    const prevUsersNew = profiles.filter((p: any) => p.created_at >= prevFrom && p.created_at < from).length;

    // Paid users: toàn thời gian & người mua lần đầu trong khoảng
    const userFirstOrderMap = new Map<string, string>();
    realOrders.forEach((o: any) => {
      if (o.user_id) {
        const curMin = userFirstOrderMap.get(o.user_id);
        if (!curMin || o.created_at < curMin) {
          userFirstOrderMap.set(o.user_id, o.created_at);
        }
      }
    });

    const paidUsersTotal = userFirstOrderMap.size;
    let paidUsersNewInRange = 0;
    userFirstOrderMap.forEach((firstDate) => {
      if (firstDate >= from && firstDate <= to) {
        paidUsersNewInRange++;
      }
    });

    // Pro users: user (không admin) còn lượt Pro > 0 và hạn còn hiệu lực
    const nonAdminProfiles = profiles.filter((p: any) => p.role !== UserRole.ADMIN);
    let proUsersWithCredits = 0;
    let creditsOutstanding = 0;

    nonAdminProfiles.forEach((p: any) => {
      const proInfo = getProCredits(p, now);
      if (proInfo.total > 0) {
        proUsersWithCredits++;
      }
      creditsOutstanding += proInfo.total;
    });

    // Trips KPIs
    const tripsTotal = trips.length;
    const tripsNew = trips.filter((t: any) => t.created_at >= from && t.created_at <= to).length;
    const prevTripsNew = trips.filter((t: any) => t.created_at >= prevFrom && t.created_at < from).length;

    const isProTrip = (t: any) => t.preferences?.is_ai_pro === true || t.preferences?.ai_tier === 'pro';
    const tripsPro = trips.filter(isProTrip).length;
    const tripsProNew = trips.filter((t: any) => isProTrip(t) && t.created_at >= from && t.created_at <= to).length;

    // 4. Time series zero-fill
    const dateBucketKeys = generateDateBuckets(from, to, bucket);
    const seriesMap = new Map<
      string,
      { date: string; revenue: number; orders: number; newUsers: number; newTrips: number; newProTrips: number }
    >();

    dateBucketKeys.forEach((key) => {
      seriesMap.set(key, {
        date: key,
        revenue: 0,
        orders: 0,
        newUsers: 0,
        newTrips: 0,
        newProTrips: 0,
      });
    });

    const getKey = (dateStr: string) =>
      bucket === 'day' ? formatVNLocalDate(dateStr) : formatVNLocalMonth(dateStr);

    ordersInRange.forEach((o: any) => {
      const k = getKey(o.created_at);
      const item = seriesMap.get(k);
      if (item) {
        item.revenue += Number(o.amount || 0);
        item.orders += 1;
      }
    });

    profiles.forEach((p: any) => {
      if (p.created_at >= from && p.created_at <= to) {
        const k = getKey(p.created_at);
        const item = seriesMap.get(k);
        if (item) item.newUsers += 1;
      }
    });

    trips.forEach((t: any) => {
      if (t.created_at >= from && t.created_at <= to) {
        const k = getKey(t.created_at);
        const item = seriesMap.get(k);
        if (item) {
          item.newTrips += 1;
          if (isProTrip(t)) item.newProTrips += 1;
        }
      }
    });

    const series = Array.from(seriesMap.values());

    // 5. Gom theo Plan trong khoảng (sắp xếp giảm dần theo doanh thu)
    const planGroupMap = new Map<string, { planId: string; label: string; orders: number; revenue: number }>();
    ordersInRange.forEach((o: any) => {
      const pid = o.plan || 'unknown';
      if (!planGroupMap.has(pid)) {
        planGroupMap.set(pid, {
          planId: pid,
          label: resolvePlanLabel(pid, plansMap),
          orders: 0,
          revenue: 0,
        });
      }
      const entry = planGroupMap.get(pid)!;
      entry.orders += 1;
      entry.revenue += Number(o.amount || 0);
    });

    const plans = Array.from(planGroupMap.values()).sort((a, b) => b.revenue - a.revenue);

    // 6. Gom theo Method trong khoảng ('payos' | 'momo', không có 'admin')
    const methodGroupMap = new Map<string, { method: string; orders: number; revenue: number }>();
    ordersInRange.forEach((o: any) => {
      const m = String(o.method || 'payos').toLowerCase();
      if (!methodGroupMap.has(m)) {
        methodGroupMap.set(m, { method: m, orders: 0, revenue: 0 });
      }
      const entry = methodGroupMap.get(m)!;
      entry.orders += 1;
      entry.revenue += Number(o.amount || 0);
    });
    const methods = Array.from(methodGroupMap.values()).sort((a, b) => b.revenue - a.revenue);

    // 7. Đơn tặng bởi Admin trong khoảng
    const adminOrdersInRange = allOrders.filter(
      (o: any) => isAdminGrantOrder(o) && o.created_at >= from && o.created_at <= to
    );
    const adminGrants = {
      count: adminOrdersInRange.length,
      value: adminOrdersInRange.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0),
    };

    return res.json({
      success: true,
      range,
      from,
      to,
      bucket,
      kpis: {
        revenue: {
          value: revenueValue,
          prev: prevRevenueValue,
          orders: ordersInRange.length,
          prevOrders: prevOrdersInRange.length,
        },
        users: {
          total: usersTotal,
          new: usersNew,
          prevNew: prevUsersNew,
        },
        paidUsers: {
          total: paidUsersTotal,
          newInRange: paidUsersNewInRange,
        },
        proUsers: {
          withCredits: proUsersWithCredits,
        },
        trips: {
          total: tripsTotal,
          new: tripsNew,
          prevNew: prevTripsNew,
          pro: tripsPro,
          proNew: tripsProNew,
        },
        creditsOutstanding,
      },
      series,
      plans,
      methods,
      adminGrants,
      system: {
        apiKeys: keysCountRes.count || 0,
        partners: partnersCountRes.count || 0,
        disruptions: disruptionsCountRes.count || 0,
      },
    });
  } catch (err: any) {
    console.error('[Admin] GET /overview error:', err.message);
    return res.status(500).json({ error: 'Lỗi tải dữ liệu tổng quan quản trị', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /api/admin/revenue - Báo cáo doanh thu & khách hàng
// ─────────────────────────────────────────────────────────────────────────────
router.get('/revenue', async (req: Request, res: Response) => {
  try {
    await autoCancelExpiredOrders();

    const rangeInfo = resolveDateRange(req.query.range as string);
    const { range, from, to, prevFrom, prevTo, bucket } = rangeInfo;

    const [ordersRes, plansRes, profilesRes] = await Promise.all([
      supabaseAdmin
        .from('payment_orders')
        .select('id, user_id, plan, method, amount, status, created_at, completed_at')
        .order('created_at', { ascending: true }),
      supabaseAdmin.from('pricing_plans').select('id, label, name'),
      supabaseAdmin.from('profiles').select('id, email, full_name'),
    ]);

    if (ordersRes.error) throw ordersRes.error;

    const allOrders = ordersRes.data || [];
    const plansMap = new Map((plansRes.data || []).map((p: any) => [p.id, p]));
    const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));

    const realOrders = allOrders.filter(isRealPaidOrder);
    const ordersInRange = realOrders.filter((o: any) => o.created_at >= from && o.created_at <= to);
    const prevOrdersInRange = realOrders.filter((o: any) => o.created_at >= prevFrom && o.created_at < from);

    const revenue = ordersInRange.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0);
    const prev = prevOrdersInRange.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0);
    const ordersCount = ordersInRange.length;
    const prevOrdersCount = prevOrdersInRange.length;
    const avgOrderValue = ordersCount > 0 ? Math.round(revenue / ordersCount) : 0;

    const paidUsersInRange = new Set(ordersInRange.map((o: any) => o.user_id)).size;

    // Repeat buyers toàn thời gian (user mua >= 2 đơn thật completed)
    const userAllOrdersCount = new Map<string, number>();
    realOrders.forEach((o: any) => {
      if (o.user_id) {
        userAllOrdersCount.set(o.user_id, (userAllOrdersCount.get(o.user_id) || 0) + 1);
      }
    });

    let repeatBuyers = 0;
    userAllOrdersCount.forEach((c) => {
      if (c >= 2) repeatBuyers++;
    });

    // Time series
    const dateBucketKeys = generateDateBuckets(from, to, bucket);
    const seriesMap = new Map<string, { date: string; revenue: number; orders: number }>();
    dateBucketKeys.forEach((key) => {
      seriesMap.set(key, { date: key, revenue: 0, orders: 0 });
    });

    const getKey = (dateStr: string) =>
      bucket === 'day' ? formatVNLocalDate(dateStr) : formatVNLocalMonth(dateStr);

    ordersInRange.forEach((o: any) => {
      const k = getKey(o.created_at);
      const item = seriesMap.get(k);
      if (item) {
        item.revenue += Number(o.amount || 0);
        item.orders += 1;
      }
    });
    const series = Array.from(seriesMap.values());

    // byPlan
    const planGroupMap = new Map<string, { planId: string; label: string; orders: number; revenue: number }>();
    ordersInRange.forEach((o: any) => {
      const pid = o.plan || 'unknown';
      if (!planGroupMap.has(pid)) {
        planGroupMap.set(pid, {
          planId: pid,
          label: resolvePlanLabel(pid, plansMap),
          orders: 0,
          revenue: 0,
        });
      }
      const entry = planGroupMap.get(pid)!;
      entry.orders += 1;
      entry.revenue += Number(o.amount || 0);
    });

    const byPlan = Array.from(planGroupMap.values())
      .map((p) => ({
        ...p,
        share: revenue > 0 ? parseFloat(((p.revenue / revenue) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // byMethod
    const methodGroupMap = new Map<string, { method: string; orders: number; revenue: number }>();
    ordersInRange.forEach((o: any) => {
      const m = String(o.method || 'payos').toLowerCase();
      if (!methodGroupMap.has(m)) {
        methodGroupMap.set(m, { method: m, orders: 0, revenue: 0 });
      }
      const entry = methodGroupMap.get(m)!;
      entry.orders += 1;
      entry.revenue += Number(o.amount || 0);
    });

    const byMethod = Array.from(methodGroupMap.values())
      .map((m) => ({
        ...m,
        share: revenue > 0 ? parseFloat(((m.revenue / revenue) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // topBuyers (top 10 toàn thời gian)
    const userAllSpentMap = new Map<string, { orders: number; revenue: number }>();
    realOrders.forEach((o: any) => {
      if (o.user_id) {
        const cur = userAllSpentMap.get(o.user_id) || { orders: 0, revenue: 0 };
        cur.orders += 1;
        cur.revenue += Number(o.amount || 0);
        userAllSpentMap.set(o.user_id, cur);
      }
    });

    const topBuyers = Array.from(userAllSpentMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10)
      .map(([userId, stats]) => {
        const prof: any = profileMap.get(userId);
        return {
          userId,
          email: prof?.email || '',
          fullName: prof?.full_name || 'Người dùng',
          orders: stats.orders,
          revenue: stats.revenue,
        };
      });

    // Admin grants
    const adminOrdersInRange = allOrders.filter(
      (o: any) => isAdminGrantOrder(o) && o.created_at >= from && o.created_at <= to
    );
    const adminGrants = {
      count: adminOrdersInRange.length,
      value: adminOrdersInRange.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0),
    };

    const groupByParam = (req.query.groupBy as string) || 'plan';
    const breakdown = groupByParam === 'method' ? byMethod : byPlan;

    return res.json({
      success: true,
      range,
      from,
      to,
      bucket,
      kpis: {
        revenue,
        realRevenue: revenue,
        prev,
        orders: ordersCount,
        realOrdersCount: ordersCount,
        prevOrders: prevOrdersCount,
        avgOrderValue,
        paidUsers: paidUsersInRange,
        repeatBuyers,
        adminGrants: {
          count: adminGrants.count,
          value: adminGrants.value,
          nominalValue: adminGrants.value,
        },
      },
      series,
      byPlan,
      byMethod,
      breakdown,
      topBuyers,
      adminGrants,
    });
  } catch (err: any) {
    console.error('[Admin] GET /revenue error:', err.message);
    return res.status(500).json({ error: 'Lỗi tải thống kê doanh thu', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET /api/admin/orders - Danh sách đơn hàng với bộ lọc & phân trang
// ─────────────────────────────────────────────────────────────────────────────
router.get('/orders', async (req: Request, res: Response) => {
  try {
    await autoCancelExpiredOrders();

    const statusParam = (req.query.status as string) || 'completed';
    const methodParam = (req.query.method as string) || 'all';
    const planParam = (req.query.plan as string) || 'all';
    const cleanQ = sanitizeSearchQuery(req.query.q as string);
    const fromParam = req.query.from as string;
    const toParam = req.query.to as string;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    // Lấy toàn bộ danh sách đơn hàng và thông tin bổ trợ
    const [ordersRes, plansRes, profilesRes] = await Promise.all([
      supabaseAdmin
        .from('payment_orders')
        .select('id, order_code, user_id, plan, method, amount, status, created_at, completed_at')
        .order('created_at', { ascending: false }),
      supabaseAdmin.from('pricing_plans').select('id, label, name'),
      supabaseAdmin.from('profiles').select('id, email, full_name'),
    ]);

    if (ordersRes.error) throw ordersRes.error;

    const allOrders = ordersRes.data || [];
    const plansMap = new Map((plansRes.data || []).map((p: any) => [p.id, p]));
    const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));

    // Áp dụng bộ lọc
    const filtered = allOrders.filter((o: any) => {
      // 1. Status filter
      if (statusParam !== 'all') {
        const st = (o.status || '').toLowerCase();
        if (statusParam === 'completed') {
          if (st !== 'completed' && st !== 'success') return false;
        } else if (st !== statusParam.toLowerCase()) {
          return false;
        }
      }

      // 2. Method filter
      if (methodParam !== 'all') {
        if ((o.method || '').toLowerCase() !== methodParam.toLowerCase()) {
          return false;
        }
      }

      // 3. Plan filter
      if (planParam !== 'all') {
        if (o.plan !== planParam) {
          return false;
        }
      }

      // 4. Date range filter
      if (fromParam && o.created_at < fromParam) return false;
      if (toParam && o.created_at > toParam) return false;

      // 5. Query filter (q)
      if (cleanQ) {
        const qLower = cleanQ.toLowerCase();
        const idMatch = String(o.id || '').toLowerCase().includes(qLower);
        const codeMatch = String(o.order_code || '').includes(cleanQ);
        const prof: any = profileMap.get(o.user_id);
        const emailMatch = String(prof?.email || '').toLowerCase().includes(qLower);
        const nameMatch = String(prof?.full_name || '').toLowerCase().includes(qLower);

        if (!idMatch && !codeMatch && !emailMatch && !nameMatch) {
          return false;
        }
      }

      return true;
    });

    // Tính summary trên tập kết quả đã lọc
    const summaryOrders = filtered.length;
    const summaryRevenue = filtered
      .filter(isRealPaidOrder)
      .reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0);
    const summaryAdminGrants = filtered
      .filter(isAdminGrantOrder)
      .length;

    // Phân trang
    const offset = (page - 1) * limit;
    const paged = filtered.slice(offset, offset + limit);

    const items = paged.map((o: any) => {
      const prof: any = profileMap.get(o.user_id);
      return {
        id: o.id,
        orderCode: o.order_code,
        userId: o.user_id,
        email: prof?.email || '',
        fullName: prof?.full_name || 'Người dùng',
        plan: o.plan,
        planLabel: resolvePlanLabel(o.plan, plansMap),
        method: o.method,
        amount: Number(o.amount || 0),
        status: o.status,
        createdAt: o.created_at,
        completedAt: o.completed_at || null,
        isAdminGrant: (o.method || '').toLowerCase() === 'admin',
      };
    });

    return res.json({
      success: true,
      orders: items,
      items,
      total: summaryOrders,
      page,
      limit,
      pagination: {
        page,
        limit,
        total: summaryOrders,
        totalPages: Math.ceil(summaryOrders / limit) || 1,
      },
      summary: {
        revenue: summaryRevenue,
        orders: summaryOrders,
        totalRealRevenue: summaryRevenue,
        totalRealOrders: summaryOrders,
        totalAdminGrants: summaryAdminGrants,
      },
    });
  } catch (err: any) {
    console.error('[Admin] GET /orders error:', err.message);
    return res.status(500).json({ error: 'Lỗi tải danh sách đơn hàng', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. POST /api/admin/orders/:id/activate - Kích hoạt thủ công đơn hàng kẹt
// ─────────────────────────────────────────────────────────────────────────────
router.post('/orders/:id/activate', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;

    // 1. Kiểm tra sự tồn tại của đơn hàng
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('payment_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr) throw orderErr;

    if (!order) {
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    }

    if (order.status === PaymentStatus.COMPLETED || order.status === 'success') {
      return res.status(409).json({ error: 'Đơn hàng đã hoàn tất trước đó', code: 'ORDER_ALREADY_COMPLETED' });
    }

    // 2. Kích hoạt đơn hàng qua activateOrderById
    const activateResult = await callActivateOrderById(orderId, { force: true, source: 'admin' });

    if (!activateResult.activated && activateResult.reason === 'already_completed') {
      return res.status(409).json({ error: 'Đơn hàng đã hoàn tất trước đó', code: 'ORDER_ALREADY_COMPLETED' });
    }

    return res.json({
      success: true,
      activated: activateResult.activated,
      reason: activateResult.reason || 'Kích hoạt thủ công thành công bởi Quản trị viên',
    });
  } catch (err: any) {
    console.error('[Admin] POST /orders/:id/activate error:', err.message);
    return res.status(500).json({ error: 'Lỗi kích hoạt đơn hàng thủ công', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET /api/admin/users - Danh sách người dùng với ví lượt & chi tiêu
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users', async (req: Request, res: Response) => {
  try {
    const search = sanitizeSearchQuery(req.query.search as string);
    const filter = (req.query.filter as string) || 'all';
    const sort = (req.query.sort as string) || 'created_desc';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    // Truy vấn song song tối đa 3 bảng: profiles, trips (lấy count), payment_orders (lấy spent)
    const [profilesRes, tripsRes, ordersRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('*'),
      supabaseAdmin.from('trips').select('user_id'),
      supabaseAdmin.from('payment_orders').select('user_id, amount, status, method'),
    ]);

    if (profilesRes.error) throw profilesRes.error;

    const rawProfiles = profilesRes.data || [];
    const trips = tripsRes.data || [];
    const orders = ordersRes.data || [];

    // Gom số chuyến đi theo user_id
    const tripCountMap = new Map<string, number>();
    trips.forEach((t: any) => {
      if (t.user_id) {
        tripCountMap.set(t.user_id, (tripCountMap.get(t.user_id) || 0) + 1);
      }
    });

    // Gom chi tiêu và đơn hàng thật theo user_id
    const spentMap = new Map<string, { totalSpent: number; ordersCount: number }>();
    orders.forEach((o: any) => {
      if (isRealPaidOrder(o) && o.user_id) {
        const cur = spentMap.get(o.user_id) || { totalSpent: 0, ordersCount: 0 };
        cur.totalSpent += Number(o.amount || 0);
        cur.ordersCount += 1;
        spentMap.set(o.user_id, cur);
      }
    });

    const now = new Date();

    // Map item chuẩn hóa
    const allFormattedUsers = rawProfiles.map((p: any) => {
      const proCreditsInfo = getProCredits(p, now);
      const freeQuota = getFreeQuota(p);
      const userSpent = spentMap.get(p.id) || { totalSpent: 0, ordersCount: 0 };

      return {
        id: p.id,
        email: p.email || '',
        fullName: p.full_name || 'Người dùng',
        phone: p.phone || '',
        role: p.role || UserRole.USER,
        createdAt: p.created_at,
        lastSignInAt: p.last_sign_in_at || null,
        bannedUntil: p.banned_until || null,
        proCredits: proCreditsInfo.proCredits,
        monthlyCredits: proCreditsInfo.monthlyCredits,
        monthlyUntil: proCreditsInfo.monthlyUntil,
        monthlyRemainingDays: proCreditsInfo.monthlyRemainingDays,
        remainingTrips: proCreditsInfo.total,
        pro_credits: proCreditsInfo.proCredits,
        monthly_credits: proCreditsInfo.monthlyCredits,
        premium_until: proCreditsInfo.monthlyUntil,
        is_premium: proCreditsInfo.total > 0,
        pro_status: proCreditsInfo.total > 0 ? 'active' : 'inactive',
        freeUsed: freeQuota.used,
        freeTotal: freeQuota.total,
        tripsCount: tripCountMap.get(p.id) || 0,
        totalSpent: userSpent.totalSpent,
        ordersCount: userSpent.ordersCount,
      };
    });

    // Thống kê summary toàn bộ
    const summary = {
      total: allFormattedUsers.length,
      pro: allFormattedUsers.filter((u) => u.remainingTrips > 0).length,
      free: allFormattedUsers.filter((u) => u.remainingTrips === 0 && u.role !== UserRole.ADMIN).length,
      admins: allFormattedUsers.filter((u) => u.role === UserRole.ADMIN).length,
      banned: allFormattedUsers.filter((u) => u.bannedUntil && new Date(u.bannedUntil) > now).length,
    };

    // Áp dụng tìm kiếm
    let filtered = allFormattedUsers;
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          u.email.toLowerCase().includes(s) ||
          u.fullName.toLowerCase().includes(s) ||
          u.phone.includes(search)
      );
    }

    // Áp dụng bộ lọc
    if (filter === 'pro') {
      filtered = filtered.filter((u) => u.remainingTrips > 0);
    } else if (filter === 'free') {
      filtered = filtered.filter((u) => u.remainingTrips === 0 && u.role !== UserRole.ADMIN);
    } else if (filter === 'admin') {
      filtered = filtered.filter((u) => u.role === UserRole.ADMIN);
    } else if (filter === 'banned') {
      filtered = filtered.filter((u) => u.bannedUntil && new Date(u.bannedUntil) > now);
    }

    // Áp dụng sắp xếp
    if (sort === 'created_asc') {
      filtered.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    } else if (sort === 'credits_desc') {
      filtered.sort((a, b) => b.remainingTrips - a.remainingTrips);
    } else if (sort === 'spent_desc') {
      filtered.sort((a, b) => b.totalSpent - a.totalSpent);
    } else {
      // created_desc mặc định
      filtered.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const items = filtered.slice(offset, offset + limit);

    return res.json({
      success: true,
      users: items,
      items,
      total,
      page,
      limit,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      summary,
    });
  } catch (err: any) {
    console.error('[Admin] GET /users error:', err.message);
    return res.status(500).json({ error: 'Lỗi tải danh sách người dùng', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. PUT/POST /api/admin/users/:id/credits - Hạ/thu hồi/chỉnh ví lượt người dùng
// ─────────────────────────────────────────────────────────────────────────────
const handleUpdateUserCredits = async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const validation = validateCreditsInput(req.body);

    if (!validation.valid || !validation.data) {
      return res.status(400).json({ error: validation.error || 'Dữ liệu không hợp lệ' });
    }

    const input = validation.data;

    // 1. Kiểm tra tài khoản đích
    const { data: targetProfile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileErr) throw profileErr;
    if (!targetProfile) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    }

    // Không cho tác động tài khoản role admin
    if (targetProfile.role === UserRole.ADMIN) {
      return res.status(400).json({ error: 'Không thể can thiệp ví lượt của tài khoản Quản trị viên' });
    }

    const now = new Date();
    const currentCredits = {
      pro_credits: Number(targetProfile.pro_credits || 0),
      monthly_credits: Number(targetProfile.monthly_credits || 0),
      premium_until: targetProfile.premium_until || null,
      is_premium: Boolean(targetProfile.is_premium),
    };

    const newCredits = calculateNewCredits(currentCredits, input, now);

    // 2. Cập nhật cơ sở dữ liệu
    const { data: updatedProfile, error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({
        pro_credits: newCredits.pro_credits,
        monthly_credits: newCredits.monthly_credits,
        premium_until: newCredits.premium_until,
        is_premium: newCredits.is_premium,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // 3. Ghi log console có cấu trúc
    console.log(
      `[Admin] update credits: adminId=${(req as any).user?.id}, userId=${userId}, mode=${input.mode}, before=${JSON.stringify(
        currentCredits
      )} -> after=${JSON.stringify(newCredits)}, note=${input.note || ''}`
    );

    // 4. Phát Realtime broadcast
    try {
      const channel = supabaseAdmin.channel(`user_channel_${userId}`);
      await channel.send({
        type: 'broadcast',
        event: 'user_updated',
        payload: { userId, timestamp: Date.now() },
      });
    } catch (e: any) {
      console.warn('[Admin] Realtime broadcast error:', e.message);
    }

    // 5. Trả về cùng shape 1 item của GET /users
    const [tripsCountRes, ordersRes] = await Promise.all([
      supabaseAdmin.from('trips').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('payment_orders').select('amount, status, method').eq('user_id', userId),
    ]);

    const userOrders = (ordersRes.data || []).filter(isRealPaidOrder);
    const totalSpent = userOrders.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0);
    const proInfo = getProCredits(updatedProfile, now);
    const freeQuota = getFreeQuota(updatedProfile);

    const userItem = {
      id: updatedProfile.id,
      email: updatedProfile.email || '',
      fullName: updatedProfile.full_name || 'Người dùng',
      phone: updatedProfile.phone || '',
      role: updatedProfile.role || UserRole.USER,
      createdAt: updatedProfile.created_at,
      lastSignInAt: updatedProfile.last_sign_in_at || null,
      bannedUntil: updatedProfile.banned_until || null,
      proCredits: proInfo.proCredits,
      monthlyCredits: proInfo.monthlyCredits,
      monthlyUntil: proInfo.monthlyUntil,
      monthlyRemainingDays: proInfo.monthlyRemainingDays,
      remainingTrips: proInfo.total,
      pro_credits: updatedProfile.pro_credits,
      monthly_credits: updatedProfile.monthly_credits,
      premium_until: updatedProfile.premium_until,
      is_premium: updatedProfile.is_premium,
      freeUsed: freeQuota.used,
      freeTotal: freeQuota.total,
      tripsCount: tripsCountRes.count || 0,
      totalSpent,
      ordersCount: userOrders.length,
    };

    return res.json({
      success: true,
      message: 'Cập nhật ví lượt thành công',
      user: userItem,
      item: userItem,
    });
  } catch (err: any) {
    console.error('[Admin] credits error:', err.message);
    return res.status(500).json({ error: 'Lỗi cập nhật ví lượt người dùng', details: err.message });
  }
};

router.put('/users/:id/credits', handleUpdateUserCredits);
router.post('/users/:id/credits', handleUpdateUserCredits);

// ─────────────────────────────────────────────────────────────────────────────
// 7. GET /api/admin/plans & DELETE /api/admin/plans/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plans', async (_req: Request, res: Response) => {
  try {
    const [plansRes, ordersRes] = await Promise.all([
      supabaseAdmin.from('pricing_plans').select('*').order('sort_order', { ascending: true }),
      supabaseAdmin
        .from('payment_orders')
        .select('plan, amount, status, method, created_at, completed_at'),
    ]);

    if (plansRes.error) throw plansRes.error;

    const plans = plansRes.data || [];
    const realOrders = (ordersRes.data || []).filter(isRealPaidOrder);

    const planStatsMap = new Map<
      string,
      { ordersCompleted: number; revenue: number; lastSoldAt: string | null }
    >();

    realOrders.forEach((o: any) => {
      const pid = o.plan;
      if (pid) {
        if (!planStatsMap.has(pid)) {
          planStatsMap.set(pid, { ordersCompleted: 0, revenue: 0, lastSoldAt: null });
        }
        const s = planStatsMap.get(pid)!;
        s.ordersCompleted += 1;
        s.revenue += Number(o.amount || 0);
        const orderDate = o.completed_at || o.created_at;
        if (!s.lastSoldAt || orderDate > s.lastSoldAt) {
          s.lastSoldAt = orderDate;
        }
      }
    });

    const enrichedPlans = plans.map((p: any) => {
      const stat = planStatsMap.get(p.id) || { ordersCompleted: 0, revenue: 0, lastSoldAt: null };
      return {
        ...p,
        ordersCompleted: stat.ordersCompleted,
        revenue: stat.revenue,
        lastSoldAt: stat.lastSoldAt,
      };
    });

    return res.json({
      success: true,
      plans: enrichedPlans,
    });
  } catch (err: any) {
    console.error('[Admin] GET /plans error:', err.message);
    return res.status(500).json({ error: 'Lỗi tải danh sách gói cước', details: err.message });
  }
});

router.delete('/plans/:id', async (req: Request, res: Response) => {
  try {
    const planId = req.params.id;

    // 1. Kiểm tra sự tồn tại của gói
    const { data: existingPlan, error: fetchErr } = await supabaseAdmin
      .from('pricing_plans')
      .select('id')
      .eq('id', planId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existingPlan) {
      return res.status(404).json({ error: 'Gói cước không tồn tại' });
    }

    // 2. Kiểm tra an toàn: còn đơn pending trong 30 phút gần đây không
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { count: pendingCount, error: pendingErr } = await supabaseAdmin
      .from('payment_orders')
      .select('*', { count: 'exact', head: true })
      .eq('plan', planId)
      .eq('status', PaymentStatus.PENDING)
      .gte('created_at', thirtyMinutesAgo);

    if (pendingErr) throw pendingErr;

    if (pendingCount && pendingCount > 0) {
      return res.status(409).json({
        error: 'Không thể xóa gói cước vì còn đơn hàng đang chờ thanh toán trong 30 phút gần đây',
        code: 'PLAN_HAS_PENDING_ORDERS',
      });
    }

    // 3. Xóa thật khỏi cơ sở dữ liệu
    const { error: delErr } = await supabaseAdmin.from('pricing_plans').delete().eq('id', planId);
    if (delErr) throw delErr;

    // Tải lại bộ nhớ đệm
    await loadPlansFromDb();

    // Phát broadcast Realtime
    try {
      const channel = supabaseAdmin.channel('pricing_realtime');
      await channel.send({
        type: 'broadcast',
        event: 'plans_updated',
        payload: { timestamp: Date.now() },
      });
    } catch (_) {}

    return res.json({
      success: true,
      message: 'Đã xóa gói cước thành công!',
    });
  } catch (err: any) {
    console.error('[Admin] DELETE /plans/:id error:', err.message);
    return res.status(500).json({ error: 'Lỗi xóa gói cước', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. GET /api/admin/trips - Danh sách chuyến đi toàn hệ thống
// ─────────────────────────────────────────────────────────────────────────────
router.get('/trips', async (req: Request, res: Response) => {
  try {
    const search = sanitizeSearchQuery(req.query.search as string);
    const type = (req.query.type as string) || 'all';
    const status = (req.query.status as string) || '';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    const [tripsRes, profilesRes] = await Promise.all([
      supabaseAdmin
        .from('trips')
        .select('id, title, destination_city, start_date, end_date, status, preferences, traveler_count, budget_total, user_id, created_at')
        .order('created_at', { ascending: false }),
      supabaseAdmin.from('profiles').select('id, email, full_name'),
    ]);

    if (tripsRes.error) throw tripsRes.error;

    const rawTrips = tripsRes.data || [];
    const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));

    const allFormattedTrips = rawTrips.map((t: any) => {
      const prof: any = profileMap.get(t.user_id);
      const isPro = t.preferences?.is_ai_pro === true || t.preferences?.ai_tier === 'pro';

      return {
        id: t.id,
        title: t.title || 'Chuyến đi',
        destinationCity: t.destination_city || '',
        startDate: t.start_date || '',
        endDate: t.end_date || '',
        status: t.status || 'draft',
        isPro,
        travelerCount: Math.max(1, Number(t.traveler_count || 1)),
        budgetTotal: Number(t.budget_total || 0),
        ownerId: t.user_id,
        ownerEmail: prof?.email || '',
        ownerName: prof?.full_name || 'Người dùng',
        createdAt: t.created_at,
      };
    });

    // Thống kê summary
    const summary = {
      total: allFormattedTrips.length,
      pro: allFormattedTrips.filter((t) => t.isPro).length,
      free: allFormattedTrips.filter((t) => !t.isPro).length,
    };

    let filtered = allFormattedTrips;

    // Lọc theo search
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(s) ||
          t.destinationCity.toLowerCase().includes(s) ||
          t.ownerEmail.toLowerCase().includes(s) ||
          t.ownerName.toLowerCase().includes(s)
      );
    }

    // Lọc theo type (pro | free)
    if (type === 'pro') {
      filtered = filtered.filter((t) => t.isPro);
    } else if (type === 'free') {
      filtered = filtered.filter((t) => !t.isPro);
    }

    // Lọc theo status
    if (status) {
      filtered = filtered.filter((t) => t.status === status);
    }

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const items = filtered.slice(offset, offset + limit);

    return res.json({
      success: true,
      trips: items,
      items,
      total,
      page,
      limit,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      summary,
    });
  } catch (err: any) {
    console.error('[Admin] GET /trips error:', err.message);
    return res.status(500).json({ error: 'Lỗi tải danh sách chuyến đi', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CÁC ROUTE GIỮ LẠI (Tương thích ngược & UI Admin hiện hành)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/stats - Thống kê số lượng
router.get('/stats', async (_req: Request, res: Response) => {
  if (isDbMocked) {
    return res.json({ totalUsers: 3, totalTrips: 5, totalDisruptions: 2, totalApiKeys: 12, totalPartners: 1 });
  }
  try {
    const [usersRes, tripsRes, disruptionsRes, keysRes, partnersRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('trips').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('disruption_events').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('gemini_api_keys').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('partners').select('*', { count: 'exact', head: true }),
    ]);

    return res.json({
      totalUsers: usersRes.count || 0,
      totalTrips: tripsRes.count || 0,
      totalDisruptions: disruptionsRes.count || 0,
      totalApiKeys: keysRes.count || 0,
      totalPartners: partnersRes.count || 0,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve stats', details: err.message });
  }
});

// PUT /api/admin/users/:id - Chỉnh sửa thông tin cơ bản
router.put('/users/:id', async (req: Request, res: Response) => {
  const userId = req.params.id;
  const { full_name, phone, quota_total, new_password, role } = req.body;

  try {
    const { data: targetProfile, error: profileFetchErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role')
      .eq('id', userId)
      .maybeSingle();

    if (profileFetchErr) throw profileFetchErr;

    if (role !== undefined && role !== 'admin') {
      if (
        targetProfile?.email === 'team89a6@gmail.com' ||
        (req as any).user?.email === 'team89a6@gmail.com'
      ) {
        return res.status(400).json({
          error: 'Tài khoản Quản trị viên tối cao (team89a6@gmail.com) không thể bị thay đổi vai trò!',
        });
      }

      if ((req as any).user?.id === userId) {
        return res.status(400).json({
          error: 'Bạn không thể tự hạ quyền Admin của chính mình!',
        });
      }
    }

    const updateData: any = { updated_at: new Date().toISOString() };
    if (full_name !== undefined) updateData.full_name = String(full_name).trim();
    if (phone !== undefined) updateData.phone = phone ? String(phone).trim() : null;
    if (quota_total !== undefined) {
      updateData.quota_total = Math.max(0, parseInt(quota_total) || 0);
    }
    if (role && [UserRole.USER, UserRole.ADMIN].includes(role)) {
      if ((req as any).user?.id !== userId) {
        updateData.role = role;
      }
    }

    const { data: updatedProfile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select()
      .maybeSingle();

    if (profileErr) throw profileErr;

    if (new_password && String(new_password).trim().length >= 6) {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: String(new_password).trim(),
      });
    }

    try {
      const channel = supabaseAdmin.channel(`user_channel_${userId}`);
      await channel.send({
        type: 'broadcast',
        event: 'user_updated',
        payload: { userId, timestamp: Date.now() },
      });
    } catch (_) {}

    return res.json({
      success: true,
      message: 'Cập nhật thông tin người dùng thành công!',
      data: updatedProfile,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Không thể cập nhật thông tin người dùng', details: err.message });
  }
});

// DELETE /api/admin/users/:id - Xóa người dùng và dữ liệu liên quan
router.delete('/users/:id', async (req: Request, res: Response) => {
  const userId = req.params.id;
  if (isDbMocked) {
    return res.json({ success: true, message: `Mock deleted user ${userId}`, deletedTripIds: [] });
  }

  try {
    const { data: userTrips } = await supabaseAdmin.from('trips').select('id').eq('user_id', userId);
    const tripIds = (userTrips || []).map((t: any) => t.id);

    if (tripIds.length > 0) {
      const { data: days } = await supabaseAdmin.from('itinerary_days').select('id').in('trip_id', tripIds);
      const dayIds = (days || []).map((d: any) => d.id);

      if (dayIds.length > 0) {
        await supabaseAdmin.from('itinerary_items').delete().in('day_id', dayIds);
      }
      await supabaseAdmin.from('disruption_events').delete().in('trip_id', tripIds);
      await supabaseAdmin.from('itinerary_revisions').delete().in('trip_id', tripIds);
      await supabaseAdmin.from('itinerary_days').delete().in('trip_id', tripIds);
      await supabaseAdmin.from('trips').delete().in('id', tripIds);
    }

    await supabaseAdmin.from('profiles').delete().eq('id', userId);
    await supabaseAdmin.auth.admin.deleteUser(userId);

    return res.json({ success: true, message: 'User and all related data deleted successfully', deletedTripIds: tripIds });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete user and related data', details: err.message });
  }
});

// PUT /api/admin/users/:id/toggle-ban - Khóa / Mở khóa người dùng
router.put('/users/:id/toggle-ban', async (req: Request, res: Response) => {
  const userId = req.params.id;
  if (isDbMocked) {
    return res.json({ success: true, message: `Mock toggled ban for user ${userId}` });
  }

  try {
    const {
      data: { user },
      error: fetchError,
    } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (fetchError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isBanned = !!(user.banned_until && new Date(user.banned_until) > new Date());
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: isBanned ? USER_BAN_CONFIG.UNBAN_DURATION : USER_BAN_CONFIG.DEFAULT_BAN_DURATION,
    });
    if (updateError) throw updateError;

    try {
      const channel = supabaseAdmin.channel(`user_channel_${userId}`);
      await channel.send({
        type: 'broadcast',
        event: 'user_updated',
        payload: { userId, isBanned: !isBanned, timestamp: Date.now() },
      });
    } catch (_) {}

    return res.json({
      success: true,
      isBanned: !isBanned,
      message: isBanned ? 'Đã mở khóa hoạt động người dùng!' : 'Đã khóa hoạt động người dùng thành công!',
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to toggle user ban status', details: err.message });
  }
});

// PUT /api/admin/users/:id/role - Phân quyền Admin / User
router.put('/users/:id/role', async (req: Request, res: Response) => {
  const userId = req.params.id;
  const { role } = req.body;

  if (![UserRole.USER, UserRole.ADMIN].includes(role)) {
    return res.status(400).json({ error: 'Role không hợp lệ. Chỉ chấp nhận "user" hoặc "admin".' });
  }

  try {
    const { data: targetProfile, error: fetchErr } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (
      (targetProfile?.email === 'team89a6@gmail.com' ||
        ((req as any).user?.id === userId && (req as any).user?.email === 'team89a6@gmail.com')) &&
      role !== UserRole.ADMIN
    ) {
      return res.status(400).json({
        error: 'Tài khoản Quản trị viên tối cao (team89a6@gmail.com) không thể bị thay đổi vai trò!',
      });
    }

    if ((req as any).user?.id === userId && role !== UserRole.ADMIN) {
      return res.status(400).json({ error: 'Bạn không thể tự hạ quyền Admin của chính mình!' });
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    try {
      const channel = supabaseAdmin.channel(`user_channel_${userId}`);
      await channel.send({
        type: 'broadcast',
        event: 'user_updated',
        payload: { userId, role, timestamp: Date.now() },
      });
    } catch (_) {}

    return res.json({
      success: true,
      message: `Đã cập nhật vai trò thành ${role === 'admin' ? 'Quản trị viên (Admin)' : 'Người dùng (User)'}!`,
      role,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Cập nhật quyền thất bại', details: err.message });
  }
});

// DELETE /api/admin/trips/:id - Xóa chuyến đi
router.delete('/trips/:id', async (req: Request, res: Response) => {
  const tripId = req.params.id;
  if (isDbMocked) {
    return res.json({ success: true, message: `Mock deleted trip ${tripId}` });
  }

  try {
    const { data: days } = await supabaseAdmin.from('itinerary_days').select('id').eq('trip_id', tripId);
    const dayIds = (days || []).map((d: any) => d.id);

    if (dayIds.length > 0) {
      await supabaseAdmin.from('itinerary_items').delete().in('day_id', dayIds);
    }

    await supabaseAdmin.from('disruption_events').delete().eq('trip_id', tripId);
    await supabaseAdmin.from('itinerary_revisions').delete().eq('trip_id', tripId);
    await supabaseAdmin.from('itinerary_days').delete().eq('trip_id', tripId);
    await supabaseAdmin.from('trips').delete().eq('id', tripId);

    return res.json({ success: true, message: 'Trip and related data deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete trip and related data', details: err.message });
  }
});

// PUT /api/admin/users/:id/package - Cập nhật gói người dùng theo plan_id hoặc thủ công
router.put('/users/:id/package', async (req: Request, res: Response) => {
  const userId = req.params.id;
  const { plan, plan_id, pro_credits, monthly_credits, premium_until, quota_used, is_premium, custom_quota } =
    req.body;

  try {
    const targetPlanKey = plan_id || plan;

    if (targetPlanKey) {
      const { data: dbPlan, error: planErr } = await supabaseAdmin
        .from('pricing_plans')
        .select('*')
        .eq('id', targetPlanKey)
        .maybeSingle();

      if (planErr || !dbPlan) {
        return res.status(400).json({ error: `Gói cước không tồn tại: ${targetPlanKey}` });
      }

      const grantCredits = Number(dbPlan.quota_total_grant ?? 1);
      const durationDays = Number(dbPlan.duration_days ?? 0);

      const { error: rpcErr } = await supabaseAdmin.rpc('grant_plan_credits', {
        p_user_id: userId,
        p_credits: grantCredits,
        p_duration_days: durationDays,
      });

      if (rpcErr) {
        console.warn('[Admin Package] RPC grant_plan_credits error, using fallback:', rpcErr.message);
        const { data: currentProfile } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        const computed = computeGrant(
          currentProfile,
          { quota_total_grant: grantCredits, duration_days: durationDays },
          new Date()
        );

        await supabaseAdmin
          .from('profiles')
          .update({
            pro_credits: computed.pro_credits,
            monthly_credits: computed.monthly_credits,
            premium_until: computed.premium_until,
            is_premium: computed.pro_credits + computed.monthly_credits > 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);
      }

      // Tạo đơn hoàn tất tự động ghi vết admin (PaymentMethod.ADMIN)
      const orderId = `ADMIN_AUTO_${Date.now()}`;
      await supabaseAdmin.from('payment_orders').insert({
        id: orderId,
        user_id: userId,
        method: PaymentMethod.ADMIN,
        plan: dbPlan.id,
        amount: Number(dbPlan.amount ?? 0),
        status: PaymentStatus.COMPLETED,
        order_code: String(Date.now()),
        created_at: new Date().toISOString(),
      });
    } else {
      const updatePayload: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (pro_credits !== undefined) updatePayload.pro_credits = Math.max(0, Number(pro_credits));
      if (monthly_credits !== undefined) updatePayload.monthly_credits = Math.max(0, Number(monthly_credits));
      if (premium_until !== undefined) updatePayload.premium_until = premium_until;
      if (quota_used !== undefined) updatePayload.quota_used = Math.max(0, Number(quota_used));
      if (custom_quota !== undefined) updatePayload.quota_total = Number(custom_quota);
      if (is_premium !== undefined) {
        updatePayload.is_premium = Boolean(is_premium);
      } else if (pro_credits !== undefined || monthly_credits !== undefined) {
        updatePayload.is_premium = Number(pro_credits || 0) + Number(monthly_credits || 0) > 0;
      }

      const { error: updateErr } = await supabaseAdmin.from('profiles').update(updatePayload).eq('id', userId);
      if (updateErr) throw updateErr;
    }

    const { data: updatedProfile } = await supabaseAdmin.from('profiles').select('*').eq('id', userId).maybeSingle();

    try {
      const channel = supabaseAdmin.channel(`user_channel_${userId}`);
      await channel.send({
        type: 'broadcast',
        event: 'user_updated',
        payload: { userId, timestamp: Date.now() },
      });
    } catch (_) {}

    return res.json({ success: true, message: 'Cập nhật gói người dùng thành công', data: updatedProfile });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update user package', details: err.message });
  }
});

// POST /api/admin/plans - Cập nhật/thêm cấu hình gói cước
router.post('/plans', async (req: Request, res: Response) => {
  try {
    const slugify = (text: string) =>
      text
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    const bodyPlans = Array.isArray(req.body)
      ? req.body
      : Array.isArray(req.body.plans)
      ? req.body.plans
      : req.body.plan
      ? [req.body.plan]
      : [];

    if (bodyPlans.length === 0) {
      return res.status(400).json({ error: 'Vui lòng cung cấp danh sách gói cước (plans) để cập nhật.' });
    }

    const { data: existingDbPlans, error: fetchErr } = await supabaseAdmin
      .from('pricing_plans')
      .select('id');
    if (fetchErr) throw fetchErr;

    const existingIdSet = new Set((existingDbPlans || []).map((x: any) => String(x.id)));
    const assignedIdsInBatch = new Set<string>();
    const sanitizedPlans: any[] = [];

    for (let i = 0; i < bodyPlans.length; i++) {
      const p = bodyPlans[i];
      if (!p || typeof p !== 'object') {
        return res.status(400).json({
          error: `Dữ liệu gói cước ở vị trí ${i + 1} không hợp lệ.`,
          field: 'plan',
        });
      }

      const planId = p.id ? String(p.id).trim() : undefined;
      const label = String(p.label || p.name || '').trim();
      if (!label) {
        return res.status(400).json({
          error: 'Tên gói (label) là bắt buộc và không được để trống.',
          field: 'label',
          planId,
        });
      }

      const rawAmount = p.amount !== undefined ? p.amount : p.price;
      const numAmount = Number(rawAmount);
      if (
        rawAmount === undefined ||
        rawAmount === null ||
        rawAmount === '' ||
        isNaN(numAmount) ||
        !Number.isInteger(numAmount) ||
        numAmount <= 0
      ) {
        return res.status(400).json({
          error: 'Giá gói (amount) phải là số nguyên lớn hơn 0.',
          field: 'amount',
          planId,
        });
      }

      const rawQuota = p.quota_total_grant;
      const numQuota = Number(rawQuota);
      if (
        rawQuota === undefined ||
        rawQuota === null ||
        rawQuota === '' ||
        isNaN(numQuota) ||
        !Number.isInteger(numQuota) ||
        numQuota < 1
      ) {
        return res.status(400).json({
          error: 'Số lượt cấp (quota_total_grant) phải là số nguyên lớn hơn hoặc bằng 1.',
          field: 'quota_total_grant',
          planId,
        });
      }

      const rawDuration = p.duration_days;
      const numDuration = Number(rawDuration);
      if (
        rawDuration === undefined ||
        rawDuration === null ||
        rawDuration === '' ||
        isNaN(numDuration) ||
        !Number.isInteger(numDuration) ||
        numDuration < 0
      ) {
        return res.status(400).json({
          error: 'Thời hạn (duration_days) phải là số nguyên lớn hơn hoặc bằng 0.',
          field: 'duration_days',
          planId,
        });
      }

      let sortOrder = 0;
      if (p.sort_order !== undefined && p.sort_order !== null && p.sort_order !== '') {
        const numSort = Number(p.sort_order);
        if (isNaN(numSort) || !Number.isInteger(numSort)) {
          return res.status(400).json({
            error: 'Thứ tự sắp xếp (sort_order) phải là số nguyên.',
            field: 'sort_order',
            planId,
          });
        }
        sortOrder = numSort;
      }

      let finalId = planId;
      if (finalId) {
        if (existingIdSet.has(finalId)) {
          assignedIdsInBatch.add(finalId);
        } else {
          if (assignedIdsInBatch.has(finalId)) {
            let baseId = finalId;
            let counter = 2;
            while (assignedIdsInBatch.has(`${baseId}-${counter}`) || existingIdSet.has(`${baseId}-${counter}`)) {
              counter++;
            }
            finalId = `${baseId}-${counter}`;
          }
          assignedIdsInBatch.add(finalId);
        }
      } else {
        const baseSlug = slugify(label) || 'plan';
        let candidateId = baseSlug;
        let counter = 1;
        while (assignedIdsInBatch.has(candidateId) || existingIdSet.has(candidateId)) {
          counter++;
          candidateId = `${baseSlug}-${counter}`;
        }
        finalId = candidateId;
        assignedIdsInBatch.add(finalId);
      }

      const isActive = p.is_active !== undefined ? Boolean(p.is_active) : true;
      const description = p.description || '';
      const features = Array.isArray(p.features) ? p.features : [];

      sanitizedPlans.push({
        id: finalId,
        label,
        name: label,
        amount: numAmount,
        price: numAmount,
        quota_total_grant: numQuota,
        duration_days: numDuration,
        is_active: isActive,
        description,
        features,
        sort_order: sortOrder,
        is_unlimited: false,
      });
    }

    for (const planData of sanitizedPlans) {
      const { error: upsertErr } = await supabaseAdmin.from('pricing_plans').upsert(planData);
      if (upsertErr) throw upsertErr;
    }

    await loadPlansFromDb();

    const { data: updatedPlans } = await supabaseAdmin
      .from('pricing_plans')
      .select('*')
      .order('sort_order', { ascending: true });

    try {
      const realtimeChannel = supabaseAdmin.channel('pricing_realtime');
      realtimeChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          realtimeChannel
            .send({
              type: 'broadcast',
              event: 'plans_updated',
              payload: { timestamp: Date.now() },
            })
            .then(() => {
              supabaseAdmin.removeChannel(realtimeChannel);
            });
        }
      });
    } catch (_) {}

    return res.json({
      success: true,
      message: 'Cấu hình gói cước đã được cập nhật thành công!',
      plans: updatedPlans || [],
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Lỗi cập nhật cấu hình giá', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CẤU HÌNH API KEYS & AI GATEWAY
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/keys - Retrieve all API keys in the pool
router.get('/keys', async (_req: Request, res: Response) => {
  if (isDbMocked) {
    return res.json([
      { id: '1', key_value: 'AIzaSyBHPaLXoSL8vXh0r0u8nYypHngALsO-ARo', is_active: true, status: 'active', created_at: new Date().toISOString() },
      { id: '2', key_value: 'AIzaSyDh0DV2-y4tIjDQOWvisQNWTwfPgDjENeg', is_active: true, status: 'active', created_at: new Date().toISOString() }
    ]);
  }

  try {
    const { data: keys, error } = await supabaseAdmin
      .from('gemini_api_keys')
      .select('*')
      .or('notes.is.null,notes.neq.ai_gateway_config')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json(keys);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve API keys', details: err.message });
  }
});

// POST /api/admin/keys - Add a new API key
router.post('/keys', async (req: Request, res: Response) => {
  const { key_value, key_values } = req.body;
  if (isDbMocked) return res.json({ success: true, message: 'Mock key added successfully' });

  try {
    let rowsToInsert: any[] = [];
    if (key_values && Array.isArray(key_values)) {
      rowsToInsert = key_values.map((k) => ({ key_value: k.trim(), is_active: true, status: 'active' }));
    } else if (key_value) {
      rowsToInsert = [{ key_value: key_value.trim(), is_active: true, status: 'active' }];
    } else {
      return res.status(400).json({ error: 'Missing parameter key_value or key_values' });
    }

    const { data: existingKeys, error: fetchError } = await supabaseAdmin
      .from('gemini_api_keys')
      .select('key_value');

    if (fetchError) throw fetchError;

    const existingKeySet = new Set((existingKeys || []).map((k: any) => k.key_value));
    const uniqueRowsToInsert = rowsToInsert.filter((row) => !existingKeySet.has(row.key_value));

    if (uniqueRowsToInsert.length === 0) {
      return res.json({ success: true, message: 'Tất cả các key gửi lên đã tồn tại trong cơ sở dữ liệu.' });
    }

    const { data, error } = await supabaseAdmin.from('gemini_api_keys').insert(uniqueRowsToInsert).select();
    if (error) throw error;
    return res.json({ success: true, message: 'API key(s) added successfully', data });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to add API key(s)', details: err.message });
  }
});

// PUT /api/admin/keys/:id - Update status/active state of a key
router.put('/keys/:id', async (req: Request, res: Response) => {
  const keyId = req.params.id;
  const { is_active, status } = req.body;

  if (isDbMocked) return res.json({ success: true, message: `Mock updated key ${keyId}` });

  try {
    const { data, error } = await supabaseAdmin
      .from('gemini_api_keys')
      .update({ is_active, status })
      .eq('id', keyId)
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, message: 'API key updated successfully', data });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update API key', details: err.message });
  }
});

// DELETE /api/admin/keys/:id - Delete an API key
router.delete('/keys/:id', async (req: Request, res: Response) => {
  const keyId = req.params.id;
  if (isDbMocked) return res.json({ success: true, message: `Mock deleted key ${keyId}` });

  try {
    const { error } = await supabaseAdmin.from('gemini_api_keys').delete().eq('id', keyId);
    if (error) throw error;
    return res.json({ success: true, message: 'API key deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete API key', details: err.message });
  }
});

// GET /api/admin/ai-config
router.get('/ai-config', async (_req: Request, res: Response) => {
  try {
    const config = await getEffectiveAiConfig();
    let maskedKey = '';
    if (config.apiKey) {
      if (config.apiKey.length <= 8) {
        maskedKey = '********';
      } else {
        maskedKey = `${config.apiKey.substring(0, 4)}...${config.apiKey.substring(config.apiKey.length - 4)}`;
      }
    }

    return res.json({
      success: true,
      data: {
        provider: config.provider,
        baseUrl: config.baseUrl || '',
        apiKey: maskedKey,
        hasApiKey: !!config.apiKey,
        model: config.model || 'ag/gemini-3-flash',
        isActive: config.isActive,
        maxTokens: config.maxTokens || 16384,
        geminiMaxTokens: config.geminiMaxTokens || 16384,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Lỗi lấy cấu hình AI', details: err.message });
  }
});

// PUT /api/admin/ai-config
router.put('/ai-config', async (req: Request, res: Response) => {
  try {
    const { provider, baseUrl, apiKey, model, isActive, maxTokens, geminiMaxTokens } = req.body;
    const currentConfig = await getEffectiveAiConfig();

    let finalKey = apiKey;
    if (!apiKey || apiKey.includes('...')) {
      finalKey = currentConfig.apiKey;
    }

    await saveAiGatewayConfig({
      provider: provider === 'custom_openai' ? 'custom_openai' : 'gemini',
      baseUrl: baseUrl || '',
      apiKey: finalKey || '',
      model: model || 'ag/gemini-3-flash',
      isActive: Boolean(isActive),
      maxTokens: maxTokens ? Math.max(1024, Math.min(65536, Number(maxTokens))) : currentConfig.maxTokens || 16384,
      geminiMaxTokens: geminiMaxTokens
        ? Math.max(1024, Math.min(65536, Number(geminiMaxTokens)))
        : currentConfig.geminiMaxTokens || 16384,
    });

    return res.json({ success: true, message: 'Cập nhật cấu hình AI thành công!' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Lỗi lưu cấu hình AI', details: err.message });
  }
});

// POST /api/admin/ai-config/test
router.post('/ai-config/test', async (req: Request, res: Response) => {
  try {
    const { baseUrl, apiKey, model } = req.body;
    const currentConfig = await getEffectiveAiConfig();

    let finalKey = apiKey;
    if (!apiKey || apiKey.includes('...')) {
      finalKey = currentConfig.apiKey;
    }

    const finalBaseUrl = baseUrl?.trim() || currentConfig.baseUrl || process.env.CUSTOM_AI_BASE_URL || '';
    if (!finalBaseUrl) {
      return res.status(400).json({ error: 'Vui lòng cung cấp Base URL hoặc cấu hình CUSTOM_AI_BASE_URL trên hệ thống' });
    }
    if (!finalKey) {
      return res.status(400).json({ error: 'Vui lòng cung cấp API Key / Bearer Token' });
    }

    const testResult = await testAiGatewayConnection({
      baseUrl: finalBaseUrl,
      apiKey: finalKey,
      model: model || 'ag/gemini-3-flash',
    });

    return res.json({
      message: 'Kết nối API Gateway thành công!',
      ...testResult,
    });
  } catch (err: any) {
    const errMsg = err.response?.data?.error?.message || err.response?.data?.error || err.message || 'Kết nối thất bại';
    return res.status(500).json({
      success: false,
      error: 'Không thể kết nối đến API Gateway',
      details: errMsg,
    });
  }
});

export default router;
