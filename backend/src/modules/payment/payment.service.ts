import crypto from 'crypto';
import axios from 'axios';
import { supabaseAdmin } from '../../config/supabase';
import { PaymentStatus, PaymentMethod, computeGrant } from '../../constants';

// Shared expiration constants
export const PAYMENT_EXPIRE_SECONDS = 15 * 60; // 15 phút cho cổng PayOS expiredAt
export const PAYMENT_EXPIRATION_BUFFER_MS = 5 * 60 * 1000; // 5 phút đệm trước khi auto-cancel
export const ORDER_EXPIRATION_MS = (15 + 5) * 60 * 1000; // 20 phút tổng cộng cho autoCancelExpiredOrders

// Sanitize string to ASCII with max length for PayOS description requirement
function sanitizePayOSDescription(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .slice(0, 25);
}

function getPayOSChecksumKey(): string {
  return (process.env.PAYOS_CHECKSUM_KEY || '').trim();
}

export function createPayOSSignature(data: string): string {
  return crypto.createHmac('sha256', getPayOSChecksumKey()).update(data).digest('hex');
}

export async function createPayOSOrder(params: {
  orderCode: number;
  amount: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  buyerName?: string;
  buyerEmail?: string;
  buyerPhone?: string;
}): Promise<{
  checkoutUrl: string;
  qrCode: string;
  orderCode: number;
  accountNumber?: string;
  accountName?: string;
  bin?: string;
}> {
  const clientId = (process.env.PAYOS_CLIENT_ID || '').trim();
  const apiKey = (process.env.PAYOS_API_KEY || '').trim();
  const checksumKey = (process.env.PAYOS_CHECKSUM_KEY || '').trim();

  if (!clientId || !apiKey || !checksumKey) {
    throw new Error('PAYOS_CLIENT_ID, PAYOS_API_KEY, hoặc PAYOS_CHECKSUM_KEY chưa được cấu hình.');
  }

  const { amount, returnUrl, cancelUrl, buyerName, buyerEmail, buyerPhone } = params;
  const orderCode = params.orderCode;
  const description = sanitizePayOSDescription(params.description || 'ViVu Pro');

  // Build signature string (sorted alphabetically by key)
  const signData = `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
  const signature = crypto.createHmac('sha256', checksumKey).update(signData).digest('hex');

  const body: any = {
    orderCode,
    amount,
    description,
    returnUrl,
    cancelUrl,
    signature,
    expiredAt: Math.floor(Date.now() / 1000) + PAYMENT_EXPIRE_SECONDS,
  };

  if (buyerName) body.buyerName = buyerName;
  if (buyerEmail) body.buyerEmail = buyerEmail;
  if (buyerPhone) body.buyerPhone = buyerPhone;

  try {
    const response = await axios.post('https://api-merchant.payos.vn/v2/payment-requests', body, {
      headers: {
        'x-client-id': clientId,
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 12000,
    });

    const resData = response.data?.data || response.data;
    return {
      checkoutUrl: resData.checkoutUrl || resData.paymentUrl,
      qrCode: resData.qrCode || '',
      accountNumber: resData.accountNumber || '',
      accountName: resData.accountName || '',
      bin: resData.bin || '',
      orderCode,
    };
  } catch (err: any) {
    const errMsg = err.response?.data?.message || err.message || 'Lỗi kết nối cổng thanh toán PayOS';
    console.error('[Payment] PayOS Error Details:', errMsg);
    throw new Error(errMsg);
  }
}

export function verifyPayOSWebhook(body: any): boolean {
  try {
    const checksumKey = (process.env.PAYOS_CHECKSUM_KEY || '').trim();
    const { data, signature } = body;
    if (!signature || !checksumKey) return false;

    // Handle string data or object data
    const dataObj = typeof data === 'string' ? JSON.parse(data) : (data || {});

    // Sort keys alphabetically and format as key=value&...
    const sortedKeys = Object.keys(dataObj).sort();
    const signData = sortedKeys
      .map((k) => {
        const val = dataObj[k];
        return `${k}=${val === null || val === undefined ? '' : val}`;
      })
      .join('&');

    const expectedSig = crypto.createHmac('sha256', checksumKey).update(signData).digest('hex');
    return expectedSig === signature;
  } catch {
    return false;
  }
}

export async function getPayOSOrderInfo(orderCode: number | string): Promise<any> {
  const clientId = (process.env.PAYOS_CLIENT_ID || '').trim();
  const apiKey = (process.env.PAYOS_API_KEY || '').trim();

  if (!clientId || !apiKey) return null;

  try {
    const response = await axios.get(`https://api-merchant.payos.vn/v2/payment-requests/${orderCode}`, {
      headers: {
        'x-client-id': clientId,
        'x-api-key': apiKey,
      },
      timeout: 8000,
    });
    return response.data?.data || response.data;
  } catch (err: any) {
    console.warn('[Payment] PayOS Check Order Error:', err.response?.data?.message || err.message);
    return null;
  }
}

export async function cancelPayOSOrder(orderCode: number | string, cancellationReason: string = 'Hủy đơn hàng'): Promise<any> {
  const clientId = (process.env.PAYOS_CLIENT_ID || '').trim();
  const apiKey = (process.env.PAYOS_API_KEY || '').trim();

  if (!clientId || !apiKey) return null;

  try {
    const response = await axios.post(
      `https://api-merchant.payos.vn/v2/payment-requests/${orderCode}/cancel`,
      { cancellationReason },
      {
        headers: {
          'x-client-id': clientId,
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      }
    );
    return response.data?.data || response.data;
  } catch (err: any) {
    console.warn('[Payment] PayOS Cancel Order Error:', err.response?.data?.message || err.message);
    return null;
  }
}

// ─── MoMo Gateway ─────────────────────────────────────────────────────────────
const MOMO_API_URL = (process.env.MOMO_API_URL || 'https://payment.momo.vn/v2/gateway/api/create').trim();

function sanitizeMoMoOrderInfo(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim();
}

export async function createMoMoOrder(params: {
  orderId: string;
  amount: number;
  orderInfo: string;
  redirectUrl: string;
  ipnUrl: string;
  requestId: string;
}): Promise<{ payUrl: string; deeplink: string; qrCodeUrl: string; orderId: string }> {
  const { orderId, amount, redirectUrl, ipnUrl, requestId } = params;

  const partnerCode = (process.env.MOMO_PARTNER_CODE || '').trim();
  const accessKey = (process.env.MOMO_ACCESS_KEY || '').trim();
  const secretKey = (process.env.MOMO_SECRET_KEY || '').trim();

  if (!partnerCode || !accessKey || !secretKey) {
    throw new Error('MOMO_PARTNER_CODE, MOMO_ACCESS_KEY, hoặc MOMO_SECRET_KEY chưa được cấu hình.');
  }

  const orderInfo = sanitizeMoMoOrderInfo(params.orderInfo || 'ViVu Pro');
  const requestType = 'captureWallet';
  const extraData = '';

  const rawSignature = [
    `accessKey=${accessKey}`,
    `amount=${amount}`,
    `extraData=${extraData}`,
    `ipnUrl=${ipnUrl}`,
    `orderId=${orderId}`,
    `orderInfo=${orderInfo}`,
    `partnerCode=${partnerCode}`,
    `redirectUrl=${redirectUrl}`,
    `requestId=${requestId}`,
    `requestType=${requestType}`,
  ].join('&');

  const signature = crypto.createHmac('sha256', secretKey).update(rawSignature).digest('hex');

  const body = {
    partnerCode,
    partnerName: 'ViVu Planner',
    storeId: 'ViVuStore',
    requestId,
    amount,
    orderId,
    orderInfo,
    redirectUrl,
    ipnUrl,
    lang: 'vi',
    requestType,
    autoCapture: true,
    extraData,
    orderGroupId: '',
    signature,
  };

  try {
    const response = await axios.post(MOMO_API_URL, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 12000,
    });

    const resData = response.data || {};
    const { payUrl, deeplink, qrCodeUrl, resultCode, message } = resData;

    if (resultCode === 0 && (payUrl || deeplink || qrCodeUrl)) {
      return {
        payUrl: payUrl || deeplink || qrCodeUrl,
        deeplink: deeplink || payUrl,
        qrCodeUrl: qrCodeUrl || payUrl,
        orderId,
      };
    }

    const errMsg = `MoMo Gateway Error: [${resultCode}] ${message || 'Tạo giao dịch MoMo không thành công'}`;
    console.error(`[Payment] ${errMsg}`);
    throw new Error(errMsg);
  } catch (err: any) {
    const errorMsg = err.response?.data?.message || err.message || 'Lỗi kết nối cổng thanh toán MoMo';
    console.error('[Payment] MoMo create error:', errorMsg);
    throw new Error(errorMsg);
  }
}

export function verifyMoMoIPN(body: any): boolean {
  try {
    const secretKey = (process.env.MOMO_SECRET_KEY || '').trim();
    const accessKey = (process.env.MOMO_ACCESS_KEY || '').trim();
    const {
      partnerCode,
      orderId,
      requestId,
      amount,
      orderInfo,
      orderType,
      transId,
      resultCode,
      message,
      payType,
      responseTime,
      extraData,
      signature,
    } = body;

    if (!signature || !secretKey || !accessKey) return false;

    const rawSignature = [
      `accessKey=${accessKey}`,
      `amount=${amount}`,
      `extraData=${extraData ?? ''}`,
      `message=${message ?? ''}`,
      `orderId=${orderId}`,
      `orderInfo=${orderInfo ?? ''}`,
      `orderType=${orderType ?? ''}`,
      `partnerCode=${partnerCode}`,
      `payType=${payType ?? ''}`,
      `requestId=${requestId}`,
      `responseTime=${responseTime}`,
      `resultCode=${resultCode}`,
      `transId=${transId}`,
    ].join('&');

    const expectedSig = crypto.createHmac('sha256', secretKey).update(rawSignature).digest('hex');
    return expectedSig === signature;
  } catch {
    return false;
  }
}

export async function queryMoMoOrderInfo(orderId: string, requestId?: string): Promise<any> {
  const partnerCode = (process.env.MOMO_PARTNER_CODE || '').trim();
  const accessKey = (process.env.MOMO_ACCESS_KEY || '').trim();
  const secretKey = (process.env.MOMO_SECRET_KEY || '').trim();

  if (!partnerCode || !accessKey || !secretKey) return null;

  const reqId = requestId || `query-${orderId}-${Date.now()}`;

  const rawSignature = [
    `accessKey=${accessKey}`,
    `orderId=${orderId}`,
    `partnerCode=${partnerCode}`,
    `requestId=${reqId}`,
  ].join('&');

  const signature = crypto.createHmac('sha256', secretKey).update(rawSignature).digest('hex');

  const body = {
    partnerCode,
    requestId: reqId,
    orderId,
    signature,
    lang: 'vi',
  };

  try {
    const response = await axios.post('https://payment.momo.vn/v2/gateway/api/query', body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,
    });
    return response.data;
  } catch (err: any) {
    console.warn('[Payment] MoMo Query Error:', err.response?.data?.message || err.message);
    return null;
  }
}

export function buildVietQRUrl(params: {
  bankId: string;
  accountNo: string;
  accountName: string;
  amount: number;
  addInfo: string;
}): string {
  const { bankId, accountNo, accountName, amount, addInfo } = params;
  const encodedInfo = encodeURIComponent(addInfo);
  const encodedName = encodeURIComponent(accountName);
  return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${amount}&addInfo=${encodedInfo}&accountName=${encodedName}`;
}

// ─── Pure Activation Decision Logic (For Unit Testing & Robustness) ───────────
export interface DecideActivationParams {
  orderStatus: string;
  orderAmount: number;
  gatewayAmount: number;
  gatewayPaid: boolean;
}

export function decideActivation(params: DecideActivationParams): {
  shouldActivate: boolean;
  reason: string;
} {
  const { orderStatus, orderAmount, gatewayAmount, gatewayPaid } = params;

  if (orderStatus === PaymentStatus.COMPLETED || orderStatus === 'success') {
    return { shouldActivate: false, reason: 'already_completed' };
  }

  if (!gatewayPaid) {
    return { shouldActivate: false, reason: 'gateway_not_paid' };
  }

  if (Number(orderAmount) !== Number(gatewayAmount)) {
    return { shouldActivate: false, reason: 'amount_mismatch' };
  }

  if (orderStatus === PaymentStatus.PENDING || orderStatus === PaymentStatus.CANCELLED) {
    return { shouldActivate: true, reason: 'ok' };
  }

  return { shouldActivate: false, reason: `unsupported_status_${orderStatus}` };
}

// ─── User Credits Grant Helper ───────────────────────────────────────────────
export async function grantCreditsToUser(
  userId: string,
  quotaGranted: number,
  durationDays: number
): Promise<void> {
  const { error: rpcErr } = await supabaseAdmin.rpc('grant_plan_credits', {
    p_user_id: userId,
    p_credits: quotaGranted,
    p_duration_days: durationDays,
  });

  if (rpcErr) {
    console.warn('[Payment] grant_plan_credits RPC error, falling back to manual computeGrant:', rpcErr.message);
    const { data: currentProfile, error: profileFetchErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileFetchErr || !currentProfile) {
      throw new Error(`Profile not found: ${profileFetchErr?.message || 'not found'}`);
    }

    const computed = computeGrant(
      currentProfile,
      { quota_total_grant: quotaGranted, duration_days: durationDays },
      new Date()
    );

    const { error: updateProfileErr } = await supabaseAdmin
      .from('profiles')
      .update({
        pro_credits: computed.pro_credits,
        monthly_credits: computed.monthly_credits,
        premium_until: computed.premium_until,
        is_premium: computed.pro_credits + computed.monthly_credits > 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateProfileErr) {
      throw updateProfileErr;
    }
  } else if (durationDays <= 0) {
    // Đảm bảo: nếu mua gói theo lượt mà user không có lượt tháng khả dụng, premium_until phải là null
    const { data: prof } = await supabaseAdmin
      .from('profiles')
      .select('monthly_credits, premium_until')
      .eq('id', userId)
      .maybeSingle();

    if (prof && Number(prof.monthly_credits ?? 0) <= 0 && prof.premium_until !== null) {
      await supabaseAdmin
        .from('profiles')
        .update({
          monthly_credits: 0,
          premium_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
    }
  }
}

// ─── Unified Order Activation Function (Single Source of Truth) ─────────────
export interface ActivateOrderOptions {
  force?: boolean;
  source?: 'gateway' | 'admin';
  confirmedAmount?: number;
  gatewayPaid?: boolean;
}

export async function activateOrderById(
  orderId: string,
  opts?: ActivateOrderOptions
): Promise<{ activated: boolean; reason?: string; userId?: string; plan?: string }> {
  try {
    const vivuId = orderId.startsWith('VIVU') ? orderId : `VIVU${orderId}`;
    const numericCode = orderId.replace(/\D/g, '');

    // 1. Tìm đơn hàng trong DB
    const { data: order, error: fetchErr } = await supabaseAdmin
      .from('payment_orders')
      .select('*')
      .or(`id.eq.${vivuId},order_code.eq.${numericCode}`)
      .maybeSingle();

    if (fetchErr || !order) {
      return { activated: false, reason: 'order_not_found' };
    }

    // 2. Chống kích hoạt đôi: nếu đơn đã completed thì dừng ngay
    if (order.status === PaymentStatus.COMPLETED) {
      return {
        activated: false,
        reason: 'already_completed',
        userId: order.user_id,
        plan: order.plan,
      };
    }

    // 3. Nếu KHÔNG PHẢI admin force: đối chiếu cổng thanh toán
    if (!opts?.force) {
      let isPaid = false;
      let gatewayAmount: number | null = null;

      if (opts?.gatewayPaid !== undefined) {
        isPaid = opts.gatewayPaid;
        gatewayAmount = opts.confirmedAmount !== undefined ? Number(opts.confirmedAmount) : null;
      }

      if (order.method === PaymentMethod.PAYOS) {
        if (!isPaid || gatewayAmount === null) {
          const payosInfo = await getPayOSOrderInfo(order.order_code || numericCode);
          if (payosInfo && (payosInfo.status === 'PAID' || payosInfo.code === '00')) {
            isPaid = true;
            gatewayAmount = Number(payosInfo.amountPaid ?? payosInfo.amount ?? 0);
          }
        }
      } else if (order.method === PaymentMethod.MOMO) {
        if (!isPaid || gatewayAmount === null) {
          const momoInfo = await queryMoMoOrderInfo(order.id);
          if (momoInfo && momoInfo.resultCode === 0) {
            isPaid = true;
            gatewayAmount = Number(momoInfo.amount ?? 0);
          }
        }
      }

      const decision = decideActivation({
        orderStatus: order.status,
        orderAmount: Number(order.amount),
        gatewayAmount: gatewayAmount !== null ? gatewayAmount : -1,
        gatewayPaid: isPaid,
      });

      if (!decision.shouldActivate) {
        if (decision.reason === 'amount_mismatch') {
          console.warn(
            `[Payment] ⚠️ Amount mismatch for order ${order.id}: expected ${order.amount}, got ${gatewayAmount}. Skipping activation for admin review.`
          );
        }
        return {
          activated: false,
          reason: decision.reason,
          userId: order.user_id,
          plan: order.plan,
        };
      }
    }

    // 4. Chuyển trạng thái đơn sang completed một cách atomic (cho phép từ pending hoặc cancelled)
    const previousStatus = order.status;
    const { data: updatedOrders, error: updateErr } = await supabaseAdmin
      .from('payment_orders')
      .update({
        status: PaymentStatus.COMPLETED,
        completed_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .in('status', [PaymentStatus.PENDING, PaymentStatus.CANCELLED])
      .select('id, user_id, plan, amount, quota_granted, status');

    if (updateErr || !updatedOrders || updatedOrders.length === 0) {
      // Có thể đã hoàn tất bởi tiến trình chạy song song
      const { data: latest } = await supabaseAdmin
        .from('payment_orders')
        .select('status')
        .eq('id', order.id)
        .maybeSingle();

      if (latest?.status === PaymentStatus.COMPLETED) {
        return {
          activated: false,
          reason: 'already_completed',
          userId: order.user_id,
          plan: order.plan,
        };
      }
      return {
        activated: false,
        reason: updateErr?.message || 'failed_to_update_order_status',
        userId: order.user_id,
        plan: order.plan,
      };
    }

    // 5. Đọc cấu hình gói cước từ pricing_plans (KHÔNG lọc is_active để gói bị ẩn vẫn kích hoạt được)
    const { data: dbPlan, error: planErr } = await supabaseAdmin
      .from('pricing_plans')
      .select('id, amount, price, label, name, duration_days, quota_total_grant, is_active')
      .eq('id', order.plan)
      .maybeSingle();

    if (planErr || !dbPlan) {
      // Gói đã bị XÓA HẲN khỏi DB: hoàn lại trạng thái đơn, không đoán số ngày, yêu cầu admin xử lý tay
      await supabaseAdmin
        .from('payment_orders')
        .update({
          status: previousStatus,
          completed_at: null,
        })
        .eq('id', order.id);

      console.warn(
        `[Payment] ⚠️ Plan "${order.plan}" not found in pricing_plans for order ${order.id}. Order reverted to ${previousStatus}. Manual admin intervention required.`
      );
      return {
        activated: false,
        reason: 'plan_deleted_manual_handling_required',
        userId: order.user_id,
        plan: order.plan,
      };
    }

    // 6. Cộng lượt: ưu tiên quota_granted đã snapshot trong đơn nếu > 0
    const quotaGranted =
      Number(order.quota_granted) > 0
        ? Number(order.quota_granted)
        : Number(dbPlan.quota_total_grant ?? 1);
    const durationDays = Number(dbPlan.duration_days ?? 0);

    try {
      await grantCreditsToUser(order.user_id, quotaGranted, durationDays);
    } catch (grantErr: any) {
      // Hoàn đơn về trạng thái cũ nếu cộng lượt lỗi để lần sau kích hoạt lại
      await supabaseAdmin
        .from('payment_orders')
        .update({
          status: previousStatus,
          completed_at: null,
        })
        .eq('id', order.id);

      console.error(
        `[Payment] ❌ Credit grant failed for order ${order.id}, reverted to ${previousStatus}:`,
        grantErr.message
      );
      return {
        activated: false,
        reason: `grant_credits_failed: ${grantErr.message}`,
        userId: order.user_id,
        plan: order.plan,
      };
    }

    // 7. Phát broadcast Realtime để client cập nhật tức thì
    try {
      const channel = supabaseAdmin.channel(`user_channel_${order.user_id}`);
      await channel.send({
        type: 'broadcast',
        event: 'user_updated',
        payload: {
          userId: order.user_id,
          timestamp: Date.now(),
        },
      });
    } catch (e: any) {
      console.warn('[Payment] Realtime broadcast error:', e.message);
    }

    console.log(
      `[Payment] ✅ Successfully activated order ${order.id} for user ${order.user_id} (plan: ${order.plan}, credits: ${quotaGranted}, duration: ${durationDays}d)`
    );

    return {
      activated: true,
      userId: order.user_id,
      plan: order.plan,
    };
  } catch (err: any) {
    console.error('[Payment] activateOrderById exception:', err.message);
    return {
      activated: false,
      reason: err.message,
    };
  }
}
