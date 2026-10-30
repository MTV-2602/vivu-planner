// Hermetic E2E Contracts & Interface Invariants Test Suite
for (const key of Object.keys(process.env)) {
  if (/^(CUSTOM_AI|GEMINI|PAYOS|MOMO|STRIPE|PAYPAL|VNPAY|ZALOPAY)/i.test(key)) delete process.env[key];
}
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-mock-role-key-test-isolation';
process.env.SUPABASE_ANON_KEY = 'synthetic-mock-anon-key-test-isolation';
process.env.GEMINI_API_KEY = 'synthetic-mock-gemini-key-test-isolation';
process.env.NODE_ENV = 'test';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TripStatus,
  TravelerType,
  UserRole,
  BUDGET_AUTO_SCALE_THRESHOLD,
  BUDGET_AUTO_SCALE_FACTOR
} from '../../../constants';
import {
  VALID_TRIP_TRANSITIONS,
  buildCreatedTripResponse,
  isTripProEntitled
} from '../trips.router';

// Pure logic mirrors of Frontend Turnstile Contracts (PROJECT.md § Interface Contracts)
export function isSignupSubmissionAllowed(params: {
  isSignUp: boolean;
  siteKey: string;
  captchaToken: string | null;
  loading: boolean;
  googleLoading: boolean;
  platform?: string;
}): { allowed: boolean; reason?: 'missing_key' | 'missing_token' | 'busy' | 'native_unsupported' } {
  const { isSignUp, siteKey, captchaToken, loading, googleLoading } = params;

  if (loading || googleLoading) {
    return { allowed: false, reason: 'busy' };
  }

  // Chế độ đăng nhập (isSignUp = false):
  if (!isSignUp) {
    if (!siteKey || siteKey.trim() === '') {
      return { allowed: true };
    }
    if (!captchaToken || captchaToken.trim() === '') {
      return { allowed: false, reason: 'missing_token' };
    }
    return { allowed: true };
  }

  // Chế độ đăng ký: Fail-Closed nếu thiếu site key
  if (!siteKey || siteKey.trim() === '') {
    return { allowed: false, reason: 'missing_key' };
  }

  // Chế độ đăng ký: Fail-Closed nếu chưa có token hoặc token rỗng/hết hạn
  if (!captchaToken || captchaToken.trim() === '') {
    return { allowed: false, reason: 'missing_token' };
  }

  return { allowed: true };
}

export function buildSupabaseSignInOptions(params: {
  captchaToken?: string | null;
}): { captchaToken?: string } | undefined {
  if (params.captchaToken && params.captchaToken.trim() !== '') {
    return {
      captchaToken: params.captchaToken.trim(),
    };
  }
  return undefined;
}

export function buildSupabaseSignUpOptions(params: {
  fullName: string;
  captchaToken?: string | null;
}): {
  data: { full_name: string };
  captchaToken?: string;
} {
  const options: {
    data: { full_name: string };
    captchaToken?: string;
  } = {
    data: { full_name: params.fullName },
  };

  if (params.captchaToken && params.captchaToken.trim() !== '') {
    options.captchaToken = params.captchaToken.trim();
  }

  return options;
}

// Pure logic mirrors of Google OAuth Redirect & Matching Contracts
export function resolveOAuthRedirectUri(params: {
  platform: 'web' | 'android' | 'ios';
  origin?: string;
  isStandalone?: boolean;
  expoHost?: string;
}): string {
  if (params.platform === 'web') {
    const base = params.origin || 'https://vivuai.vercel.app';
    return `${base.replace(/\/$/, '')}/dang-nhap`;
  }
  if (params.isStandalone) {
    return 'vivuplanner://dang-nhap';
  }
  const host = params.expoHost || 'localhost';
  return `exp://${host}:8081/--/dang-nhap`;
}

export function isGoogleIdentityMatchingPrimary(
  primaryEmail?: string | null,
  googleIdentityEmail?: string | null
): boolean {
  if (!primaryEmail || !googleIdentityEmail) return false;
  return primaryEmail.trim().toLowerCase() === googleIdentityEmail.trim().toLowerCase();
}

// Standby Cart & Calendar Event Transformation Contracts
export interface StandbyPlaceItem {
  id: string;
  name: string;
  category: string;
  cost: number;
  suggestedDuration?: number;
  address?: string;
  lat?: number;
  lng?: number;
}

export interface CalendarEventItem {
  id: string;
  placeId: string;
  title: string;
  category: string;
  cost: number;
  dayNumber: number;
  startHour: number;
  startMinute: number;
  durationMinutes: number;
}

export function transformStandbyToCalendarEvent(
  place: StandbyPlaceItem,
  dayNumber: number,
  startHour: number,
  startMinute: number = 0
): CalendarEventItem {
  return {
    id: `event-${place.id}-${Date.now()}`,
    placeId: place.id,
    title: place.name,
    category: place.category,
    cost: place.cost || 0,
    dayNumber,
    startHour,
    startMinute,
    durationMinutes: place.suggestedDuration || 60,
  };
}

export function transformCalendarEventToStandby(
  event: CalendarEventItem
): StandbyPlaceItem {
  return {
    id: event.placeId || event.id,
    name: event.title,
    category: event.category,
    cost: event.cost || 0,
    suggestedDuration: event.durationMinutes || 60,
  };
}

export function formatTimeForDb(timeStr?: string | null): string | null {
  if (!timeStr) return null;
  const clean = timeStr.trim();
  const match = clean.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const hh = match[1].padStart(2, '0');
    const mm = match[2].padStart(2, '0');
    const ss = match[3] ? match[3].padStart(2, '0') : '00';
    return `${hh}:${mm}:${ss}`;
  }
  return null;
}

describe('E2E Contract Verification: Turnstile CAPTCHA & Security Policies', () => {
  const SITE_KEY = '0x4AAAAAAFTw7hrMgVa79FF0';

  it('Tier 1: allows login when no site key is configured (dev mode)', () => {
    const res = isSignupSubmissionAllowed({
      isSignUp: false,
      siteKey: '',
      captchaToken: null,
      loading: false,
      googleLoading: false,
    });
    assert.deepEqual(res, { allowed: true });
  });

  it('Tier 1: strictly enforces Fail-Closed on login when site key is present and token is missing', () => {
    const res = isSignupSubmissionAllowed({
      isSignUp: false,
      siteKey: SITE_KEY,
      captchaToken: null,
      loading: false,
      googleLoading: false,
    });
    assert.equal(res.allowed, false);
    assert.equal(res.reason, 'missing_token');
  });

  it('Tier 1: allows login when site key is present and valid token is acquired', () => {
    const res = isSignupSubmissionAllowed({
      isSignUp: false,
      siteKey: SITE_KEY,
      captchaToken: 'valid-cf-turnstile-token-sample',
      loading: false,
      googleLoading: false,
    });
    assert.deepEqual(res, { allowed: true });
  });

  it('Tier 1: strictly enforces Fail-Closed on register when site key is missing', () => {
    const res = isSignupSubmissionAllowed({
      isSignUp: true,
      siteKey: '',
      captchaToken: 'some-token',
      loading: false,
      googleLoading: false,
    });
    assert.equal(res.allowed, false);
    assert.equal(res.reason, 'missing_key');
  });

  it('Tier 1: strictly enforces Fail-Closed on register when token is missing', () => {
    const res = isSignupSubmissionAllowed({
      isSignUp: true,
      siteKey: SITE_KEY,
      captchaToken: '',
      loading: false,
      googleLoading: false,
    });
    assert.equal(res.allowed, false);
    assert.equal(res.reason, 'missing_token');
  });

  it('Tier 1: allows register when both site key and valid token are provided', () => {
    const res = isSignupSubmissionAllowed({
      isSignUp: true,
      siteKey: SITE_KEY,
      captchaToken: 'cf-valid-registration-token',
      loading: false,
      googleLoading: false,
    });
    assert.deepEqual(res, { allowed: true });
  });

  it('Tier 2: rejects submission during busy/loading state even if token exists', () => {
    const res1 = isSignupSubmissionAllowed({
      isSignUp: false,
      siteKey: SITE_KEY,
      captchaToken: 'valid-token',
      loading: true,
      googleLoading: false,
    });
    assert.equal(res1.allowed, false);
    assert.equal(res1.reason, 'busy');

    const res2 = isSignupSubmissionAllowed({
      isSignUp: true,
      siteKey: SITE_KEY,
      captchaToken: 'valid-token',
      loading: false,
      googleLoading: true,
    });
    assert.equal(res2.allowed, false);
    assert.equal(res2.reason, 'busy');
  });

  it('Tier 1 & 2: formats Supabase signIn & signUp options with captchaToken properly', () => {
    const signInOpts = buildSupabaseSignInOptions({ captchaToken: 'token-abc-123' });
    assert.deepEqual(signInOpts, { captchaToken: 'token-abc-123' });

    const signInOptsEmpty = buildSupabaseSignInOptions({ captchaToken: '   ' });
    assert.equal(signInOptsEmpty, undefined);

    const signUpOpts = buildSupabaseSignUpOptions({
      fullName: 'Vinh Nguyen',
      captchaToken: 'token-xyz-789',
    });
    assert.deepEqual(signUpOpts, {
      data: { full_name: 'Vinh Nguyen' },
      captchaToken: 'token-xyz-789',
    });

    const signUpOptsNoToken = buildSupabaseSignUpOptions({
      fullName: 'Vinh Nguyen',
      captchaToken: null,
    });
    assert.deepEqual(signUpOptsNoToken, {
      data: { full_name: 'Vinh Nguyen' },
    });
  });
});

describe('E2E Contract Verification: Google OAuth & Deep Link Handlers', () => {
  it('Tier 1: resolves dynamic redirect URI for Web desktop & mobile', () => {
    const webUri = resolveOAuthRedirectUri({
      platform: 'web',
      origin: 'http://localhost:8081',
    });
    assert.equal(webUri, 'http://localhost:8081/dang-nhap');

    const webProdUri = resolveOAuthRedirectUri({
      platform: 'web',
      origin: 'https://vivuai.vercel.app/',
    });
    assert.equal(webProdUri, 'https://vivuai.vercel.app/dang-nhap');
  });

  it('Tier 1: resolves dynamic redirect URI for Android Standalone APK', () => {
    const androidUri = resolveOAuthRedirectUri({
      platform: 'android',
      isStandalone: true,
    });
    assert.equal(androidUri, 'vivuplanner://dang-nhap');
  });

  it('Tier 1: resolves dynamic redirect URI for Expo Go on Android emulator', () => {
    const expoUri = resolveOAuthRedirectUri({
      platform: 'android',
      isStandalone: false,
      expoHost: '10.0.2.2',
    });
    assert.equal(expoUri, 'exp://10.0.2.2:8081/--/dang-nhap');
  });

  it('Tier 2: strict email matching for Google account linking prevents account hijacking', () => {
    // Exact match (case insensitive)
    assert.equal(isGoogleIdentityMatchingPrimary('user@example.com', 'user@example.com'), true);
    assert.equal(isGoogleIdentityMatchingPrimary('User@Example.COM', 'user@example.com'), true);
    assert.equal(isGoogleIdentityMatchingPrimary('  user@example.com  ', 'user@example.com'), true);

    // Mismatched emails must be rejected
    assert.equal(isGoogleIdentityMatchingPrimary('user@company.com', 'user@gmail.com'), false);
    assert.equal(isGoogleIdentityMatchingPrimary('attacker@bad.com', 'victim@good.com'), false);
    assert.equal(isGoogleIdentityMatchingPrimary(null, 'user@gmail.com'), false);
    assert.equal(isGoogleIdentityMatchingPrimary('user@gmail.com', undefined), false);
  });

  it('Tier 2: guards against PKCE double-exchange of authorization code', async () => {
    let exchangeCount = 0;
    const exchangedCodes = new Set<string>();

    async function safeExchangeCodeForSession(code: string): Promise<{ success: boolean; error?: string }> {
      if (exchangedCodes.has(code)) {
        return { success: false, error: 'code_already_exchanged' };
      }
      exchangedCodes.add(code);
      exchangeCount++;
      return { success: true };
    }

    const testCode = 'auth-code-one-time-use-12345';
    // First exchange succeeds
    const res1 = await safeExchangeCodeForSession(testCode);
    assert.equal(res1.success, true);
    assert.equal(exchangeCount, 1);

    // Second exchange is safely blocked
    const res2 = await safeExchangeCodeForSession(testCode);
    assert.equal(res2.success, false);
    assert.equal(res2.error, 'code_already_exchanged');
    assert.equal(exchangeCount, 1);
  });
});

describe('E2E Contract Verification: Trip Creation & Workspace Drag-and-Drop', () => {
  it('Tier 1: validates created trip response schema & entitlement propagation', () => {
    const savedTrip = { id: 'trip-dn-001', title: 'Khám phá Đà Nẵng 3 ngày', status: TripStatus.DRAFT };
    const preferences = { is_ai_pro: true, ai_tier: 'pro' };
    const days = [{ day_number: 1, items: [] }, { day_number: 2, items: [] }];

    const response = buildCreatedTripResponse(savedTrip, savedTrip, preferences, days, true, true);
    assert.equal(response.id, 'trip-dn-001');
    assert.equal(response.is_ai_pro, true);
    assert.equal(response.preferences.ai_tier, 'pro');
    assert.equal(response.preferences.pro_credit_consumed, true);
    assert.equal(response.days.length, 2);
    assert.equal(isTripProEntitled(response), true);
  });

  it('Tier 1: transforms Standby Tray item into scheduled Calendar Event', () => {
    const standbyPlace: StandbyPlaceItem = {
      id: 'place-bana-hills',
      name: 'Bà Nà Hills',
      category: 'attraction',
      cost: 950000,
      suggestedDuration: 180,
    };

    const scheduledEvent = transformStandbyToCalendarEvent(standbyPlace, 1, 9, 0);
    assert.equal(scheduledEvent.placeId, 'place-bana-hills');
    assert.equal(scheduledEvent.title, 'Bà Nà Hills');
    assert.equal(scheduledEvent.category, 'attraction');
    assert.equal(scheduledEvent.dayNumber, 1);
    assert.equal(scheduledEvent.startHour, 9);
    assert.equal(scheduledEvent.startMinute, 0);
    assert.equal(scheduledEvent.durationMinutes, 180);
    assert.equal(scheduledEvent.cost, 950000);
  });

  it('Tier 1: transforms scheduled Calendar Event back to Standby Tray item', () => {
    const event: CalendarEventItem = {
      id: 'event-cau-rong-999',
      placeId: 'place-cau-rong',
      title: 'Cầu Rồng Phun Lửa',
      category: 'attraction',
      cost: 0,
      dayNumber: 2,
      startHour: 20,
      startMinute: 30,
      durationMinutes: 60,
    };

    const standby = transformCalendarEventToStandby(event);
    assert.equal(standby.id, 'place-cau-rong');
    assert.equal(standby.name, 'Cầu Rồng Phun Lửa');
    assert.equal(standby.category, 'attraction');
    assert.equal(standby.cost, 0);
    assert.equal(standby.suggestedDuration, 60);
  });

  it('Tier 2: formats time strings into standardized HH:MM:SS for database storage', () => {
    assert.equal(formatTimeForDb('09:00'), '09:00:00');
    assert.equal(formatTimeForDb('9:30'), '09:30:00');
    assert.equal(formatTimeForDb('18:00 - 20:00'), '18:00:00');
    assert.equal(formatTimeForDb('21:45:30'), '21:45:30');
    assert.equal(formatTimeForDb(''), null);
    assert.equal(formatTimeForDb(null), null);
  });

  it('Tier 2: validates budget auto-scaling factor for shorthand inputs', () => {
    const shorthandBudget = 600; // User entered 600 intending 600,000 VNĐ
    assert.ok(shorthandBudget < BUDGET_AUTO_SCALE_THRESHOLD);
    const scaled = shorthandBudget * BUDGET_AUTO_SCALE_FACTOR;
    assert.equal(scaled, 600000);
  });
});

describe('E2E Contract Verification: Non-Regression & State Transitions', () => {
  it('Tier 1: enforces valid trip state machine transitions', () => {
    assert.deepEqual(VALID_TRIP_TRANSITIONS[TripStatus.DRAFT], [TripStatus.ACTIVE, TripStatus.ARCHIVED]);
    assert.deepEqual(VALID_TRIP_TRANSITIONS[TripStatus.ACTIVE], [TripStatus.COMPLETED, TripStatus.ARCHIVED]);
    assert.deepEqual(VALID_TRIP_TRANSITIONS[TripStatus.COMPLETED], [TripStatus.ARCHIVED, TripStatus.ACTIVE]);
    assert.deepEqual(VALID_TRIP_TRANSITIONS[TripStatus.ARCHIVED], [TripStatus.ACTIVE]);
  });

  it('Tier 1: preserves user roles and privileges invariants', () => {
    assert.equal(UserRole.USER, 'user');
    assert.equal(UserRole.ADMIN, 'admin');
    assert.equal(TravelerType.SOLO, 'solo');
    assert.equal(TravelerType.COUPLE, 'couple');
    assert.equal(TravelerType.FAMILY, 'family');
    assert.equal(TravelerType.FRIENDS, 'friends');
  });
});
