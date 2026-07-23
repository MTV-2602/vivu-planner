import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { authMiddleware, AuthenticatedRequest } from '../middleware/authMiddleware';
import { supabaseAdmin } from '../services/supabaseAdmin';
import { createPayOSOrder, verifyPayOSWebhook, getPayOSOrderInfo, createMoMoOrder, verifyMoMoIPN, queryMoMoOrderInfo, buildVietQRUrl } from '../services/paymentService';
import { generateBookingConfirmationHTML } from '../services/emailService';

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://vivu-planner.vercel.app';
// SITE_URL = Render backend URL (where /api/* routes live)
// MoMo IPN must call this URL to activate premium after payment
const SITE_URL = process.env.SITE_URL || 'https://vivu-planner-backend.onrender.com';
const PREMIUM_PRICE = 49000; // VND per month


// ─── Premium Plans ───────────────────────────────────────────────────────────
const PREMIUM_PLANS = {
  plus: { amount: 29000, label: 'Gói Plus (5 lượt)', quota_added: 5, duration_days: 365 },
  monthly: { amount: 49000, label: 'Gói Pro (10 lượt)', quota_added: 10, duration_days: 365 },
  pro: { amount: 49000, label: 'Gói Pro (10 lượt)', quota_added: 10, duration_days: 365 },
  yearly: { amount: 99000, label: 'Gói VIP (25 lượt)', quota_added: 25, duration_days: 365 },
  vip: { amount: 99000, label: 'Gói VIP (25 lượt)', quota_added: 25, duration_days: 365 },
};

// ─── POST /api/payment/create-order ─────────────────────────────────────────
// Create payment order for PayOS or MoMo (with robust fallback if API keys are not configured)
router.post('/create-order', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
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
      status: 'pending',
      order_code: String(orderCode), // numeric timestamp — for PayOS lookup
      created_at: new Date().toISOString(),
    });
    if (dbErr) {
      throw new Error(`Database error saving payment order: ${dbErr.message}`);
    }

    if (method === 'payos') {
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
          method: 'payos',
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

    if (method === 'momo') {
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


// ─── GET /api/payment/status ─────────────────────────────────────────────────
router.get('/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const userEmail = req.user?.email?.toLowerCase().trim();
    const envAdminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const isEmailAdmin = !!(userEmail && ((envAdminEmail && userEmail === envAdminEmail) || ['team89a6@gmail.com', 'vinhvip4508@gmail.com'].includes(userEmail)));
    const isSpecialAdminId = userId === '00000000-0000-0000-0000-000000000001';

    const { count: dbTripsCount } = await supabaseAdmin
      .from('trips')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('premium_until, is_premium, custom_quota, trips_used, role')
      .eq('id', userId)
      .maybeSingle();

    const isDbAdmin = profile?.role === 'admin';

    if (isEmailAdmin || isSpecialAdminId || isDbAdmin) {
      return res.json({
        isPremium: true,
        premiumUntil: '2099-12-31T23:59:59.000Z',
        planName: 'Gói Admin Đặc Quyền (Vô hạn)',
        tripsUsed: dbTripsCount || 0,
        tripsQuota: 9999,
        remainingTrips: 9999,
      });
    }

    const isPremium = !!(profile?.is_premium ||
      (profile?.premium_until && new Date(profile.premium_until) > new Date()));

    const tripsQuota = profile?.custom_quota || (isPremium ? 10 : 3);
    const tripsUsed = Math.max(profile?.trips_used ?? 0, dbTripsCount || 0);
    const remainingTrips = Math.max(0, tripsQuota - tripsUsed);

    return res.json({
      isPremium,
      premiumUntil: profile?.premium_until || null,
      planName: isPremium ? 'Gói Pro (10 lượt)' : 'Gói Miễn Phí (3 lượt)',
      tripsUsed,
      tripsQuota,
      remainingTrips,
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
router.get('/check-order/:orderCode', async (req: Request, res: Response) => {
  try {
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

    if (order?.status === 'completed') {
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
    const { orderId, resultCode, code, status } = req.query;

    // Must have an orderId to do anything
    if (!orderId) {
      return res.json({ success: false, message: 'Thiếu orderId.' });
    }

    // Check if payment was cancelled
    const isCancelled = String(resultCode) === '1006' || String(resultCode) === '49' || String(status) === 'CANCELLED';
    if (isCancelled) {
      return res.json({ success: false, message: 'Giao dịch đã bị hủy.' });
    }

    // Success codes: MoMo resultCode=0, PayOS code=00 or status=PAID
    // Also activate if no resultCode (returnUrl visited after payment without code)
    const isSuccess =
      String(resultCode) === '0' ||
      String(code) === '00' ||
      String(status) === 'PAID' ||
      (!resultCode && !code && !status);

    if (!isSuccess) {
      return res.json({ success: false, message: 'Thanh toán chưa hoàn tất.' });
    }

    // Check if order already completed (idempotent — safe to call multiple times)
    const { data: order } = await supabaseAdmin
      .from('payment_orders')
      .select('id, status, user_id, plan')
      .eq('id', String(orderId))
      .single();

    if (!order) {
      return res.json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    }

    if (order.status === 'completed') {
      // Already activated (e.g. IPN arrived first) — just return success
      return res.json({ success: true, message: 'Đã kích hoạt trước đó. Lượt AI đã sẵn sàng!' });
    }

    // Activate now
    await activatePremiumByOrderId(String(orderId));
    return res.json({ success: true, message: 'Đã kích hoạt cước thành công! Lượt AI đã được cộng vào tài khoản.' });
  } catch (err: any) {
    console.error('[Payment] verify-return error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/payment/bookings ──────────────────────────────────────────────
// Create a bulk booking request and return confirmation HTML/token
router.post('/bookings', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
    const { data: booking, error } = await supabaseAdmin
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
  const plan = PREMIUM_PLANS[planKey as keyof typeof PREMIUM_PLANS] || PREMIUM_PLANS.pro;
  const quotaAdded = plan.quota_added || 10;
  
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('custom_quota, is_premium, trips_used')
    .eq('id', userId)
    .maybeSingle();

  const currentQuota = profile?.custom_quota || 3;
  const currentUsed = profile?.trips_used || 0;
  const newQuota = currentQuota + quotaAdded;
  const premiumUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  if (profile) {
    // If profile exists, update only the target fields to preserve other columns (like trips_used)
    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({
        is_premium: true,
        premium_until: premiumUntil,
        custom_quota: newQuota,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (updateErr) {
      console.error('[Payment] Safe profile update error:', updateErr.message);
    }
  } else {
    // If profile doesn't exist, insert complete record
    const { error: insertErr } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        is_premium: true,
        premium_until: premiumUntil,
        custom_quota: newQuota,
        trips_used: 0,
        updated_at: new Date().toISOString(),
      });
    if (insertErr) {
      console.error('[Payment] Safe profile insert error:', insertErr.message);
    }
  }
}

export default router;
