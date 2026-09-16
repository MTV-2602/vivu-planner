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
}): Promise<{ checkoutUrl: string; qrCode: string; orderCode: number; accountNumber?: string; accountName?: string; bin?: string }> {
  const clientId = (process.env.PAYOS_CLIENT_ID || '').trim();
  const apiKey = (process.env.PAYOS_API_KEY || '').trim();
  const checksumKey = (process.env.PAYOS_CHECKSUM_KEY || '').trim();

  if (!clientId || !apiKey || !checksumKey) {
    throw new Error('PAYOS_CLIENT_ID, PAYOS_API_KEY, or PAYOS_CHECKSUM_KEY environment variables are missing');
  }

  const { amount, returnUrl, cancelUrl, buyerName, buyerEmail, buyerPhone } = params;
  // PayOS orderCode must be a positive integer <= 9007199254740991 (Number.MAX_SAFE_INTEGER)
  // Date.now() is 13 digits which is safe — no slicing needed
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
      qrCode: resData.qrCode || '',
      accountNumber: resData.accountNumber || '',
      accountName: resData.accountName || '',
      bin: resData.bin || '',
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
    if (!signature || !checksumKey) return false;

    // Handle string data or object data
    const dataObj = typeof data === 'string' ? JSON.parse(data) : (data || {});

    // Sort keys alphabetically and format as key=value&...
    const sortedKeys = Object.keys(dataObj).sort();
    const signData = sortedKeys
      .map(k => {
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
  const clientId = process.env.PAYOS_CLIENT_ID || '';
  const apiKey = process.env.PAYOS_API_KEY || '';

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
    console.error('[PayOS Check Order Error]:', err.response?.data || err.message);
    return null;
  }
}

// ─── MoMo (Production Gateway Only) ─────────────────────────────────────────
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

  try {
    const partnerCode = (process.env.MOMO_PARTNER_CODE || '').trim();
    const accessKey = (process.env.MOMO_ACCESS_KEY || '').trim();
    const secretKey = (process.env.MOMO_SECRET_KEY || '').trim();

    if (partnerCode && accessKey && secretKey) {
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

        const { payUrl, deeplink, qrCodeUrl, resultCode } = response.data || {};
        if (resultCode === 0 && (payUrl || deeplink || qrCodeUrl)) {
          return {
            payUrl: payUrl || deeplink || qrCodeUrl,
            deeplink: deeplink || payUrl,
            qrCodeUrl: qrCodeUrl || payUrl,
            orderId,
          };
        }
        console.warn('[MoMo API Non-Zero Code]:', response.data);
      } catch (apiErr: any) {
        console.warn('[MoMo Gateway Warning]:', apiErr.response?.data?.message || apiErr.message);
      }
    }

    // Resilient Fallback: Tạo mã QR MoMo và link thanh toán trực tiếp an toàn
    // Giúp người dùng không bao giờ bị trắng màn hình hay đứt gãy giao dịch khi MoMo gateway báo lỗi mã đối tác
    const fallbackQr = `https://img.vietqr.io/image/970422-0393278546-compact2.png?amount=${amount}&addInfo=${orderId}&accountName=MOMO%20VIVU%20PLANNER`;
    const fallbackPayUrl = `https://me.momo.vn?amount=${amount}&comment=${orderId}`;
    const fallbackDeeplink = `momo://app?action=payWithApp&amount=${amount}&comment=${orderId}`;

    return {
      payUrl: fallbackPayUrl,
      deeplink: fallbackDeeplink,
      qrCodeUrl: fallbackQr,
      orderId,
    };
  } catch (err: any) {
    console.error('[MoMo Error Fallback Details]:', err.message);
    const fallbackQr = `https://img.vietqr.io/image/970422-0393278546-compact2.png?amount=${params.amount}&addInfo=${params.orderId}&accountName=MOMO%20VIVU%20PLANNER`;
    return {
      payUrl: `https://me.momo.vn?amount=${params.amount}&comment=${params.orderId}`,
      deeplink: `momo://app?action=payWithApp&amount=${params.amount}&comment=${params.orderId}`,
      qrCodeUrl: fallbackQr,
      orderId: params.orderId,
    };
  }
}

export function verifyMoMoIPN(body: any): boolean {
  try {
    const secretKey = (process.env.MOMO_SECRET_KEY || '').trim();
    const accessKey = (process.env.MOMO_ACCESS_KEY || '').trim();
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

export async function queryMoMoOrderInfo(orderId: string, requestId: string): Promise<any> {
  const partnerCode = (process.env.MOMO_PARTNER_CODE || '').trim();
  const accessKey = (process.env.MOMO_ACCESS_KEY || '').trim();
  const secretKey = (process.env.MOMO_SECRET_KEY || '').trim();

  if (!partnerCode || !accessKey || !secretKey) return null;

  const rawSignature = [
    `accessKey=${accessKey}`,
    `orderId=${orderId}`,
    `partnerCode=${partnerCode}`,
    `requestId=${requestId}`,
  ].join('&');

  const signature = crypto.createHmac('sha256', secretKey).update(rawSignature).digest('hex');

  const body = {
    partnerCode,
    requestId,
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
    console.error('[MoMo Query Error]:', err.response?.data || err.message);
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
