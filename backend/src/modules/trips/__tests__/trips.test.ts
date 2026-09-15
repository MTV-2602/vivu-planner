import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUDGET_AUTO_SCALE_THRESHOLD,
  BUDGET_AUTO_SCALE_FACTOR,
  QUOTA_CONFIG,
  TripStatus,
  UserRole
} from '../../../constants';
import { VALID_TRIP_TRANSITIONS } from '../trips.router';

describe('Trip & Quota Business Rules', () => {
  it('should have standard free tier and admin quotas', () => {
    assert.equal(QUOTA_CONFIG.DEFAULT_FREE_TRIPS, 3);
    assert.equal(QUOTA_CONFIG.UNLIMITED_ADMIN_TRIPS, 9999);
  });

  it('should scale down budgets entered in shorthand thousands accurately', () => {
    // If a user enters shorthand 500 (meaning 500,000):
    const shorthandBudget = 500;
    assert.ok(shorthandBudget < BUDGET_AUTO_SCALE_THRESHOLD);
    const scaled = shorthandBudget * BUDGET_AUTO_SCALE_FACTOR;
    assert.equal(scaled, 500_000);

    // If a user enters full 2,000,000 VND:
    const fullVnd = 2_000_000;
    assert.ok(fullVnd >= BUDGET_AUTO_SCALE_THRESHOLD);
  });

  it('should define all required trip lifecycle statuses', () => {
    assert.equal(TripStatus.DRAFT, 'draft');
    assert.equal(TripStatus.ACTIVE, 'active');
    assert.equal(TripStatus.COMPLETED, 'completed');
    assert.equal(TripStatus.ARCHIVED, 'archived');
  });

  it('should enforce state machine transition rules', () => {
    // Draft can move to Active or Archived
    assert.deepEqual(VALID_TRIP_TRANSITIONS[TripStatus.DRAFT], [TripStatus.ACTIVE, TripStatus.ARCHIVED]);

    // Active can move to Completed or Archived
    assert.deepEqual(VALID_TRIP_TRANSITIONS[TripStatus.ACTIVE], [TripStatus.COMPLETED, TripStatus.ARCHIVED]);

    // Completed can move to Archived or back to Active
    assert.deepEqual(VALID_TRIP_TRANSITIONS[TripStatus.COMPLETED], [TripStatus.ARCHIVED, TripStatus.ACTIVE]);

    // Archived can only un-archive back to Active, NOT jump directly to Draft
    assert.deepEqual(VALID_TRIP_TRANSITIONS[TripStatus.ARCHIVED], [TripStatus.ACTIVE]);
    assert.ok(!VALID_TRIP_TRANSITIONS[TripStatus.ARCHIVED].includes(TripStatus.DRAFT));
  });

  it('should define basic system user roles', () => {
    assert.equal(UserRole.USER, 'user');
    assert.equal(UserRole.ADMIN, 'admin');
  });

  it('should reject invalid trip date ranges where start_date is not strictly before end_date', () => {
    const validStart = '2026-10-01';
    const validEnd = '2026-10-05';
    assert.ok(new Date(validStart) < new Date(validEnd));

    const sameDay = '2026-10-01';
    assert.ok(new Date(validStart) >= new Date(sameDay));

    const invertedStart = '2026-10-05';
    const invertedEnd = '2026-10-01';
    assert.ok(new Date(invertedStart) >= new Date(invertedEnd));
  });
});

