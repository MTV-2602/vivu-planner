import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PARTNER_MATCH_WEIGHTS, BUDGET_PRICE_TIERS, GEO_CONFIG } from '../../../constants';

describe('Partner Matching & Geo Calculations', () => {
  it('should validate budget tier thresholds are monotonic', () => {
    assert.ok(BUDGET_PRICE_TIERS.BUDGET_MAX < BUDGET_PRICE_TIERS.MID_MAX);
    assert.ok(BUDGET_PRICE_TIERS.MID_MAX < BUDGET_PRICE_TIERS.UPSCALE_MAX);
  });

  it('should have properly calibrated match weights', () => {
    assert.equal(PARTNER_MATCH_WEIGHTS.EXACT_PRICE_MATCH, 0.3);
    assert.equal(PARTNER_MATCH_WEIGHTS.CLOSE_PRICE_MATCH, 0.15);
    assert.equal(PARTNER_MATCH_WEIGHTS.CUISINE_MATCH, 0.3);
    assert.equal(PARTNER_MATCH_WEIGHTS.AMENITY_MATCH, 0.2);
    assert.equal(PARTNER_MATCH_WEIGHTS.DIETARY_MATCH, 0.2);
    assert.equal(PARTNER_MATCH_WEIGHTS.INTEREST_MATCH, 0.2);
  });

  it('should use correct Earth radius for Haversine distance calculations', () => {
    assert.equal(GEO_CONFIG.EARTH_RADIUS_KM, 6371);
  });
});
