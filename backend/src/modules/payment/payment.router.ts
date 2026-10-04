import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../../middleware/requireAuth';
import { requireAdmin } from '../../middleware/requireAdmin';
import { supabaseAdmin } from '../../config/supabase';
import {
  createPayOSOrder,
  verifyPayOSWebhook,
  getPayOSOrderInfo,
  cancelPayOSOrder,
  createMoMoOrder,
  verifyMoMoIPN,
  queryMoMoOrderInfo,
  activateOrderById,
  grantCreditsToUser,
  ORDER_EXPIRATION_MS,
} from './payment.service';
import { generateBookingConfirmationHTML } from '../email/email.service';
import {
  PaymentStatus,
  PaymentMethod,
  UserRole,
  DEFAULT_PLANS_CONFIG,
  getProCredits,
  getFreeQuota,
} from '../../constants';

// Re-export activateOrderById so other modules can import from router or service
export { activateOrderById } from './payment.service';

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://vivu-planner.vercel.app';
// SITE_URL = Domain backend (where /api/* routes live)
const SITE_URL = process.env.SITE_URL || 'https://vivu-planner.vercel.app';

// ─── Premium Plans Model ─────────────────────────────────────────────────────
export interface PricingPlanItem {
  id: string;
  amount: number;
  label: string;
  duration_days: number;
  quota_total_grant: number;
  description: string;
  sort_order: number;
  is_active: boolean;
}

export let cachedPlans: PricingPlanItem[] = [];

export async function loadPlansFromDb(): Promise<PricingPlanItem[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('pricing_plans')
      .select('id, amount, price, label, name, duration_days, quota_total_grant, description, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (!error && data && data.length > 0) {
      cachedPlans = data.map((p: any, idx: number) => ({
        id: String(p.id),
        amount: Number(p.amount ?? p.price ?? 0),
        label: String(p.label || p.name || p.id),
        duration_days: Number(p.duration_days ?? 0),
        quota_total_grant: Number(p.quota_total_grant ?? 1),
        description: typeof p.description === 'string' ? p.description : '',
        sort_order: Number(p.sort_order ?? idx),
        is_active: p.is_active !== false,
      }));
      return cachedPlans;
    }
  } catch (err: any) {
    console.error('[Payment] Error loading plans from DB:', err.message);
  }

  // Fallback nếu DB chưa có bản ghi: dùng 2 gói chuẩn không hardcode alias
  if (cachedPlans.length === 0) {
    cachedPlans = [
      {
        id: 'single_trip',
        amount: DEFAULT_PLANS_CONFIG.single_trip.amount,
        label: DEFAULT_PLANS_CONFIG.single_trip.label,
        duration_days: DEFAULT_PLANS_CONFIG.single_trip.duration_days,
        quota_total_grant: DEFAULT_PLANS_CONFIG.single_trip.quota_total_grant,
        description: DEFAULT_PLANS_CONFIG.single_trip.description,
        sort_order: 1,
        is_active: true,
      },
      {
        id: 'monthly',
        amount: DEFAULT_PLANS_CONFIG.monthly.amount,
        label: DEFAULT_PLANS_CONFIG.monthly.label,
        duration_days: DEFAULT_PLANS_CONFIG.monthly.duration_days,
        quota_total_grant: DEFAULT_PLANS_CONFIG.monthly.quota_total_grant,
        description: DEFAULT_PLANS_CONFIG.monthly.description,
        sort_order: 2,
        is_active: true,
      },
    ];
  }
  return cachedPlans;
}

// Đối tượng tương thích ngược cho các nơi import PREMIUM_PLANS
export const PREMIUM_PLANS: Record<string, any> = new Proxy({} as any, {
  get: (_target, prop: string) => {
    const found = cachedPlans.find((p) => p.id === prop);
    if (found) return found;
    return (DEFAULT_PLANS_CONFIG as any)[prop];
  },
});

// ─── POST /api/payment/create-order ─────────────────────────────────────────
router.post('/create-order', requireAuth, async (req: any, res: Response) => {
  try {
    const { method, plan, buyerName, buyerEmail, buyerPhone } = req.body;
    const userId = req.user!.id;

    // 1. Validate phương thức thanh toán TRƯỚC KHI ghi đơn vào DB
    if (!method || ![PaymentMethod.PAYOS, PaymentMethod.MOMO].includes(method)) {
      return res.status(400).json({
        error: 'Phương thức thanh toán không hợp lệ (Vui lòng chọn payos hoặc momo).',
      });
    }

    if (!plan) {
      return res.status(400).json({ error: 'Vui lòng chọn gói cước (plan).' });
    }

    const plans = await loadPlansFromDb();
    const planConfig = plans.find((p) => p.id === plan && p.is_active);
    if (!planConfig) {
      return res.status(400).json({ error: 'Gói cước không hợp lệ hoặc đã ngừng hoạt động.' });
    }

    // 2. Validate số tiền: số nguyên VND > 0
    const amount = Number(planConfig.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Số tiền gói cước không hợp lệ.' });
    }

    // 3. Kiểm tra tài khoản admin: admin đã có đặc quyền vô hạn, không cần mua
    const { data: currentProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (req.isAdmin || currentProfile?.role === UserRole.ADMIN) {
      return res.status(400).json({
        error: 'Tài khoản Quản trị viên đã có toàn quyền truy cập, không cần mua gói.',
      });
    }

    // 4. Hủy các đơn pending cũ của người dùng (gọi PayOS cancel best-effort)
    const { data: oldPendingOrders } = await supabaseAdmin
      .from('payment_orders')
      .select('id, order_code, method')
      .eq('user_id', userId)
      .eq('status', PaymentStatus.PENDING);

    if (oldPendingOrders && oldPendingOrders.length > 0) {
      for (const oldOrd of oldPendingOrders) {
        if (oldOrd.method === PaymentMethod.PAYOS && oldOrd.order_code) {
          await cancelPayOSOrder(oldOrd.order_code, 'Khách tạo đơn mới').catch(() => {});
        }
      }
      await supabaseAdmin
        .from('payment_orders')
        .update({
          status: PaymentStatus.CANCELLED,
          cancelled_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('status', PaymentStatus.PENDING);
    }

    const orderCode = Date.now();
    const orderId = `VIVU${orderCode}`;
    const description = `ViVu Pro ${planConfig.label}`;
    const returnUrl = `${FRONTEND_URL}/chuyen-di?payment=success&orderId=${orderId}`;
    const cancelUrl = `${FRONTEND_URL}/chuyen-di?payment=cancelled`;
    const ipnUrl = `${SITE_URL}/api/payment/momo-ipn`;

    // 5. Lưu đơn pending vào DB kèm snapshot quota_granted
    const quotaGranted = Number(planConfig.quota_total_grant ?? 1);
    const { error: dbErr } = await supabaseAdmin.from('payment_orders').insert({
      id: orderId,
      user_id: userId,
      method,
      plan: planConfig.id,
      amount,
      quota_granted: quotaGranted,
      status: PaymentStatus.PENDING,
      order_code: String(orderCode),
      created_at: new Date().toISOString(),
    });

    if (dbErr) {
      throw new Error(`Database error saving payment order: ${dbErr.message}`);
    }

    // 6. Gọi cổng thanh toán
    if (method === PaymentMethod.PAYOS) {
      try {
        const payosData = await createPayOSOrder({
          orderCode,
          amount,
          description,
          returnUrl,
          cancelUrl,
          buyerName,
          buyerEmail,
          buyerPhone,
        });

        return res.json({
          success: true,
          method: PaymentMethod.PAYOS,
          checkoutUrl: payosData.checkoutUrl,
          qrCode: payosData.qrCode,
          accountNumber: payosData.accountNumber,
          accountName: payosData.accountName,
          bin: payosData.bin,
          orderCode: payosData.orderCode,
          orderId,
          amount,
          plan: planConfig,
        });
      } catch (payosErr: any) {
        console.error('[Payment] PayOS call failed:', payosErr.message);
        // Đánh dấu đơn cancelled để không để pending rác
        await supabaseAdmin
          .from('payment_orders')
          .update({
            status: PaymentStatus.CANCELLED,
            cancelled_at: new Date().toISOString(),
          })
          .eq('id', orderId);

        return res.status(502).json({
          error: `Không thể kết nối cổng PayOS: ${payosErr.message}`,
        });
      }
    }

    if (method === PaymentMethod.MOMO) {
      try {
        const requestId = `${orderId}-${Date.now()}`;
        const momoData = await createMoMoOrder({
          orderId,
          amount,
          orderInfo: description,
          redirectUrl: returnUrl,
          ipnUrl,
          requestId,
        });

        return res.json({
          success: true,
          method: PaymentMethod.MOMO,
          payUrl: momoData.payUrl,
          deeplink: momoData.deeplink,
          qrCodeUrl: momoData.qrCodeUrl,
          orderId: momoData.orderId,
          amount,
          plan: planConfig,
        });
      } catch (momoErr: any) {
        console.error('[Payment] MoMo call failed:', momoErr.message);
        // Đánh dấu đơn cancelled để không để pending rác
        await supabaseAdmin
          .from('payment_orders')
          .update({
            status: PaymentStatus.CANCELLED,
            cancelled_at: new Date().toISOString(),
          })
          .eq('id', orderId);

        return res.status(502).json({
          error: `Không thể kết nối cổng MoMo: ${momoErr.message}`,
        });
      }
    }
  } catch (err: any) {
    console.error('[Payment] create-order error:', err.message);
    return res.status(500).json({
      error: `Lỗi hệ thống: ${err.message}`,
    });
  }
});

// ─── POST & GET /api/payment/payos-webhook ─────────────────────────────────
router.get('/payos-webhook', (_req: Request, res: Response) => {
  return res.json({ success: true, message: 'PayOS webhook endpoint is active' });
});

router.post('/payos-webhook', async (req: Request, res: Response) => {
  try {
    const { code, desc, data } = req.body;

    // Handle PayOS webhook registration & test pings from Dashboard
    // Khi PAYOS_CHECKSUM_KEY chưa được cấu hình, trả về active mà không kích hoạt
    if (
      (!data && (code === '00' || desc === 'success')) ||
      req.body.webhookUrl ||
      data?.orderCode === 123 ||
      desc === 'Webhook confirmation' ||
      !process.env.PAYOS_CHECKSUM_KEY
    ) {
      return res.json({ success: true, message: 'Webhook endpoint active' });
    }

    const isValid = verifyPayOSWebhook(req.body);
    if (!isValid) {
      console.warn('[Payment] PayOS Webhook signature verification failed');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    if (data?.code === '00' || data?.desc === 'success' || data?.status === 'PAID' || code === '00') {
      const numericCode = String(data.orderCode);
      const vivuOrderId = numericCode.startsWith('VIVU') ? numericCode : `VIVU${numericCode}`;
      await activateOrderById(vivuOrderId, {
        source: 'gateway',
        confirmedAmount: Number(data.amount),
        gatewayPaid: true,
      });
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('[Payment] PayOS webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/payment/momo-ipn ─────────────────────────────────────────────
router.post('/momo-ipn', async (req: Request, res: Response) => {
  try {
    const isValid = verifyMoMoIPN(req.body);
    if (!isValid) {
      console.warn('[Payment] MoMo IPN signature verification failed');
      return res.status(400).json({ error: 'Invalid IPN signature' });
    }

    const { resultCode, orderId, amount } = req.body;
    if (resultCode === 0 && orderId) {
      await activateOrderById(orderId, {
        source: 'gateway',
        confirmedAmount: Number(amount),
        gatewayPaid: true,
      });
    }

    // MoMo v2 spec: HTTP 204 No Content hoặc 200
    return res.status(204).send();
  } catch (err: any) {
    console.error('[Payment] MoMo IPN error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/payment/cancel-order ─────────────────────────────────────────
router.post('/cancel-order', requireAuth, async (req: any, res: Response) => {
  try {
    const { orderId, orderCode } = req.body;
    const target = orderId || orderCode;
    if (!target) {
      return res.status(400).json({ error: 'Vui lòng cung cấp orderId hoặc orderCode.' });
    }

    const vivuId = String(target).startsWith('VIVU') ? String(target) : `VIVU${target}`;
    const numericCode = String(target).replace(/\D/g, '');

    const { data: order, error: fetchErr } = await supabaseAdmin
      .from('payment_orders')
      .select('*')
      .or(`id.eq.${vivuId},order_code.eq.${numericCode}`)
      .maybeSingle();

    if (fetchErr || !order) {
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng.' });
    }

    if (order.user_id !== req.user?.id && req.user?.role !== UserRole.ADMIN) {
      return res.status(403).json({ error: 'Bạn không có quyền thao tác với đơn hàng này.' });
    }

    if (order.status === PaymentStatus.COMPLETED) {
      return res.status(400).json({ error: 'Đơn hàng đã thanh toán thành công, không thể hủy.' });
    }

    if (order.status === PaymentStatus.CANCELLED) {
      return res.json({ success: true, message: 'Đơn hàng đã được hủy trước đó.' });
    }

    // Kiểm tra cổng trước khi hủy: nếu khách đã thanh toán thành công thì kích hoạt thay vì hủy!
    let alreadyPaid = false;
    if (order.method === PaymentMethod.PAYOS) {
      const info = await getPayOSOrderInfo(order.order_code || numericCode);
      if (info && (info.status === 'PAID' || info.code === '00')) {
        alreadyPaid = true;
      }
    } else if (order.method === PaymentMethod.MOMO) {
      const info = await queryMoMoOrderInfo(order.id);
      if (info && info.resultCode === 0) {
        alreadyPaid = true;
      }
    }

    if (alreadyPaid) {
      const actResult = await activateOrderById(order.id, { source: 'gateway' });
      return res.json({
        success: true,
        paid: true,
        activated: actResult.activated,
        message: 'Đơn hàng đã được thanh toán trước khi hủy! Gói đã được kích hoạt thành công.',
      });
    }

    // Best-effort hủy đơn ở cổng PayOS
    if (order.method === PaymentMethod.PAYOS && order.order_code) {
      await cancelPayOSOrder(order.order_code, 'Khách hàng bấm hủy trên hệ thống').catch(() => {});
    }

    const { error: cancelErr } = await supabaseAdmin
      .from('payment_orders')
      .update({
        status: PaymentStatus.CANCELLED,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    if (cancelErr) {
      throw cancelErr;
    }

    console.log(`[Payment] Order ${order.id} cancelled by user ${req.user.id}`);
    return res.json({ success: true, message: 'Đã hủy đơn hàng thành công.' });
  } catch (err: any) {
    console.error('[Payment] cancel-order error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/payment/check-order/:orderCode ────────────────────────────────
router.get('/check-order/:orderCode', requireAuth, async (req: any, res: Response) => {
  try {
    await autoCancelExpiredOrders();
    const { orderCode } = req.params;
    const vivuId = orderCode.startsWith('VIVU') ? orderCode : `VIVU${orderCode}`;
    const numericCode = orderCode.startsWith('VIVU') ? orderCode.replace('VIVU', '') : orderCode;

    // 1. Kiểm tra đơn trong DB
    const { data: order } = await supabaseAdmin
      .from('payment_orders')
      .select('id, status, user_id, plan, method, order_code, amount')
      .or(`id.eq.${vivuId},order_code.eq.${numericCode}`)
      .maybeSingle();

    if (order && order.user_id !== req.user?.id && req.user?.role !== UserRole.ADMIN) {
      return res.status(403).json({ success: false, paid: false, error: 'Không có quyền kiểm tra đơn hàng này.' });
    }

    if (order?.status === PaymentStatus.COMPLETED) {
      return res.json({ success: true, paid: true, status: 'PAID' });
    }

    // 2. Chỉ gọi cổng thanh toán tương ứng với phương thức của đơn
    if (order?.method === PaymentMethod.PAYOS) {
      const payosInfo = await getPayOSOrderInfo(order.order_code || numericCode);
      if (payosInfo && (payosInfo.status === 'PAID' || payosInfo.code === '00')) {
        const actRes = await activateOrderById(order.id, { source: 'gateway' });
        if (actRes.activated || actRes.reason === 'already_completed') {
          return res.json({ success: true, paid: true, status: 'PAID' });
        }
      }
    } else if (order?.method === PaymentMethod.MOMO) {
      const momoInfo = await queryMoMoOrderInfo(order.id);
      if (momoInfo && momoInfo.resultCode === 0) {
        const actRes = await activateOrderById(order.id, { source: 'gateway' });
        if (actRes.activated || actRes.reason === 'already_completed') {
          return res.json({ success: true, paid: true, status: 'PAID' });
        }
      }
    }

    return res.json({ success: true, paid: false, status: order?.status || 'PENDING' });
  } catch (err: any) {
    return res.json({ success: false, paid: false, error: err.message });
  }
});

// ─── GET /api/payment/verify-return ──────────────────────────────────────────
router.get('/verify-return', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.query;

    if (!orderId) {
      return res.json({ success: false, message: 'Thiếu orderId.' });
    }

    const vivuId = String(orderId).startsWith('VIVU') ? String(orderId) : `VIVU${orderId}`;
    const numericCode = String(orderId).replace(/\D/g, '');

    const { data: order } = await supabaseAdmin
      .from('payment_orders')
      .select('id, status, user_id, plan, method, order_code, amount')
      .or(`id.eq.${vivuId},order_code.eq.${numericCode}`)
      .maybeSingle();

    if (!order) {
      return res.json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    }

    if (order.status === PaymentStatus.COMPLETED) {
      return res.json({ success: true, message: 'Đã kích hoạt trước đó. Lượt AI đã sẵn sàng!' });
    }

    // Chỉ gọi cổng thanh toán tương ứng
    let isVerifiedPaid = false;
    if (order.method === PaymentMethod.PAYOS) {
      const payosInfo = await getPayOSOrderInfo(order.order_code || numericCode);
      if (payosInfo && (payosInfo.status === 'PAID' || payosInfo.code === '00')) {
        isVerifiedPaid = true;
      }
    } else if (order.method === PaymentMethod.MOMO) {
      const momoInfo = await queryMoMoOrderInfo(order.id);
      if (momoInfo && momoInfo.resultCode === 0) {
        isVerifiedPaid = true;
      }
    }

    if (!isVerifiedPaid) {
      // Kiểm tra xem webhook có kích hoạt completed song song chưa
      const { data: refreshed } = await supabaseAdmin
        .from('payment_orders')
        .select('status')
        .eq('id', order.id)
        .maybeSingle();

      if (refreshed?.status === PaymentStatus.COMPLETED) {
        return res.json({ success: true, message: 'Đã kích hoạt trước đó. Lượt AI đã sẵn sàng!' });
      }

      return res.json({
        success: false,
        message: 'Thanh toán chưa hoàn tất hoặc chưa được cổng thanh toán xác nhận.',
      });
    }

    // Kích hoạt qua nguồn duy nhất activateOrderById
    const actRes = await activateOrderById(order.id, { source: 'gateway' });
    if (actRes.activated || actRes.reason === 'already_completed') {
      return res.json({ success: true, message: 'Đã kích hoạt gói thành công! Lượt AI đã được cộng vào tài khoản.' });
    }

    return res.json({
      success: false,
      message: actRes.reason || 'Kích hoạt không thành công.',
    });
  } catch (err: any) {
    console.error('[Payment] verify-return error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/payment/diagnose ────────────────────────────────────────────────
router.get('/diagnose', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    await loadPlansFromDb();
    const email = req.query.email as string;
    if (!email) {
      return res.status(400).json({ error: 'Vui lòng cung cấp email query parameter (?email=...)' });
    }

    const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) {
      return res.status(500).json({ error: 'Lỗi lấy danh sách user từ auth: ' + listErr.message });
    }

    const userObj = (listData.users as any[]).find(
      (u: any) => u.email?.toLowerCase().trim() === String(email).toLowerCase().trim()
    );
    if (!userObj) {
      return res.status(404).json({ error: `Không tìm thấy user nào với email: ${email} trong auth.users` });
    }

    const userId = userObj.id;

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    const { data: orders, error: ordersErr } = await supabaseAdmin
      .from('payment_orders')
      .select('*')
      .eq('user_id', userId);

    const latestOrder = orders?.find((o) => o.status === 'completed' || o.status === 'success');
    const activationSuccess = false;
    const activationError: string | null = null;

    return res.json({
      success: true,
      email,
      userId,
      userCreatedAt: userObj.created_at,
      profile,
      profileErr: profileErr?.message || null,
      orders,
      ordersErr: ordersErr?.message || null,
      latestOrder,
      activationSuccess,
      activationError,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/payment/plans ───────────────────────────────────────────────────
router.get('/plans', async (_req: Request, res: Response) => {
  try {
    const plans = await loadPlansFromDb();
    return res.json({
      success: true,
      plans,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/payment/status ─────────────────────────────────────────────────
router.get('/status', requireAuth, async (req: any, res: Response) => {
  try {
    await autoCancelExpiredOrders();
    const userId = req.user!.id;

    let profile: any = null;
    let dbWarning: string | null = null;
    try {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('[Payment Status] Supabase select error:', error.message);
        dbWarning = error.message;
      } else {
        profile = data;
      }
    } catch (err: any) {
      console.error('[Payment Status] Supabase query crashed:', err.message);
      dbWarning = err.message;
    }

    const isAdmin = req.isAdmin === true || profile?.role === UserRole.ADMIN;
    const now = new Date();
    const proInfo = getProCredits(profile, now);
    const freeQuota = getFreeQuota(profile);

    let planName = 'Gói Miễn Phí';
    let planId = 'free';

    if (isAdmin) {
      planName = 'Gói Admin Đặc Quyền (Vô hạn)';
      planId = 'admin';
    } else if (proInfo.proCredits > 0 && proInfo.monthlyCredits > 0) {
      planName = 'Gói theo lượt + Gói theo ngày';
      planId = 'combo';
    } else if (proInfo.proCredits > 0 && proInfo.monthlyCredits === 0) {
      planId = 'single_trip';
      try {
        const { data: latestOrder } = await supabaseAdmin
          .from('payment_orders')
          .select('plan')
          .eq('user_id', userId)
          .in('status', ['completed', 'success'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestOrder?.plan) {
          const plans = await loadPlansFromDb();
          const matchedPlan = plans.find((p) => p.id === latestOrder.plan);
          planName = matchedPlan?.label || 'Gói Chuyến Đơn';
          planId = matchedPlan?.id || 'single_trip';
        } else {
          planName = 'Gói Chuyến Đơn';
        }
      } catch {
        planName = 'Gói Chuyến Đơn';
      }
    } else if (proInfo.proCredits === 0 && proInfo.monthlyCredits > 0) {
      planId = 'monthly';
      try {
        const { data: latestOrder } = await supabaseAdmin
          .from('payment_orders')
          .select('plan')
          .eq('user_id', userId)
          .in('status', ['completed', 'success'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestOrder?.plan) {
          const plans = await loadPlansFromDb();
          const matchedPlan = plans.find((p) => p.id === latestOrder.plan);
          planName = matchedPlan?.label || 'Gói 1 Tháng';
          planId = matchedPlan?.id || 'monthly';
        } else {
          planName = 'Gói 1 Tháng';
        }
      } catch {
        planName = 'Gói 1 Tháng';
      }
    }

    const isPremium = isAdmin || proInfo.total > 0;
    const hasActiveMonthly = !isAdmin && proInfo.hasActiveMonthly && proInfo.monthlyCredits > 0;

    return res.json({
      isPremium,
      remainingTrips: isAdmin ? 9999 : proInfo.total,
      singleCredits: isAdmin ? 9999 : proInfo.proCredits,
      monthlyCredits: isAdmin ? 0 : (hasActiveMonthly ? proInfo.monthlyCredits : 0),
      monthlyUntil: hasActiveMonthly ? proInfo.monthlyUntil : null,
      monthlyRemainingDays: hasActiveMonthly ? proInfo.monthlyRemainingDays : null,
      freeRemaining: isAdmin ? 9999 : freeQuota.remaining,
      freeTotal: isAdmin ? 9999 : freeQuota.total,
      planName,
      planId,
      dbWarning,
      premiumUntil: hasActiveMonthly ? proInfo.monthlyUntil : null,
      remainingDays: hasActiveMonthly ? proInfo.monthlyRemainingDays : null,
      tripsQuota: isAdmin ? 9999 : freeQuota.total,
      tripsUsed: isAdmin ? 0 : freeQuota.used,
      hasActiveMonthly,
    });
  } catch (err: any) {
    return res.json({
      isPremium: false,
      remainingTrips: 3,
      singleCredits: 0,
      monthlyCredits: 0,
      monthlyUntil: null,
      monthlyRemainingDays: null,
      freeRemaining: 3,
      freeTotal: 3,
      planName: 'Gói Miễn Phí',
      planId: 'free',
      dbWarning: err.message,
      premiumUntil: null,
      remainingDays: null,
      tripsQuota: 3,
      tripsUsed: 0,
      hasActiveMonthly: false,
    });
  }
});

// ─── GET /api/payment/my-orders ─────────────────────────────────────────────
router.get('/my-orders', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const { data: orders, error } = await supabaseAdmin
      .from('payment_orders')
      .select('id, amount, plan, method, status, order_code, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return res.json({ success: true, orders: orders || [] });
  } catch (err: any) {
    console.error('[Payment] my-orders error:', err.message);
    return res.status(500).json({ error: `Lỗi lấy lịch sử giao dịch: ${err.message}` });
  }
});

// ─── POST /api/payment/bookings ──────────────────────────────────────────────
router.post('/bookings', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const {
      tripId,
      tripTitle,
      destinationCity,
      startDate,
      endDate,
      guestName,
      guestEmail,
      guestPhone,
      guestCount,
      selectedItems,
      totalCost,
    } = req.body;

    const bookingCode = `BK${Date.now().toString(36).toUpperCase()}`;
    const token = crypto.randomBytes(24).toString('hex');
    const confirmUrl = `${FRONTEND_URL}/api/payment/bookings/confirm/${token}`;

    const emailHTML = generateBookingConfirmationHTML({
      guestName,
      tripTitle,
      destinationCity,
      startDate,
      endDate,
      guestCount,
      items: selectedItems,
      totalCost,
      confirmUrl,
      bookingCode,
    });

    const { error } = await supabaseAdmin
      .from('bookings')
      .insert({
        id: bookingCode,
        user_id: userId,
        trip_id: tripId,
        token,
        guest_name: guestName,
        guest_email: guestEmail,
        guest_phone: guestPhone,
        guest_count: guestCount,
        items: selectedItems,
        total_cost: totalCost,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Database error saving booking: ${error.message}`);
    }

    return res.status(201).json({
      success: true,
      bookingCode,
      confirmUrl,
      emailHTML,
      message: `Đã tạo yêu cầu đặt dịch vụ! Mã: ${bookingCode}`,
    });
  } catch (err: any) {
    console.error('[Booking] create error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/payment/bookings/confirm/:token ────────────────────────────────
router.get('/bookings/confirm/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { data: booking, error } = await supabaseAdmin
      .from('bookings')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('token', token)
      .eq('status', 'pending')
      .select()
      .single();

    if (error || !booking) {
      return res.redirect(`${FRONTEND_URL}/?booking_error=invalid_or_expired`);
    }

    return res.redirect(`${FRONTEND_URL}/chuyen-di/${booking.trip_id}?booking_confirmed=${booking.id}`);
  } catch (err: any) {
    return res.redirect(`${FRONTEND_URL}/?booking_error=server_error`);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
export async function activatePremiumForUser(userId: string, planKey: string = 'monthly') {
  // Đọc cấu hình gói cước từ Database (KHÔNG lọc is_active để gói bị ẩn vẫn kích hoạt được)
  const { data: dbPlan, error: planErr } = await supabaseAdmin
    .from('pricing_plans')
    .select('*')
    .eq('id', planKey)
    .maybeSingle();

  if (planErr || !dbPlan) {
    throw new Error(`Gói cước không tồn tại trong hệ thống: ${planKey}`);
  }

  const grantCredits = Number(dbPlan.quota_total_grant ?? 1);
  const durationDays = Number(dbPlan.duration_days ?? 0);

  await grantCreditsToUser(userId, grantCredits, durationDays);

  try {
    const channel = supabaseAdmin.channel(`user_channel_${userId}`);
    await channel.send({
      type: 'broadcast',
      event: 'user_updated',
      payload: {
        userId,
        timestamp: Date.now(),
      },
    });
  } catch (e: any) {
    console.warn('[Payment] Realtime broadcast error:', e.message);
  }

  return { success: true };
}

export async function autoCancelExpiredOrders() {
  try {
    const expiredThreshold = new Date(Date.now() - ORDER_EXPIRATION_MS).toISOString();
    const { data: expiredOrders, error: fetchErr } = await supabaseAdmin
      .from('payment_orders')
      .select('id, order_code, method')
      .eq('status', PaymentStatus.PENDING)
      .lt('created_at', expiredThreshold);

    if (fetchErr) {
      console.error('[Payment] Error fetching expired orders:', fetchErr.message);
      return;
    }

    if (expiredOrders && expiredOrders.length > 0) {
      for (const ord of expiredOrders) {
        if (ord.method === PaymentMethod.PAYOS && ord.order_code) {
          await cancelPayOSOrder(ord.order_code, 'Đơn hàng hết hạn thanh toán').catch(() => {});
        }
      }

      const { error: updateErr } = await supabaseAdmin
        .from('payment_orders')
        .update({
          status: PaymentStatus.CANCELLED,
          cancelled_at: new Date().toISOString(),
        })
        .eq('status', PaymentStatus.PENDING)
        .lt('created_at', expiredThreshold);

      if (updateErr) {
        console.error('[Payment] Error auto-cancelling expired orders:', updateErr.message);
      } else {
        console.log(`[Payment] Auto-cancelled ${expiredOrders.length} expired orders`);
      }
    }
  } catch (err: any) {
    console.error('[Payment] Exception auto-cancelling expired orders:', err.message);
  }
}

export default router;
