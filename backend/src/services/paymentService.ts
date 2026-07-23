import crypto from 'crypto';
import axios from 'axios';

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
  return process.env.PAYOS_CHECKSUM_KEY || '';
}

function createPayOSSignature(data: string): string {
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
}): Promise<{ checkoutUrl: string; qrCode: string; orderCode: number }> {
  const clientId = process.env.PAYOS_CLIENT_ID || '';
  const apiKey = process.env.PAYOS_API_KEY || '';
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY || '';

  if (!clientId || !apiKey || !checksumKey) {
    throw new Error('PAYOS_CLIENT_ID, PAYOS_API_KEY, or PAYOS_CHECKSUM_KEY environment variables are missing');
  }

  const { amount, returnUrl, cancelUrl, buyerName, buyerEmail, buyerPhone } = params;
  const orderCode = Number(String(params.orderCode).slice(-9));
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
    expiredAt: Math.floor(Date.now() / 1000) + 15 * 60, // 15 minutes
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
      qrCode: resData.qrCode || resData.qrCodeUrl || resData.checkoutUrl,
      orderCode,
    };
  } catch (err: any) {
    console.error('[PayOS Error Details]:', err.response?.data || err.message);
    throw new Error(err.response?.data?.message || err.message);
  }
}

export function verifyPayOSWebhook(body: any): boolean {
  try {
    const checksumKey = process.env.PAYOS_CHECKSUM_KEY || '';
    const { data, signature } = body;
    if (!data || !signature || !checksumKey) return false;

    // Sort keys and build checksum string
    const sortedKeys = Object.keys(data).sort();
    const signData = sortedKeys.map(k => `${k}=${data[k]}`).join('&');
    const expectedSig = crypto.createHmac('sha256', checksumKey).update(signData).digest('hex');
    return expectedSig === signature;
  } catch {
    return false;
  }
}

// ─── MoMo ───────────────────────────────────────────────────────────────────
const MOMO_API_URL = 'https://payment.momo.vn/v2/gateway/api/create';

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
  const partnerCode = process.env.MOMO_PARTNER_CODE || '';
  const accessKey = process.env.MOMO_ACCESS_KEY || '';
  const secretKey = process.env.MOMO_SECRET_KEY || '';

  if (!partnerCode || !accessKey || !secretKey) {
    throw new Error('MOMO_PARTNER_CODE, MOMO_ACCESS_KEY, or MOMO_SECRET_KEY environment variables are missing');
  }

  const { orderId, amount, redirectUrl, ipnUrl, requestId } = params;
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

    const { payUrl, deeplink, qrCodeUrl } = response.data;
    return {
      payUrl: payUrl || deeplink || qrCodeUrl,
      deeplink: deeplink || payUrl,
      qrCodeUrl: qrCodeUrl || payUrl,
      orderId,
    };
  } catch (err: any) {
    console.error('[MoMo Error Details]:', err.response?.data || err.message);
    throw new Error(err.response?.data?.message || err.message);
  }
}

export function verifyMoMoIPN(body: any): boolean {
  try {
    const secretKey = process.env.MOMO_SECRET_KEY || '';
    const accessKey = process.env.MOMO_ACCESS_KEY || '';
    const {
      partnerCode, orderId, requestId, amount, orderInfo,
      orderType, transId, resultCode, message, payType, responseTime, extraData, signature,
    } = body;

    if (!signature || !secretKey) return false;

    const rawSignature = [
      `accessKey=${accessKey}`,
      `amount=${amount}`,
      `extraData=${extraData}`,
      `message=${message}`,
      `orderId=${orderId}`,
      `orderInfo=${orderInfo}`,
      `orderType=${orderType}`,
      `partnerCode=${partnerCode}`,
      `payType=${payType}`,
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
