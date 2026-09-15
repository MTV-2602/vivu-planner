import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../../middleware/requireAuth';
import { requireAdmin } from '../../middleware/requireAdmin';
import { supabaseAdmin } from '../../config/supabase';
import { createPayOSOrder, verifyPayOSWebhook, getPayOSOrderInfo, createMoMoOrder, verifyMoMoIPN, queryMoMoOrderInfo } from './payment.service';
import { generateBookingConfirmationHTML } from '../email/email.service';
import {
  PaymentStatus,
  PaymentMethod,
  UserRole,
  ORDER_CONFIG,
  DEFAULT_PLANS_CONFIG,
  QUOTA_CONFIG,
  isUserPremium,
} from '../../constants';

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://vivu-planner.vercel.app';
// SITE_URL = Domain backend (where /api/* routes live)
const SITE_URL = process.env.SITE_URL || 'https://vivu-planner.vercel.app';


// ─── Premium Plans ───────────────────────────────────────────────────────────
export const PREMIUM_PLANS: Record<string, { amount: number; label: string; duration_days: number; quota_total_grant: number; is_unlimited?: boolean }> = {
  ...DEFAULT_PLANS_CONFIG
};

export async function loadPlansFromDb(): Promise<Record<string, { amount: number; label: string; duration_days: number; quota_total_grant: number; is_unlimited?: boolean }>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('pricing_plans')
      .select('*')
      .eq('is_active', true);

    if (!error && data && data.length > 0) {
      data.forEach((p: any) => {
        const id = p.id;
        PREMIUM_PLANS[id] = {
          amount: Number(p.price ?? p.amount ?? 0),
          label: p.name ?? p.label ?? id,
          duration_days: Number(p.duration_days || 30),
          quota_total_grant: Number(p.quota_total_grant ?? 9999),
          is_unlimited: !!p.is_unlimited
        };
      });
    }
  } catch (err: any) {
    console.error('[Payment] Error loading plans from DB:', err.message);
  }
  return PREMIUM_PLANS;
}

// ─── POST /api/payment/create-order ─────────────────────────────────────────
// Create payment order for PayOS or MoMo (with robust fallback if API keys are not configured)
router.post('/create-order', requireAuth, async (req: any, res: Response) => {
  try {
    await loadPlansFromDb();
    const { method, plan = 'monthly', buyerName, buyerEmail, buyerPhone } = req.body;
    const userId = req.user!.id;
    const planConfig = PREMIUM_PLANS[plan as keyof typeof PREMIUM_PLANS] || PREMIUM_PLANS.monthly;
    const orderCode = Date.now();
    const orderId = `VIVU${orderCode}`;
    const description = `ViVu Pro ${planConfig.label}`;
    const returnUrl = `${FRONTEND_URL}/chuyen-di?payment=success&orderId=${orderId}`;
    const cancelUrl = `${FRONTEND_URL}/chuyen-di?payment=cancelled`;
    // IPN points to same Vercel domain since backend (/api/*) and frontend share the same origin
    const ipnUrl = `${SITE_URL}/api/payment/momo-ipn`;

    // Save pending order to DB
    const { error: dbErr } = await supabaseAdmin.from('payment_orders').insert({
      id: orderId,          // VIVU{orderCode} — primary key
      user_id: userId,
      method,
      plan,
      amount: planConfig.amount,
      status: PaymentStatus.PENDING,
      order_code: String(orderCode), // numeric timestamp — for PayOS lookup
      created_at: new Date().toISOString(),
    });
    if (dbErr) {
      throw new Error(`Database error saving payment order: ${dbErr.message}`);
    }

    if (method === PaymentMethod.PAYOS) {
      try {
        const payosData = await createPayOSOrder({
          orderCode,
          amount: planConfig.amount,
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
          orderCode: payosData.orderCode, // numeric — for PayOS polling
          orderId,                         // VIVU{orderCode} — for DB lookup
          amount: planConfig.amount,
          plan: planConfig,
        });
      } catch (payosErr: any) {
        console.error('[Payment] PayOS real API error:', payosErr.message);
        return res.status(400).json({
          error: `PayOS Error: ${payosErr.message}`,
          details: payosErr.message,
        });
      }
    }

    if (method === PaymentMethod.MOMO) {
      try {
        const requestId = `${orderId}-${Date.now()}`;
        const momoData = await createMoMoOrder({
          orderId,
          amount: planConfig.amount,
          orderInfo: description,
          redirectUrl: returnUrl,
          ipnUrl,
          requestId,
        });
        return res.json({
          success: true,
          method: 'momo',
          payUrl: momoData.payUrl,
          deeplink: momoData.deeplink,
          qrCodeUrl: momoData.qrCodeUrl,
          orderId: momoData.orderId,
          amount: planConfig.amount,
          plan: planConfig,
        });
      } catch (momoErr: any) {
        console.error('[Payment] MoMo real API error:', momoErr.message);
        return res.status(400).json({
          error: `MoMo Error: ${momoErr.message}`,
          details: momoErr.message,
        });
      }
    }

    return res.status(400).json({
      error: 'Phương thức thanh toán không hợp lệ (Vui lòng chọn PayOS hoặc MoMo)',
    });
  } catch (err: any) {
    console.error('[Payment] create-order error:', err.message);
    return res.status(500).json({
      error: `Lỗi hệ thống: ${err.message}`,
      details: err.message,
    });
  }
});

// ─── POST /api/payment/payos-webhook ────────────────────────────────────────
router.post('/payos-webhook', async (req: Request, res: Response) => {
  try {
    const { code, desc, data } = req.body;

    // Handle PayOS webhook registration test pings (/confirm-webhook)
    if (!data && (code === '00' || desc === 'success')) {
      return res.json({ success: true, message: 'Webhook endpoint active' });
    }

    const isValid = verifyPayOSWebhook(req.body);
    if (!isValid) {
      console.warn('[PayOS Webhook] Signature verification failed');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

  // PayOS webhook: data.orderCode is the numeric code
  // The DB id = VIVU{orderCode}, so build that
  if (data?.code === '00' || data?.desc === 'success' || data?.status === 'PAID' || code === '00') {
    const numericCode = String(data.orderCode);
    const vivuOrderId = numericCode.startsWith('VIVU') ? numericCode : `VIVU${numericCode}`;
    await activatePremiumByOrderId(vivuOrderId);
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
    if (!isValid) return res.status(400).json({ error: 'Invalid IPN signature' });

    const { resultCode, orderId } = req.body;
    if (resultCode === 0) {
      await activatePremiumByOrderId(orderId);
    }
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[Payment] MoMo IPN error:', err);
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

    // 1. Tìm user trong Auth Supabase bằng email
    const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) {
      return res.status(500).json({ error: 'Lỗi lấy danh sách user từ auth: ' + listErr.message });
    }

    const userObj = listData.users.find(u => u.email?.toLowerCase().trim() === email.toLowerCase().trim());
    if (!userObj) {
      return res.status(404).json({ error: `Không tìm thấy user nào với email: ${email} trong auth.users` });
    }

    const userId = userObj.id;

    // 2. Lấy profile
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    // 3. Lấy các đơn hàng
    const { data: orders, error: ordersErr } = await supabaseAdmin
      .from('payment_orders')
      .select('*')
      .eq('user_id', userId);

    // 4. Diagnose only — không tự động kích hoạt premium, tránh side effect không mong muốn
    const latestOrder = orders?.find(o => o.status === 'completed' || o.status === 'success');
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
    await loadPlansFromDb();
    return res.json({
      success: true,
      plans: PREMIUM_PLANS,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/payment/status ─────────────────────────────────────────────────
router.get('/status', requireAuth, async (req: any, res: Response) => {
  try {
    await loadPlansFromDb();
    await autoCancelExpiredOrders();
    const userId = req.user!.id;

    const { count: dbTripsCount } = await supabaseAdmin
      .from('trips')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

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
      } else {
        profile = data;
      }
    } catch (err: any) {
      console.error('[Payment Status] Supabase query crashed:', err.message);
    }

    // Query for any completed or successful order to perform auto-healing activation
    const { data: latestOrder } = await supabaseAdmin
      .from('payment_orders')
      .select('plan, created_at, status')
      .eq('user_id', userId)
      .in('status', ['completed', 'success'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Auto-healing: If user has a completed order, but profile is not premium yet (e.g. columns were missing before), activate now!
    if (latestOrder && profile && !dbWarning) {
      const isCurrentlyPremium = isUserPremium(profile);
      
      if (!isCurrentlyPremium) {
        console.log(`[Payment Status] 🔮 Auto-healing: User ${userId} has a completed order (${latestOrder.plan}) but profile is not premium. Activating now...`);
        await activatePremiumForUser(userId, latestOrder.plan || 'pro');
        // Reload profile after activation
        try {
          const { data: reloaded } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
          if (reloaded) profile = reloaded;
        } catch (_) {}
      }
    }

    const isAdmin = req.isAdmin === true || profile?.role === UserRole.ADMIN;

    if (isAdmin) {
      return res.json({
        isPremium: true,
        premiumUntil: '2099-12-31T23:59:59.000Z',
        planName: 'Gói Admin Đặc Quyền (Vô hạn)',
        tripsUsed: dbTripsCount || 0,
        tripsQuota: 9999,
        remainingTrips: 9999,
        dbWarning,
      });
    }

    const isPremium = isUserPremium(profile);

    const tripsQuota = isPremium 
      ? (profile?.quota_total ?? 9999) 
      : (profile?.quota_total ?? (profile?.custom_quota ?? QUOTA_CONFIG.DEFAULT_FREE_TRIPS));
    const tripsUsed = Math.max(profile?.quota_used ?? 0, profile?.trips_used ?? 0, dbTripsCount || 0);
    const remainingTrips = isPremium && tripsQuota >= 9999 ? 9999 : Math.max(0, tripsQuota - tripsUsed);

    let planName = 'Gói Miễn Phí';
    let planId = 'free';

    if (isPremium) {
      planId = latestOrder?.plan || 'pro';
      if (planId === 'plus' || planId === 'starter') {
        planName = 'Gói Starter';
      } else {
        planName = 'Gói Premium';
      }
    }

    return res.json({
      isPremium,
      premiumUntil: profile?.premium_until || null,
      planName,
      planId,
      tripsUsed,
      tripsQuota,
      remainingTrips,
      dbWarning,
    });
  } catch (err: any) {
    return res.json({
      isPremium: false,
      premiumUntil: null,
      planName: 'Gói Miễn Phí (3 lượt)',
      tripsUsed: 0,
      tripsQuota: 3,
      remainingTrips: 3,
    });
  }
});

// ─── GET /api/payment/check-order/:orderCode ────────────────────────────────
// orderCode can be: numeric (PayOS orderCode) OR full VIVU-prefixed string
router.get('/check-order/:orderCode', requireAuth, async (req: any, res: Response) => {
  try {
    await autoCancelExpiredOrders();
    const { orderCode } = req.params;
    // Normalize to both formats
    const vivuId = orderCode.startsWith('VIVU') ? orderCode : `VIVU${orderCode}`;
    const numericCode = orderCode.startsWith('VIVU') ? orderCode.replace('VIVU', '') : orderCode;

    // 1. Check DB by primary key (VIVU-prefixed)
    const { data: order } = await supabaseAdmin
      .from('payment_orders')
      .select('id, status, user_id, plan, method')
      .eq('id', vivuId)
      .maybeSingle();

    if (order && order.user_id !== req.user?.id && req.user?.role !== UserRole.ADMIN) {
      return res.status(403).json({ success: false, paid: false, error: 'Không có quyền kiểm tra đơn hàng này' });
    }

    if (order?.status === PaymentStatus.COMPLETED) {
      return res.json({ success: true, paid: true, status: 'PAID' });
    }

    // 2. Query PayOS directly using numeric orderCode
    try {
      const payosInfo = await getPayOSOrderInfo(numericCode);
      if (payosInfo && (payosInfo.status === 'PAID' || payosInfo.code === '00')) {
        await activatePremiumByOrderId(vivuId);
        return res.json({ success: true, paid: true, status: 'PAID' });
      }
    } catch (_) {}

    // 3. Query MoMo directly using VIVU-prefixed orderId
    try {
      const momoInfo = await queryMoMoOrderInfo(vivuId, vivuId);
      if (momoInfo && momoInfo.resultCode === 0) {
        await activatePremiumByOrderId(vivuId);
        return res.json({ success: true, paid: true, status: 'PAID' });
      }
    } catch (_) {}

    return res.json({ success: true, paid: false, status: order?.status || 'PENDING' });
  } catch (err: any) {
    return res.json({ success: false, paid: false, error: err.message });
  }
});

// ─── GET /api/payment/verify-return ──────────────────────────────────────────
// Called by frontend after payment provider redirects back to the app.
// For MoMo: resultCode=0 means success. For PayOS: code=00 or status=PAID.
router.get('/verify-return', async (req: Request, res: Response) => {
  try {
    const { orderId, resultCode, status } = req.query;

    if (!orderId) {
      return res.json({ success: false, message: 'Thiếu orderId.' });
    }

    const vivuId = String(orderId);
    const numericCode = vivuId.replace(/\D/g, '');

    // Check existing order record in DB
    const { data: order } = await supabaseAdmin
      .from('payment_orders')
      .select('id, status, user_id, plan, method, order_code')
      .eq('id', vivuId)
      .maybeSingle();

    if (!order) {
      return res.json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    }

    // If order is already completed (e.g. IPN arrived first), return success idempotently
    if (order.status === PaymentStatus.COMPLETED) {
      return res.json({ success: true, message: 'Đã kích hoạt trước đó. Lượt AI đã sẵn sàng!' });
    }

    // Check cancellation
    const isCancelled =
      String(resultCode) === '1006' ||
      String(resultCode) === '49' ||
      String(status) === 'CANCELLED' ||
      order.status === PaymentStatus.CANCELLED;

    if (isCancelled) {
      return res.json({ success: false, message: 'Giao dịch đã bị hủy.' });
    }

    // Verify transaction status securely with payment gateways
    let isVerifiedPaid = false;

    // 1. PayOS verification
    if (order.method === PaymentMethod.PAYOS || !order.method) {
      try {
        const queryCode = order.order_code || numericCode;
        if (queryCode) {
          const payosInfo = await getPayOSOrderInfo(queryCode);
          if (payosInfo && (payosInfo.status === 'PAID' || payosInfo.code === '00')) {
            isVerifiedPaid = true;
          }
        }
      } catch (_) {}
    }

    // 2. MoMo verification
    if (!isVerifiedPaid && (order.method === PaymentMethod.MOMO || !order.method)) {
      try {
        const momoInfo = await queryMoMoOrderInfo(vivuId, vivuId);
        if (momoInfo && momoInfo.resultCode === 0) {
          isVerifiedPaid = true;
        }
      } catch (_) {}
    }

    if (!isVerifiedPaid) {
      // Check if order was marked completed concurrently by IPN webhook
      const { data: refreshedOrder } = await supabaseAdmin
        .from('payment_orders')
        .select('status')
        .eq('id', vivuId)
        .maybeSingle();

      if (refreshedOrder?.status === PaymentStatus.COMPLETED) {
        return res.json({ success: true, message: 'Đã kích hoạt trước đó. Lượt AI đã sẵn sàng!' });
      }

      return res.json({
        success: false,
        message: 'Thanh toán chưa hoàn tất hoặc chưa được cổng thanh toán xác nhận.'
      });
    }

    // Activate now with verified status
    await activatePremiumByOrderId(vivuId);
    return res.json({ success: true, message: 'Đã kích hoạt gói thành công! Lượt AI đã được cộng vào tài khoản.' });
  } catch (err: any) {
    console.error('[Payment] verify-return error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/payment/bookings ──────────────────────────────────────────────
// Create a bulk booking request and return confirmation HTML/token
router.post('/bookings', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const {
      tripId, tripTitle, destinationCity, startDate, endDate,
      guestName, guestEmail, guestPhone, guestCount,
      selectedItems, totalCost
    } = req.body;

    const bookingCode = `BK${Date.now().toString(36).toUpperCase()}`;
    const token = crypto.randomBytes(24).toString('hex');
    const confirmUrl = `${FRONTEND_URL}/api/payment/bookings/confirm/${token}`;

    // Generate HTML email
    const emailHTML = generateBookingConfirmationHTML({
      guestName, tripTitle, destinationCity, startDate, endDate,
      guestCount, items: selectedItems, totalCost, confirmUrl, bookingCode,
    });

    // Save booking record
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

    // If table doesn't exist, still return demo email HTML
    return res.status(201).json({
      success: true,
      bookingCode,
      confirmUrl,
      emailHTML, // Frontend uses this to show demo email inbox modal
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
      // Redirect with error message
      return res.redirect(`${FRONTEND_URL}/?booking_error=invalid_or_expired`);
    }

    // Redirect to success page
    return res.redirect(`${FRONTEND_URL}/chuyen-di/${booking.trip_id}?booking_confirmed=${booking.id}`);
  } catch (err: any) {
    return res.redirect(`${FRONTEND_URL}/?booking_error=server_error`);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function activatePremiumByOrderId(orderId: string) {
  try {
    // Build both possible id formats: VIVU-prefixed and numeric
    const vivuId = orderId.startsWith('VIVU') ? orderId : `VIVU${orderId}`;
    const numericId = orderId.startsWith('VIVU') ? orderId.replace('VIVU', '') : orderId;

    // Try VIVU-prefixed first, then numeric (atomic — prevents double-activation)
    let updatedOrders: any[] | null = null;
    const { data: d1 } = await supabaseAdmin
      .from('payment_orders')
      .update({ status: 'completed' })
      .eq('id', vivuId)
      .eq('status', 'pending')
      .select('user_id, plan');
    updatedOrders = d1;

    if (!updatedOrders || updatedOrders.length === 0) {
      const { data: d2 } = await supabaseAdmin
        .from('payment_orders')
        .update({ status: 'completed' })
        .eq('id', numericId)
        .eq('status', 'pending')
        .select('user_id, plan');
      updatedOrders = d2;
    }

    if (updatedOrders && updatedOrders.length > 0) {
      const order = updatedOrders[0];
      await activatePremiumForUser(order.user_id, order.plan || 'pro');
      console.log(`[Payment] ✅ Activated premium for user ${order.user_id} plan ${order.plan}`);
    } else {
      console.log(`[Payment] ℹ️ Order ${orderId} already completed or not found`);
    }
  } catch (err) {
    console.error('[Payment] activatePremiumByOrderId error:', err);
  }
}

async function activatePremiumForUser(userId: string, planKey: string = 'pro') {
  // Lấy cấu hình gói cước trực tiếp từ Database (Single Source of Truth)
  const { data: dbPlan } = await supabaseAdmin
    .from('pricing_plans')
    .select('*')
    .eq('id', planKey)
    .maybeSingle();

  const plan = dbPlan || PREMIUM_PLANS[planKey as keyof typeof PREMIUM_PLANS] || PREMIUM_PLANS.pro;
  const newQuota = Number(plan?.quota_total_grant ?? 9999);
  const durationDays = Number(plan?.duration_days || 30);
  const premiumUntil = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  // Try Schema v2 update first (quota_total)
  const { error: updateV2Err } = await supabaseAdmin
    .from('profiles')
    .update({
      is_premium: true,
      premium_until: premiumUntil,
      quota_total: newQuota,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updateV2Err) {
    // Fallback to legacy schema v1 column if quota_total column does not exist
    const { error: updateV1Err } = await supabaseAdmin
      .from('profiles')
      .update({
        is_premium: true,
        premium_until: premiumUntil,
        custom_quota: newQuota,
      })
      .eq('id', userId);
    if (updateV1Err) {
      console.error('[Payment] Profile quota update error:', updateV1Err.message);
    }
  }
}

export async function autoCancelExpiredOrders() {
  try {
    const tenMinutesAgo = new Date(Date.now() - ORDER_CONFIG.EXPIRATION_MS).toISOString();
    const { error } = await supabaseAdmin
      .from('payment_orders')
      .update({ status: PaymentStatus.CANCELLED })
      .eq('status', PaymentStatus.PENDING)
      .lt('created_at', tenMinutesAgo);
    if (error) {
      console.error('[Payment] Error auto-cancelling expired orders:', error.message);
    }
  } catch (err: any) {
    console.error('[Payment] Exception auto-cancelling expired orders:', err.message);
  }
}

export default router;
