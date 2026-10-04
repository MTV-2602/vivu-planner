import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  DEFAULT_PLANS_CONFIG,
  isUserPremium,
  getProCredits,
  getFreeQuota,
  isTimedPlan,
  computeGrant,
  UserRole,
  PaymentStatus,
} from '../../../constants';
import { PREMIUM_PLANS } from '../payment.router';
import { decideActivation, verifyPayOSWebhook, verifyMoMoIPN } from '../payment.service';

describe('Payment & Pro Credits Business Rules', () => {
  it('should initialize default plans correctly (single_trip: duration 0, monthly: duration 30)', () => {
    // 1. Gói chuyến đơn (không thời hạn)
    assert.ok(PREMIUM_PLANS.single_trip);
    assert.equal(PREMIUM_PLANS.single_trip.amount, 19000);
    assert.equal(PREMIUM_PLANS.single_trip.quota_total_grant, 1);
    assert.equal(PREMIUM_PLANS.single_trip.duration_days, 0);
    assert.equal(isTimedPlan(PREMIUM_PLANS.single_trip), false);

    // 2. Gói 1 tháng (có thời hạn 30 ngày)
    assert.ok(PREMIUM_PLANS.monthly);
    assert.equal(PREMIUM_PLANS.monthly.amount, 49000);
    assert.equal(PREMIUM_PLANS.monthly.quota_total_grant, 10);
    assert.equal(PREMIUM_PLANS.monthly.duration_days, 30);
    assert.equal(isTimedPlan(PREMIUM_PLANS.monthly), true);
  });

  it('should calculate getProCredits accurately with independent quota types and expiration', () => {
    const now = new Date('2026-10-04T12:00:00Z');

    // 1. User mới, chưa mua gói nào
    const emptyProfile = { pro_credits: 0, monthly_credits: 0, premium_until: null };
    const emptyCredits = getProCredits(emptyProfile, now);
    assert.equal(emptyCredits.proCredits, 0);
    assert.equal(emptyCredits.monthlyCredits, 0);
    assert.equal(emptyCredits.total, 0);
    assert.equal(emptyCredits.hasActiveMonthly, false);

    // 2. User chỉ có pro_credits (gói lẻ không thời hạn)
    const singleProfile = { pro_credits: 3, monthly_credits: 0, premium_until: null };
    const singleCredits = getProCredits(singleProfile, now);
    assert.equal(singleCredits.proCredits, 3);
    assert.equal(singleCredits.monthlyCredits, 0);
    assert.equal(singleCredits.total, 3);
    assert.equal(singleCredits.hasActiveMonthly, false);

    // 3. User có monthly_credits còn hạn
    const futureDate = new Date('2026-10-20T12:00:00Z').toISOString();
    const monthlyProfile = { pro_credits: 1, monthly_credits: 8, premium_until: futureDate };
    const monthlyCredits = getProCredits(monthlyProfile, now);
    assert.equal(monthlyCredits.proCredits, 1);
    assert.equal(monthlyCredits.monthlyCredits, 8);
    assert.equal(monthlyCredits.total, 9);
    assert.equal(monthlyCredits.hasActiveMonthly, true);
    assert.equal(monthlyCredits.monthlyRemainingDays, 16);

    // 4. User có monthly_credits nhưng đã hết hạn (premium_until trong quá khứ)
    const pastDate = new Date('2026-10-01T12:00:00Z').toISOString();
    const expiredProfile = { pro_credits: 2, monthly_credits: 5, premium_until: pastDate };
    const expiredCredits = getProCredits(expiredProfile, now);
    assert.equal(expiredCredits.proCredits, 2);
    assert.equal(expiredCredits.monthlyCredits, 0); // Đã hết hạn -> coi như 0
    assert.equal(expiredCredits.total, 2); // Chỉ còn 2 lượt không thời hạn
    assert.equal(expiredCredits.hasActiveMonthly, false);
    assert.equal(expiredCredits.monthlyRemainingDays, null);
    assert.equal(expiredCredits.monthlyUntil, null);

    // 5. User có premium_until tương lai nhưng monthly_credits <= 0
    const zeroCreditsProfile = { pro_credits: 3, monthly_credits: 0, premium_until: futureDate };
    const zeroCreditsResult = getProCredits(zeroCreditsProfile, now);
    assert.equal(zeroCreditsResult.proCredits, 3);
    assert.equal(zeroCreditsResult.monthlyCredits, 0);
    assert.equal(zeroCreditsResult.total, 3);
    assert.equal(zeroCreditsResult.hasActiveMonthly, false);
    assert.equal(zeroCreditsResult.monthlyRemainingDays, null);
    assert.equal(zeroCreditsResult.monthlyUntil, null);
  });

  it('should compute grant logic correctly for untimed and timed plans', () => {
    const now = new Date('2026-10-04T12:00:00Z');

    // 1. Mua gói lẻ (duration_days = 0): cộng dồn pro_credits, không đổi monthly_credits hay premium_until
    const current1 = { pro_credits: 1, monthly_credits: 5, premium_until: '2026-10-20T12:00:00.000Z' };
    const grant1 = computeGrant(current1, { quota_total_grant: 1, duration_days: 0 }, now);
    assert.equal(grant1.pro_credits, 2);
    assert.equal(grant1.monthly_credits, 5);
    assert.equal(grant1.premium_until, '2026-10-20T12:00:00.000Z');

    // 2. Mua gói tháng khi đã hết hạn (hoặc mua lần đầu): reset ngày từ now
    const current2 = { pro_credits: 2, monthly_credits: 0, premium_until: null };
    const grant2 = computeGrant(current2, { quota_total_grant: 10, duration_days: 30 }, now);
    assert.equal(grant2.pro_credits, 2);
    assert.equal(grant2.monthly_credits, 10);
    const expectedExpiry2 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(grant2.premium_until, expectedExpiry2);

    // 3. Gia hạn gói tháng khi đang còn hạn (Cumulative Renewal): cộng dồn cả ngày và lượt
    const currentExpiry = new Date('2026-10-15T12:00:00Z');
    const current3 = { pro_credits: 2, monthly_credits: 4, premium_until: currentExpiry.toISOString() };
    const grant3 = computeGrant(current3, { quota_total_grant: 10, duration_days: 30 }, now);
    assert.equal(grant3.pro_credits, 2);
    assert.equal(grant3.monthly_credits, 14); // 4 + 10 = 14
    const expectedExpiry3 = new Date(currentExpiry.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(grant3.premium_until, expectedExpiry3);
  });

  it('should evaluate isUserPremium correctly based on role and active credits', () => {
    const now = new Date('2026-10-04T12:00:00Z');

    // 1. Null / undefined profile
    assert.equal(isUserPremium(null, now), false);
    assert.equal(isUserPremium(undefined, now), false);

    // 2. Admin luôn là premium (vô hạn)
    assert.equal(isUserPremium({ role: UserRole.ADMIN }, now), true);

    // 3. User có pro_credits > 0
    assert.equal(isUserPremium({ pro_credits: 1, monthly_credits: 0 }, now), true);

    // 4. User có monthly_credits còn hạn
    const futureDate = new Date('2026-10-25T12:00:00Z').toISOString();
    assert.equal(isUserPremium({ pro_credits: 0, monthly_credits: 5, premium_until: futureDate }, now), true);

    // 5. User hết hạn gói tháng và không có pro_credits
    const pastDate = new Date('2026-10-01T12:00:00Z').toISOString();
    assert.equal(isUserPremium({ pro_credits: 0, monthly_credits: 5, premium_until: pastDate }, now), false);

    // 6. User chưa mua gói gì
    assert.equal(isUserPremium({ pro_credits: 0, monthly_credits: 0, premium_until: null }, now), false);
  });

  it('should calculate getFreeQuota accurately without interference from Pro credits', () => {
    // 1. Mặc định 3 chuyến free
    assert.deepEqual(getFreeQuota({ quota_used: 0 }), { used: 0, total: 3, remaining: 3 });
    assert.deepEqual(getFreeQuota({ quota_used: 1 }), { used: 1, total: 3, remaining: 2 });
    assert.deepEqual(getFreeQuota({ quota_used: 3 }), { used: 3, total: 3, remaining: 0 });
    assert.deepEqual(getFreeQuota({ quota_used: 5 }), { used: 5, total: 3, remaining: 0 });

    // 2. Custom free quota nếu có cấu hình riêng
    assert.deepEqual(getFreeQuota({ quota_used: 2, custom_quota: 5 }), { used: 2, total: 5, remaining: 3 });
  });

  it('should validate plan configuration fields strictly without silent clamping', () => {
    // Helper mô phỏng logic validate của Admin POST /plans
    function validatePlan(p: any) {
      const label = String(p.label || p.name || '').trim();
      if (!label) return { valid: false, field: 'label', error: 'Tên gói (label) là bắt buộc và không được để trống.' };

      const rawAmount = p.amount !== undefined ? p.amount : p.price;
      const numAmount = Number(rawAmount);
      if (rawAmount === undefined || rawAmount === null || rawAmount === '' || isNaN(numAmount) || !Number.isInteger(numAmount) || numAmount <= 0) {
        return { valid: false, field: 'amount', error: 'Giá gói (amount) phải là số nguyên lớn hơn 0.' };
      }

      const rawQuota = p.quota_total_grant;
      const numQuota = Number(rawQuota);
      if (rawQuota === undefined || rawQuota === null || rawQuota === '' || isNaN(numQuota) || !Number.isInteger(numQuota) || numQuota < 1) {
        return { valid: false, field: 'quota_total_grant', error: 'Số lượt cấp (quota_total_grant) phải là số nguyên lớn hơn hoặc bằng 1.' };
      }

      const rawDuration = p.duration_days;
      const numDuration = Number(rawDuration);
      if (rawDuration === undefined || rawDuration === null || rawDuration === '' || isNaN(numDuration) || !Number.isInteger(numDuration) || numDuration < 0) {
        return { valid: false, field: 'duration_days', error: 'Thời hạn (duration_days) phải là số nguyên lớn hơn hoặc bằng 0.' };
      }

      if (p.sort_order !== undefined && p.sort_order !== null && p.sort_order !== '') {
        const numSort = Number(p.sort_order);
        if (isNaN(numSort) || !Number.isInteger(numSort)) {
          return { valid: false, field: 'sort_order', error: 'Thứ tự sắp xếp (sort_order) phải là số nguyên.' };
        }
      }

      return { valid: true };
    }

    // 1. amount = -10000 -> reject
    const r1 = validatePlan({ label: 'Test', amount: -10000, quota_total_grant: 1, duration_days: 0 });
    assert.equal(r1.valid, false);
    assert.equal(r1.field, 'amount');

    // 2. quota_total_grant = 0 -> reject (không âm thầm clamp thành 1)
    const r2 = validatePlan({ label: 'Test', amount: 19000, quota_total_grant: 0, duration_days: 0 });
    assert.equal(r2.valid, false);
    assert.equal(r2.field, 'quota_total_grant');

    // 3. duration_days = -5 -> reject (không âm thầm clamp thành 0)
    const r3 = validatePlan({ label: 'Test', amount: 19000, quota_total_grant: 1, duration_days: -5 });
    assert.equal(r3.valid, false);
    assert.equal(r3.field, 'duration_days');

    // 4. duration_days = 1.5 -> reject (số thập phân)
    const r4 = validatePlan({ label: 'Test', amount: 19000, quota_total_grant: 1, duration_days: 1.5 });
    assert.equal(r4.valid, false);
    assert.equal(r4.field, 'duration_days');

    // 5. label rỗng -> reject
    const r5 = validatePlan({ label: '   ', amount: 19000, quota_total_grant: 1, duration_days: 0 });
    assert.equal(r5.valid, false);
    assert.equal(r5.field, 'label');

    // 6. Gói hợp lệ
    const r6 = validatePlan({ label: 'Gói Chuyến Đơn', amount: 19000, quota_total_grant: 1, duration_days: 0, sort_order: 1 });
    assert.equal(r6.valid, true);
  });

  it('should evaluate decideActivation accurately across status, amounts, and gateway results', () => {
    // 1. Pending + paid + đúng tiền => activate
    assert.deepEqual(
      decideActivation({
        orderStatus: PaymentStatus.PENDING,
        orderAmount: 49000,
        gatewayAmount: 49000,
        gatewayPaid: true,
      }),
      { shouldActivate: true, reason: 'ok' }
    );

    // 2. Cancelled + paid + đúng tiền => activate (khách thanh toán sau khi đơn hết hạn/bị hủy local)
    assert.deepEqual(
      decideActivation({
        orderStatus: PaymentStatus.CANCELLED,
        orderAmount: 49000,
        gatewayAmount: 49000,
        gatewayPaid: true,
      }),
      { shouldActivate: true, reason: 'ok' }
    );

    // 3. Sai tiền => KHÔNG activate, báo amount_mismatch
    assert.deepEqual(
      decideActivation({
        orderStatus: PaymentStatus.PENDING,
        orderAmount: 49000,
        gatewayAmount: 19000,
        gatewayPaid: true,
      }),
      { shouldActivate: false, reason: 'amount_mismatch' }
    );

    // 4. Chưa thanh toán ở cổng => KHÔNG activate, báo gateway_not_paid
    assert.deepEqual(
      decideActivation({
        orderStatus: PaymentStatus.PENDING,
        orderAmount: 49000,
        gatewayAmount: 49000,
        gatewayPaid: false,
      }),
      { shouldActivate: false, reason: 'gateway_not_paid' }
    );

    // 5. Đơn đã completed => KHÔNG activate, idempotent báo already_completed
    assert.deepEqual(
      decideActivation({
        orderStatus: PaymentStatus.COMPLETED,
        orderAmount: 49000,
        gatewayAmount: 49000,
        gatewayPaid: true,
      }),
      { shouldActivate: false, reason: 'already_completed' }
    );
  });

  it('should verify PayOS webhook signature correctly and reject tampered payloads', () => {
    const originalKey = process.env.PAYOS_CHECKSUM_KEY;
    const testKey = 'test_checksum_key_1234567890abcdef';
    process.env.PAYOS_CHECKSUM_KEY = testKey;

    try {
      const data = {
        accountNumber: '123456789',
        amount: 49000,
        code: '00',
        currency: 'VND',
        desc: 'success',
        description: 'ViVu Pro Goi Thang',
        orderCode: 1728000000000,
        paymentLinkId: 'plink_123',
        reference: 'FT123',
        transactionDateTime: '2026-10-04 12:00:00',
      };

      // Tự tính signature theo đúng chuẩn PayOS (keys sorted alphabetically)
      const sortedKeys = Object.keys(data).sort();
      const signData = sortedKeys.map((k) => `${k}=${(data as any)[k]}`).join('&');
      const validSig = crypto.createHmac('sha256', testKey).update(signData).digest('hex');

      // 1. Chữ ký chuẩn => true
      assert.equal(verifyPayOSWebhook({ data, signature: validSig }), true);

      // 2. Chữ ký bị sửa => false
      assert.equal(verifyPayOSWebhook({ data, signature: 'invalid_signature_hex' }), false);

      // 3. Payload bị sửa amount (tampered data) => false
      const tamperedData = { ...data, amount: 1000 };
      assert.equal(verifyPayOSWebhook({ data: tamperedData, signature: validSig }), false);
    } finally {
      process.env.PAYOS_CHECKSUM_KEY = originalKey;
    }
  });

  it('should verify MoMo IPN signature correctly and reject tampered payloads', () => {
    const origSecret = process.env.MOMO_SECRET_KEY;
    const origAccess = process.env.MOMO_ACCESS_KEY;
    const testSecret = 'momo_secret_key_abcdef';
    const testAccess = 'momo_access_key_123456';
    process.env.MOMO_SECRET_KEY = testSecret;
    process.env.MOMO_ACCESS_KEY = testAccess;

    try {
      const ipnPayload: any = {
        partnerCode: 'MOMO',
        orderId: 'VIVU1728000000000',
        requestId: 'req_123456',
        amount: 49000,
        orderInfo: 'ViVu Pro Goi Thang',
        orderType: 'momo_wallet',
        transId: 9876543210,
        resultCode: 0,
        message: 'Thành công.',
        payType: 'qr',
        responseTime: 1728000000000,
        extraData: '',
      };

      // Tự tính signature theo đúng thứ tự 13 trường MoMo v2
      const rawSignature = [
        `accessKey=${testAccess}`,
        `amount=${ipnPayload.amount}`,
        `extraData=${ipnPayload.extraData}`,
        `message=${ipnPayload.message}`,
        `orderId=${ipnPayload.orderId}`,
        `orderInfo=${ipnPayload.orderInfo}`,
        `orderType=${ipnPayload.orderType}`,
        `partnerCode=${ipnPayload.partnerCode}`,
        `payType=${ipnPayload.payType}`,
        `requestId=${ipnPayload.requestId}`,
        `responseTime=${ipnPayload.responseTime}`,
        `resultCode=${ipnPayload.resultCode}`,
        `transId=${ipnPayload.transId}`,
      ].join('&');
      const validSig = crypto.createHmac('sha256', testSecret).update(rawSignature).digest('hex');
      ipnPayload.signature = validSig;

      // 1. Chữ ký chuẩn => true
      assert.equal(verifyMoMoIPN(ipnPayload), true);

      // 2. Chữ ký sai => false
      assert.equal(verifyMoMoIPN({ ...ipnPayload, signature: 'wrong_sig' }), false);

      // 3. Sửa resultCode gian lận => false
      assert.equal(verifyMoMoIPN({ ...ipnPayload, resultCode: 99 }), false);
    } finally {
      process.env.MOMO_SECRET_KEY = origSecret;
      process.env.MOMO_ACCESS_KEY = origAccess;
    }
  });
});
