import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PLANS_CONFIG, isUserPremium } from '../../../constants';
import { PREMIUM_PLANS } from '../payment.router';

describe('Payment & Premium Subscription Business Rules', () => {
  it('should initialize default plans correctly', () => {
    assert.ok(PREMIUM_PLANS.starter);
    assert.equal(PREMIUM_PLANS.starter.amount, 29000);
    assert.equal(PREMIUM_PLANS.starter.quota_total_grant, 10);

    assert.ok(PREMIUM_PLANS.premium);
    assert.equal(PREMIUM_PLANS.premium.amount, 49000);
    assert.equal(PREMIUM_PLANS.premium.quota_total_grant, 9999);
  });

  it('should evaluate isUserPremium correctly based on flag and expiration date', () => {
    // 1. Null / undefined profile
    assert.equal(isUserPremium(null), false);
    assert.equal(isUserPremium(undefined), false);

    // 2. is_premium boolean flag true
    assert.equal(isUserPremium({ is_premium: true }), true);

    // 3. is_premium false but valid future premium_until
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(isUserPremium({ is_premium: false, premium_until: futureDate }), true);

    // 4. is_premium false and expired premium_until
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(isUserPremium({ is_premium: false, premium_until: pastDate }), false);
  });
});
