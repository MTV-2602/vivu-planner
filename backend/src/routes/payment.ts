import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { authMiddleware, AuthenticatedRequest } from '../middleware/authMiddleware';
import { supabaseAdmin } from '../services/supabaseAdmin';
import { createPayOSOrder, verifyPayOSWebhook, createMoMoOrder, verifyMoMoIPN, buildVietQRUrl } from '../services/paymentService';
import { generateBookingConfirmationHTML } from '../services/emailService';

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://vivu-planner.vercel.app';
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
    const ipnUrl = `${FRONTEND_URL}/api/payment/momo-ipn`;

    // Save pending order to DB (safely caught)
    try {
      await supabaseAdmin.from('payment_orders').insert({
        id: orderId,
        user_id: userId,
        method,
        plan,
        amount: planConfig.amount,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
    } catch (dbErr: any) {
      console.warn('[Payment DB Insert Warning]:', dbErr.message);
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
          orderCode: payosData.orderCode,
          orderId,
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
    const isValid = verifyPayOSWebhook(req.body);
    if (!isValid) return res.status(400).json({ error: 'Invalid webhook signature' });

    const { data } = req.body;
    if (data?.status === 'PAID') {
      const orderId = String(data.orderCode);
      await activatePremiumByOrderId(orderId);
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

// ─── POST /api/payment/demo-activate ────────────────────────────────────────
// Demo mode: activate premium without real payment (for presentations)
router.post('/demo-activate', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { plan = 'pro' } = req.body;
    await activatePremiumForUser(userId, plan);
    return res.json({ success: true, message: 'Demo Premium activated!' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/payment/status ─────────────────────────────────────────────────
router.get('/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('premium_until, is_premium, custom_quota, trips_used')
      .eq('id', userId)
      .single();

    const { count: dbTripsCount } = await supabaseAdmin
      .from('trips')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

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

// ─── GET /api/payment/verify-return ──────────────────────────────────────────
router.get('/verify-return', async (req: Request, res: Response) => {
  try {
    const { orderId, resultCode, code, status } = req.query;
    const isSuccess = String(resultCode) === '0' || String(code) === '00' || String(status) === 'PAID' || !resultCode;
    
    if (orderId && isSuccess) {
      await activatePremiumByOrderId(String(orderId));
      return res.json({ success: true, message: 'Đã kích hoạt cước thành công!' });
    }
    
    return res.json({ success: false, message: 'Thanh toán chưa hoàn tất hoặc bị hủy.' });
  } catch (err: any) {
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
    const { data: order } = await supabaseAdmin
      .from('payment_orders')
      .select('user_id, plan')
      .eq('id', orderId)
      .single();
    if (!order) return;

    await activatePremiumForUser(order.user_id, order.plan || 'pro');
    await supabaseAdmin.from('payment_orders').update({ status: 'completed' }).eq('id', orderId);
  } catch (err) {
    console.error('[Payment] activatePremiumByOrderId error:', err);
  }
}

async function activatePremiumForUser(userId: string, planKey: string = 'pro') {
  const plan = PREMIUM_PLANS[planKey as keyof typeof PREMIUM_PLANS] || PREMIUM_PLANS.pro;
  const quotaAdded = plan.quota_added || 10;
  
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('custom_quota, is_premium')
    .eq('id', userId)
    .single();

  const currentQuota = profile?.custom_quota || 3;
  const newQuota = currentQuota + quotaAdded;
  const premiumUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  await supabaseAdmin
    .from('profiles')
    .upsert({
      id: userId,
      is_premium: true,
      premium_until: premiumUntil,
      custom_quota: newQuota,
      updated_at: new Date().toISOString(),
    });
}

export default router;
