import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRealPaidOrder,
  isAdminGrantOrder,
  resolvePlanLabel,
  resolveDateRange,
  generateDateBuckets,
  formatVNLocalDate,
  formatVNLocalMonth,
  sanitizeSearchQuery,
  validateCreditsInput,
  calculateNewCredits,
} from '../admin.helpers';

describe('Admin Module - Financial & Revenue Calculations', () => {
  it('should exclude admin grant orders from real revenue and count them separately', () => {
    const orders = [
      { id: '1', amount: 19000, status: 'completed', method: 'payos' },
      { id: '2', amount: 49000, status: 'completed', method: 'momo' },
      { id: '3', amount: 99000, status: 'completed', method: 'admin' }, // admin grant
      { id: '4', amount: 19000, status: 'cancelled', method: 'payos' },
      { id: '5', amount: 49000, status: 'pending', method: 'payos' },
    ];

    const realPaidOrders = orders.filter(isRealPaidOrder);
    const adminOrders = orders.filter(isAdminGrantOrder);

    assert.equal(realPaidOrders.length, 2);
    assert.deepEqual(realPaidOrders.map((o) => o.id), ['1', '2']);
    const realRevenue = realPaidOrders.reduce((sum, o) => sum + o.amount, 0);
    assert.equal(realRevenue, 68000);

    assert.equal(adminOrders.length, 1);
    assert.equal(adminOrders[0].id, '3');
    const adminValue = adminOrders.reduce((sum, o) => sum + o.amount, 0);
    assert.equal(adminValue, 99000);
  });

  it('should ignore cancelled, pending, and refunded orders from revenue calculation', () => {
    const invalidStatuses = ['pending', 'cancelled', 'refunded', 'failed', 'unknown'];
    for (const status of invalidStatuses) {
      assert.equal(isRealPaidOrder({ status, method: 'payos' }), false);
      assert.equal(isAdminGrantOrder({ status, method: 'admin' }), false);
    }

    assert.equal(isRealPaidOrder({ status: 'completed', method: 'payos' }), true);
    assert.equal(isRealPaidOrder({ status: 'success', method: 'momo' }), true);
  });

  it('should resolve plan labels accurately and fallback to Gói cũ (<id>) for deprecated plans', () => {
    const plansMap = new Map<string, { label: string; name: string }>([
      ['single_trip', { label: 'Gói Chuyến Đơn', name: 'Gói Chuyến Đơn' }],
      ['monthly', { label: 'Gói Premium', name: 'Gói Premium' }],
    ]);

    assert.equal(resolvePlanLabel('single_trip', plansMap), 'Gói Chuyến Đơn');
    assert.equal(resolvePlanLabel('monthly', plansMap), 'Gói Premium');
    assert.equal(resolvePlanLabel('starter', plansMap), 'Gói cũ (starter)');
    assert.equal(resolvePlanLabel('plus', plansMap), 'Gói cũ (plus)');
    assert.equal(resolvePlanLabel('pro', plansMap), 'Gói cũ (pro)');
    assert.equal(resolvePlanLabel('unknown_xyz', plansMap), 'Gói cũ (unknown_xyz)');
    assert.equal(resolvePlanLabel('', plansMap), 'Gói dịch vụ');
    assert.equal(resolvePlanLabel(null, plansMap), 'Gói dịch vụ');
  });
});

describe('Admin Module - Date Ranges & Zero-filled Time Series', () => {
  it('should accurately calculate date ranges and prior comparison periods', () => {
    const range30 = resolveDateRange('30d');
    assert.equal(range30.range, '30d');
    assert.equal(range30.bucket, 'day');

    const toTime = new Date(range30.to).getTime();
    const fromTime = new Date(range30.from).getTime();
    const prevToTime = new Date(range30.prevTo).getTime();
    const prevFromTime = new Date(range30.prevFrom).getTime();

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    assert.equal(Math.round((toTime - fromTime) / thirtyDaysMs), 1);
    assert.equal(prevToTime, fromTime);
    assert.equal(Math.round((prevToTime - prevFromTime) / thirtyDaysMs), 1);

    const range365 = resolveDateRange('365d');
    assert.equal(range365.range, '365d');
    assert.equal(range365.bucket, 'month');
  });

  it('should generate unbroken zero-filled date buckets in Asia/Ho_Chi_Minh', () => {
    const now = new Date('2026-10-04T12:00:00+07:00');
    const from = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000); // 7 days total

    const buckets = generateDateBuckets(from.toISOString(), now.toISOString(), 'day');
    assert.equal(buckets.length, 7);
    assert.equal(buckets[0], '2026-09-28');
    assert.equal(buckets[buckets.length - 1], '2026-10-04');

    // Test month buckets for 365d
    const fromYear = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const monthBuckets = generateDateBuckets(fromYear.toISOString(), now.toISOString(), 'month');
    assert.ok(monthBuckets.length >= 12 && monthBuckets.length <= 14);
    assert.equal(monthBuckets[monthBuckets.length - 1], '2026-10');
  });

  it('should sanitize search query to prevent PostgREST syntax breaking', () => {
    assert.equal(sanitizeSearchQuery("user%or(email.eq.'bad')"), 'useroremail.eq.bad');
    assert.equal(sanitizeSearchQuery('  test@gmail.com, admin  '), 'test@gmail.com admin');
    assert.equal(sanitizeSearchQuery(undefined), '');
  });
});

describe('Admin Module - User Credits Modification (Set, Adjust, Revoke)', () => {
  it('preserves usage history and unselected wallets when changing Free remaining', () => {
    const current = { quota_total: 3, quota_used: 3, pro_credits: 7, monthly_credits: 4, premium_until: '2027-10-20T00:00:00.000Z' };
    const result = calculateNewCredits(current, { mode: 'set', targetWallet: 'free', freeRemaining: 5 }, new Date('2026-10-14'));
    assert.equal(result.quota_total, 8);
    assert.equal(result.pro_credits, 7);
    assert.equal(result.monthly_credits, 4);
    assert.equal(result.premium_until, current.premium_until);
    const revoked = calculateNewCredits(current, { mode: 'revoke', targetWallet: 'free' });
    assert.equal(revoked.quota_total, 3);
    assert.equal(revoked.pro_credits, 7);
    assert.equal(revoked.monthly_credits, 4);
  });

  it('rejects no-op, wrong wallet fields, numeric strings and database integer overflow', () => {
    for (const body of [
      { mode: 'set' }, { mode: 'adjust', freeDelta: 0 },
      { mode: 'set', targetWallet: 'free', proCredits: 2 },
      { mode: 'set', freeRemaining: '2' }, { mode: 'set', freeRemaining: 2147483648 },
      { mode: 'adjust', freeDelta: 1.5 }, { mode: 'set', freeRemaining: 1, proDelta: 2 },
      { mode: 'set', monthlyUntil: '2027-02-30T00:00:00Z' },
    ]) assert.equal(validateCreditsInput(body).valid, false, JSON.stringify(body));
    assert.equal(validateCreditsInput({ mode: 'set', targetWallet: 'free', freeRemaining: 0 }).valid, true);
  });

  it('never revives an expired stored balance by changing its expiry', () => {
    const current = { quota_total: 10, quota_used: 4, pro_credits: 2, monthly_credits: 9, premium_until: '2026-10-01T00:00:00Z' };
    const now = new Date('2026-10-14T00:00:00Z');
    const expiryOnly = calculateNewCredits(current, { mode: 'adjust', targetWallet: 'monthly', daysDelta: 30 }, now);
    assert.equal(expiryOnly.monthly_credits, 0);
    const newGrant = calculateNewCredits(current, { mode: 'adjust', targetWallet: 'monthly', monthlyDelta: 3, daysDelta: 30 }, now);
    assert.equal(newGrant.monthly_credits, 3);
    assert.equal(newGrant.pro_credits, 2);
    assert.equal(newGrant.quota_total, 10);
    assert.throws(() => calculateNewCredits(current, { mode: 'set', monthlyCredits: 5 }, now), /tương lai/);
    assert.throws(() => calculateNewCredits(current, { mode: 'adjust', freeDelta: -7 }, now), /không được âm/);
    assert.equal(calculateNewCredits(current, { mode: 'revoke', targetWallet: 'permanent' }, now).monthly_credits, 9);
  });
  it('should validate inputs strictly and reject invalid modes, negative numbers, or decimals', () => {
    assert.equal(validateCreditsInput(null).valid, false);
    assert.equal(validateCreditsInput({ mode: 'invalid_mode' }).valid, false);

    // Negative / decimal set
    assert.equal(validateCreditsInput({ mode: 'set', proCredits: -5 }).valid, false);
    assert.equal(validateCreditsInput({ mode: 'set', proCredits: 2.5 }).valid, false);
    assert.equal(validateCreditsInput({ mode: 'set', monthlyCredits: -1 }).valid, false);
    assert.equal(validateCreditsInput({ mode: 'set', monthlyUntil: 'not-a-date' }).valid, false);

    // Decimal adjust
    assert.equal(validateCreditsInput({ mode: 'adjust', proDelta: 1.5 }).valid, false);
    assert.equal(validateCreditsInput({ mode: 'adjust', daysDelta: 3.2 }).valid, false);

    // Valid inputs
    assert.equal(validateCreditsInput({ mode: 'revoke' }).valid, true);
    assert.equal(validateCreditsInput({ mode: 'set', proCredits: 5, monthlyCredits: 10, monthlyUntil: null }).valid, true);
    assert.equal(validateCreditsInput({ mode: 'adjust', proDelta: -2, monthlyDelta: 3, daysDelta: 7 }).valid, true);
  });

  it('should handle mode revoke cleanly', () => {
    const current = {
      pro_credits: 10,
      monthly_credits: 5,
      premium_until: new Date(Date.now() + 86400000).toISOString(),
      is_premium: true,
    };

    const res = calculateNewCredits(current, { mode: 'revoke' });
    assert.equal(res.pro_credits, 0);
    assert.equal(res.monthly_credits, 0);
    assert.equal(res.premium_until, null);
    assert.equal(res.is_premium, false);
  });

  it('should handle mode set with exact values', () => {
    const current = {
      pro_credits: 2,
      monthly_credits: 1,
      premium_until: null,
      is_premium: true,
    };

    const targetDate = new Date(Date.now() + 30 * 86400000).toISOString();
    const res = calculateNewCredits(current, {
      mode: 'set',
      proCredits: 15,
      monthlyCredits: 20,
      monthlyUntil: targetDate,
    });

    assert.equal(res.pro_credits, 15);
    assert.equal(res.monthly_credits, 20);
    assert.equal(res.premium_until, targetDate);
    assert.equal(res.is_premium, true);
  });

  it('should reject adjustment underflow and shift premium_until with daysDelta', () => {
    const now = new Date('2026-10-04T10:00:00Z');
    const current = {
      pro_credits: 3,
      monthly_credits: 2,
      premium_until: new Date('2026-10-10T10:00:00Z').toISOString(), // 6 days remaining
      is_premium: true,
    };

    // Subtraction exceeding the selected wallet must be rejected.
    assert.throws(() => calculateNewCredits(
      current,
      {
        mode: 'adjust',
        proDelta: -10,
        monthlyDelta: -5,
      },
      now
    ), /không được âm/);

    // Positive adjust with daysDelta
    const res2 = calculateNewCredits(
      current,
      {
        mode: 'adjust',
        proDelta: 2,
        monthlyDelta: 1,
        daysDelta: 5, // 2026-10-10 + 5 days = 2026-10-15
      },
      now
    );

    assert.equal(res2.pro_credits, 5);
    assert.equal(res2.monthly_credits, 3);
    assert.equal(new Date(res2.premium_until!).toISOString(), new Date('2026-10-15T10:00:00Z').toISOString());
    assert.equal(res2.is_premium, true);

    // If premium_until was null and daysDelta > 0, count from now
    const currentNullDate = {
      pro_credits: 0,
      monthly_credits: 0,
      premium_until: null,
      is_premium: false,
    };
    const res3 = calculateNewCredits(
      currentNullDate,
      {
        mode: 'adjust',
        proDelta: 0,
        monthlyDelta: 5,
        daysDelta: 10,
      },
      now
    );
    assert.equal(new Date(res3.premium_until!).toISOString(), new Date('2026-10-14T10:00:00Z').toISOString());
    assert.equal(res3.monthly_credits, 5);
    assert.equal(res3.is_premium, true);
  });
});
