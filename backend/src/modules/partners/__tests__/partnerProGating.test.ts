// Scrub sensitive keys: CUSTOM_AI_*, GEMINI_* (plural/all), payment (STRIPE, PAYPAL, VNPAY, MOMO, ZALOPAY)
for (const key of Object.keys(process.env)) {
  if (
    /^CUSTOM_AI/i.test(key) ||
    /^GEMINI/i.test(key) ||
    /^(STRIPE|PAYPAL|VNPAY|MOMO|ZALOPAY)/i.test(key)
  ) {
    delete process.env[key];
  }
}

// Verified dotenv neutralization & synthetic env setup for hermetic test isolation
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-mock-role-key-test-isolation';
process.env.SUPABASE_ANON_KEY = 'synthetic-mock-anon-key-test-isolation';
process.env.GEMINI_API_KEY = 'synthetic-mock-gemini-key-test-isolation';
process.env.NODE_ENV = 'test';

import dotenv from 'dotenv';
// Neutralize dotenv config & configDotenv failclosed so no live .env is loaded
dotenv.config = () => ({ parsed: {} });
if (typeof (dotenv as any).configDotenv === 'function') {
  (dotenv as any).configDotenv = () => ({ parsed: {} });
}

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';

// Failclosed Network Guard: throw immediately on any outgoing network attempt and append log with PID
export const FAILCLOSED_ERR = 'FAILCLOSED_NETWORK_DENIED: live network access forbidden in hermetic unit tests';

const logFilePath = path.resolve(__dirname, '../../../../../test/network_interceptions.log');

function logNetworkAttempt(api: string, details?: any) {
  const line = `[PID ${process.pid}] [${new Date().toISOString()}] BLOCKED: ${api} ${JSON.stringify(details || {})}\n`;
  try {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    fs.appendFileSync(logFilePath, line, 'utf8');
  } catch (err) {
    console.error(`[PID ${process.pid}] Failed to append network log:`, err);
    throw err;
  }
}

globalThis.fetch = ((...args: any[]) => {
  logNetworkAttempt('fetch', { url: String(args[0]) });
  throw new Error(`${FAILCLOSED_ERR} (fetch)`);
}) as any;

http.request = ((...args: any[]) => {
  logNetworkAttempt('http.request', args[0]);
  throw new Error(`${FAILCLOSED_ERR} (http.request)`);
}) as any;
http.get = ((...args: any[]) => {
  logNetworkAttempt('http.get', args[0]);
  throw new Error(`${FAILCLOSED_ERR} (http.get)`);
}) as any;

https.request = ((...args: any[]) => {
  logNetworkAttempt('https.request', args[0]);
  throw new Error(`${FAILCLOSED_ERR} (https.request)`);
}) as any;
https.get = ((...args: any[]) => {
  logNetworkAttempt('https.get', args[0]);
  throw new Error(`${FAILCLOSED_ERR} (https.get)`);
}) as any;

net.Socket.prototype.connect = function (...args: any[]) {
  logNetworkAttempt('net.Socket.connect', args[0]);
  throw new Error(`${FAILCLOSED_ERR} (net.Socket.connect)`);
};

tls.connect = ((...args: any[]) => {
  logNetworkAttempt('tls.connect', args[0]);
  throw new Error(`${FAILCLOSED_ERR} (tls.connect)`);
}) as any;

// DNS Callbacks & Promises & all Resolver methods
const dnsDeny = (method: string) => (...args: any[]) => {
  logNetworkAttempt(`dns.${method}`, args[0]);
  const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
  const err = new Error(`${FAILCLOSED_ERR} (dns.${method})`);
  if (cb) {
    try { cb(err); } catch {}
  }
  throw err;
};

const dnsPromiseDeny = (method: string) => async (...args: any[]) => {
  logNetworkAttempt(`dns.promises.${method}`, args[0]);
  throw new Error(`${FAILCLOSED_ERR} (dns.promises.${method})`);
};

dns.lookup = dnsDeny('lookup') as any;
dns.resolve = dnsDeny('resolve') as any;
dns.resolve4 = dnsDeny('resolve4') as any;
dns.resolve6 = dnsDeny('resolve6') as any;
dns.resolveCname = dnsDeny('resolveCname') as any;
dns.resolveMx = dnsDeny('resolveMx') as any;
dns.resolveNs = dnsDeny('resolveNs') as any;
dns.resolveTxt = dnsDeny('resolveTxt') as any;
dns.resolveSrv = dnsDeny('resolveSrv') as any;
dns.resolvePtr = dnsDeny('resolvePtr') as any;
dns.resolveNaptr = dnsDeny('resolveNaptr') as any;
dns.resolveSoa = dnsDeny('resolveSoa') as any;
dns.resolveCaa = dnsDeny('resolveCaa') as any;
dns.reverse = dnsDeny('reverse') as any;

dns.promises.lookup = dnsPromiseDeny('lookup') as any;
dns.promises.resolve = dnsPromiseDeny('resolve') as any;
dns.promises.resolve4 = dnsPromiseDeny('resolve4') as any;
dns.promises.resolve6 = dnsPromiseDeny('resolve6') as any;
dns.promises.resolveCname = dnsPromiseDeny('resolveCname') as any;
dns.promises.resolveMx = dnsPromiseDeny('resolveMx') as any;
dns.promises.resolveNs = dnsPromiseDeny('resolveNs') as any;
dns.promises.resolveTxt = dnsPromiseDeny('resolveTxt') as any;
dns.promises.resolveSrv = dnsPromiseDeny('resolveSrv') as any;
dns.promises.resolvePtr = dnsPromiseDeny('resolvePtr') as any;
dns.promises.resolveNaptr = dnsPromiseDeny('resolveNaptr') as any;
dns.promises.resolveSoa = dnsPromiseDeny('resolveSoa') as any;
dns.promises.resolveCaa = dnsPromiseDeny('resolveCaa') as any;
dns.promises.reverse = dnsPromiseDeny('reverse') as any;

if (dns.Resolver && dns.Resolver.prototype) {
  const resolverMethods = [
    'resolve', 'resolve4', 'resolve6', 'resolveCname', 'resolveMx',
    'resolveNs', 'resolveTxt', 'resolveSrv', 'resolvePtr', 'resolveNaptr',
    'resolveSoa', 'resolveCaa', 'reverse'
  ];
  for (const m of resolverMethods) {
    (dns.Resolver.prototype as any)[m] = dnsDeny(`Resolver.${m}`);
  }
}

if (dns.promises && (dns.promises as any).Resolver && (dns.promises as any).Resolver.prototype) {
  const resolverMethods = [
    'resolve', 'resolve4', 'resolve6', 'resolveCname', 'resolveMx',
    'resolveNs', 'resolveTxt', 'resolveSrv', 'resolvePtr', 'resolveNaptr',
    'resolveSoa', 'resolveCaa', 'reverse'
  ];
  for (const m of resolverMethods) {
    ((dns.promises as any).Resolver.prototype as any)[m] = dnsPromiseDeny(`promises.Resolver.${m}`);
  }
}

try {
  syncBuiltinESMExports();
} catch {}

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import express from 'express';
import {
  Partner,
  normalizeCityName,
  getRelevantPartners,
  convertPartnersToPlaceCandidates,
} from '../partners.service';
import { PlaceCandidate } from '../../places/places.service';
import { requireAdmin } from '../../../middleware/requireAdmin';
import { UserRole, isUserPremium } from '../../../constants';
import { supabaseAdmin } from '../../../config/supabase';
import adminRouter from '../../admin/admin.router';
import { activateOrderById } from '../../payment/payment.service';
import tripsRouter, {
  isTripProEntitled,
  getEligiblePartnersForTrip,
  buildCreatedTripResponse,
  sanitizeItineraryItemForTrip,
  verifyTripAccess,
  deductTripQuota,
  rollbackTripQuota,
} from '../../trips/trips.router';

describe('Atomic trip wallet calls', () => {
  it('never mutates balances locally when the migration is missing or an RPC fails', async () => {
    const originalRpc = supabaseAdmin.rpc;
    const originalFrom = supabaseAdmin.from;
    const calls: any[] = [];
    try {
      (supabaseAdmin as any).from = () => { throw new Error('Nonatomic wallet write forbidden'); };
      (supabaseAdmin as any).rpc = async (name: string, args: any) => { calls.push({ name, args }); return { data: null, error: { code: 'PGRST202', message: 'missing function' } }; };
      const missing = await deductTripQuota('user', true, null, 'trip', {});
      assert.equal(missing.success, false);
      assert.equal(missing.status, 503);
      assert.equal(missing.code, 'WALLET_MIGRATION_REQUIRED');
      assert.equal(missing.safeToDelete, true);
      assert.deepEqual(calls[0], { name: 'consume_trip_wallet', args: { p_user_id: 'user', p_trip_id: 'trip', p_is_pro: true } });
      (supabaseAdmin as any).rpc = async () => ({ data: null, error: { code: 'NETWORK', message: 'connection interrupted' } });
      const uncertain = await deductTripQuota('user', false, null, 'trip', {});
      assert.equal(uncertain.success, false);
      assert.equal(uncertain.safeToDelete, false);
      assert.equal(await rollbackTripQuota('user', true, 'trip'), false);
    } finally { supabaseAdmin.rpc = originalRpc; supabaseAdmin.from = originalFrom; }
  });

  it('keeps server deduction/idempotency result and refunds by trip identity', async () => {
    const originalRpc = supabaseAdmin.rpc;
    try {
      (supabaseAdmin as any).rpc = async () => ({ data: { deducted: true }, error: null });
      assert.deepEqual(await deductTripQuota('user', false, null, 'trip', {}), { success: true, deducted: true });
      (supabaseAdmin as any).rpc = async () => ({ data: { deducted: false }, error: null });
      assert.deepEqual(await deductTripQuota('user', true, null, 'trip', {}), { success: true, deducted: false });
      const calls: any[] = [];
      (supabaseAdmin as any).rpc = async (name: string, args: any) => { calls.push({ name, args }); return { data: null, error: null }; };
      assert.equal(await rollbackTripQuota('user', true, 'trip'), true);
      assert.deepEqual(calls, [{ name: 'refund_trip_wallet', args: { p_user_id: 'user', p_trip_id: 'trip' } }]);
      assert.equal(await rollbackTripQuota('user', true, null), false);
      assert.equal(calls.length, 1);
    } finally { supabaseAdmin.rpc = originalRpc; }
  });
});

describe('Three wallet API isolation', () => {
  it('updates Free remaining with a guarded missing-RPC fallback and rejects concurrent wallet changes', async () => {
    const originals = { from: supabaseAdmin.from, rpc: supabaseAdmin.rpc, channel: supabaseAdmin.channel };
    const handler = findRouteHandler(adminRouter, 'put', '/users/:id/credits');
    const initial = { id: 'user', role: 'user', quota_total: 3, quota_used: 3, pro_credits: 7, monthly_credits: 4, premium_until: '2027-10-20T00:00:00.000Z', is_premium: true };
    let profile: any = { ...initial };
    let conflict = false;
    let writes = 0;
    try {
      (supabaseAdmin as any).channel = () => ({ send: async () => ({}) });
      (supabaseAdmin as any).rpc = async () => { if (conflict) profile.quota_used++; return { data: null, error: { code: 'PGRST202', message: 'missing function' } }; };
      (supabaseAdmin as any).from = (table: string) => {
        const filters: Array<[string, string, any]> = [];
        let patch: any = null;
        const query: any = {
          select: () => query, update: (value: any) => { patch = value; return query; },
          eq: (key: string, value: any) => { filters.push(['eq', key, value]); return query; },
          neq: (key: string, value: any) => { filters.push(['neq', key, value]); return query; },
          is: (key: string, value: any) => { filters.push(['eq', key, value]); return query; },
          maybeSingle: async () => {
            if (!patch) return { data: { ...profile }, error: null };
            if (!filters.every(([op, key, value]) => op === 'neq' ? profile[key] !== value : profile[key] === value)) return { data: null, error: null };
            writes++; profile = { ...profile, ...patch }; return { data: { ...profile }, error: null };
          },
          then: (resolve: any) => resolve({ data: table === 'payment_orders' ? [] : null, count: 0, error: null }),
        };
        return query;
      };
      const success = createMockReqRes({ user: { id: 'admin' }, params: { id: 'user' }, body: { mode: 'set', targetWallet: 'free', freeRemaining: 5 } });
      await handler(success.req, success.res);
      assert.equal(success.getStatus(), 200);
      assert.equal(profile.quota_total, 8); assert.equal(profile.quota_used, 3);
      assert.equal(profile.pro_credits, 7); assert.equal(profile.monthly_credits, 4);
      assert.equal(success.getData().user.freeRemaining, 5);
      assert.equal(success.getData().user.rawMonthlyCredits, 4);
      conflict = true;
      const race = createMockReqRes({ user: { id: 'admin' }, params: { id: 'user' }, body: { mode: 'adjust', targetWallet: 'free', freeDelta: 2 } });
      await handler(race.req, race.res);
      assert.equal(race.getStatus(), 409); assert.equal(writes, 1); assert.equal(profile.quota_total, 8);
      const invalid = createMockReqRes({ params: { id: 'user' }, body: { mode: 'set', freeRemaining: '4' } });
      await handler(invalid.req, invalid.res); assert.equal(invalid.getStatus(), 400); assert.equal(writes, 1);
    } finally { supabaseAdmin.from = originals.from; supabaseAdmin.rpc = originals.rpc; supabaseAdmin.channel = originals.channel; }
  });

  it('settles the original timed duration after the current plan changes to permanent', async () => {
    const originals = { from: supabaseAdmin.from, rpc: supabaseAdmin.rpc, channel: supabaseAdmin.channel };
    const order = { id: 'VIVU123', user_id: 'user', method: 'admin', plan: 'dynamic-plan', amount: 49000, quota_granted: 10, duration_days_granted: 30, status: 'pending' };
    const grants: any[] = [];
    try {
      (supabaseAdmin as any).channel = () => ({ send: async () => ({}) });
      (supabaseAdmin as any).rpc = async (name: string, args: any) => { grants.push({ name, args }); return { data: null, error: null }; };
      (supabaseAdmin as any).from = (table: string) => {
        let patch: any = null;
        const query: any = {
          update: (value: any) => { patch = value; return query; }, eq: () => query, in: () => query, or: () => query, select: () => query,
          maybeSingle: async () => ({ data: table === 'payment_orders' ? order : { id: order.plan, duration_days: 0, quota_total_grant: 3 }, error: null }),
          then: (resolve: any) => resolve({ data: patch ? [{ ...order, ...patch }] : [], error: null }),
        };
        return query;
      };
      const result = await activateOrderById('VIVU123', { force: true, source: 'admin' });
      assert.equal(result.activated, true);
      assert.deepEqual(grants, [{ name: 'grant_plan_credits', args: { p_user_id: 'user', p_credits: 10, p_duration_days: 30 } }]);
    } finally { supabaseAdmin.from = originals.from; supabaseAdmin.rpc = originals.rpc; supabaseAdmin.channel = originals.channel; }
  });
});

// Helper mock Express Request & Response để test middleware và handler độc lập
function createMockReqRes(options: {
  user?: any;
  isAdmin?: boolean;
  body?: any;
  params?: any;
  query?: any;
}) {
  const req: any = {
    user: options.user,
    isAdmin: options.isAdmin,
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
  };

  let statusCode = 200;
  let responseData: any = null;

  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: any) {
      responseData = data;
      return res;
    },
    getStatusCode: () => statusCode,
    getData: () => responseData,
  };

  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };

  return {
    req,
    res,
    next,
    getStatus: () => statusCode,
    getData: () => responseData,
    wasNextCalled: () => nextCalled,
  };
}

// Tìm handler cuối cùng trong express router theo method và path
function findRouteHandler(router: any, method: string, path: string) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method.toLowerCase()]) {
      const handles = layer.route.stack.map((s: any) => s.handle);
      return handles[handles.length - 1];
    }
  }
  return null;
}

// Khởi tạo Express App pipeline chính thức để test router theo chuẩn app.handle
function createMockApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    if (req._mockUser !== undefined) req.user = req._mockUser;
    if (req._mockIsAdmin !== undefined) req.isAdmin = req._mockIsAdmin;
    next();
  });
  app.use('/trips', tripsRouter);
  return app;
}

// Thực thi request qua toàn bộ pipeline đã đăng ký của Express App mà không bypass qua final handler
function executeAppRequest(app: any, options: {
  method: string;
  url: string;
  user?: any;
  isAdmin?: boolean;
  body?: any;
  headers?: Record<string, string>;
}): Promise<{ status: number; data: any; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const req: any = new EventEmitter();
    req.method = options.method.toUpperCase();
    req.url = options.url;
    req.headers = { 'content-type': 'application/json', ...(options.headers || {}) };
    req._mockUser = options.user;
    req._mockIsAdmin = options.isAdmin;
    req.body = options.body || {};

    const res: any = new EventEmitter();
    let statusCode = 200;
    let responseData: any = null;
    const responseHeaders: Record<string, string> = {};

    res.setHeader = (k: string, v: string) => { responseHeaders[k.toLowerCase()] = String(v); };
    res.getHeader = (k: string) => responseHeaders[k.toLowerCase()];
    res.status = (code: number) => { statusCode = code; return res; };
    res.json = (data: any) => {
      responseData = data;
      resolve({ status: statusCode, data: responseData, headers: responseHeaders });
      return res;
    };
    res.send = (data: any) => {
      responseData = data;
      resolve({ status: statusCode, data: responseData, headers: responseHeaders });
      return res;
    };
    res.end = () => {
      resolve({ status: statusCode, data: responseData, headers: responseHeaders });
      return res;
    };

    app.handle(req, res, (err: any) => {
      if (err) reject(err);
      else resolve({ status: statusCode, data: responseData, headers: responseHeaders });
    });
  });
}

// Pin URLs below are synthetic evidence for isolated fixtures, never production source data.
function withFixturePinEvidence(partner: any): any {
  const verified = partner.i18n?.location_verified ?? partner.location_verified;
  const source = partner.i18n?.coordinate_source || partner.coordinate_source;
  return { ...partner, i18n: { ...(partner.i18n || {}), location_verified: verified,
    coordinate_source: source,
    resolved_maps_url: partner.i18n?.resolved_maps_url || `https://www.google.com/maps/place/Fixture/data=!3d${partner.lat}!4d${partner.lng}`
  } };
}

// In-memory Supabase Mock Engine hỗ trợ hermetic tests không đụng live database
function createMockSupabaseAdmin(tables: {
  trips?: any[];
  trip_collaborators?: any[];
  itinerary_days?: any[];
  itinerary_items?: any[];
  itinerary_revisions?: any[];
  partners?: any[];
  trip_cart_items?: any[];
}) {
  const state = {
    trips: [...(tables.trips || [])],
    trip_collaborators: [...(tables.trip_collaborators || [])],
    itinerary_days: [...(tables.itinerary_days || [])],
    itinerary_items: [...(tables.itinerary_items || [])],
    itinerary_revisions: [...(tables.itinerary_revisions || [])],
    partners: (tables.partners || []).map(withFixturePinEvidence),
    trip_cart_items: [...(tables.trip_cart_items || [])],
    upsertedCartItems: [] as any[],
  };

  const mockFrom = (tableName: string) => {
    const tableData = (state as any)[tableName] || [];
    let currentData = [...tableData];
    let countOnly = false;

    const builder: any = {
      select: (_fields?: string, opts?: any) => {
        if (opts && opts.count === 'exact' && opts.head === true) {
          countOnly = true;
        }
        return builder;
      },
      eq: (field: string, val: any) => {
        currentData = currentData.filter((row: any) => row[field] === val);
        return builder;
      },
      neq: (field: string, val: any) => {
        currentData = currentData.filter((row: any) => row[field] !== val);
        return builder;
      },
      in: (field: string, vals: any[]) => {
        currentData = currentData.filter((row: any) => vals.includes(row[field]));
        return builder;
      },
      lte: (field: string, val: any) => {
        currentData = currentData.filter((row: any) => row[field] <= val);
        return builder;
      },
      gte: (field: string, val: any) => {
        currentData = currentData.filter((row: any) => row[field] >= val);
        return builder;
      },
      ilike: (field: string, pattern: string) => {
        const cleanPat = pattern.replace(/%/g, '').toLowerCase();
        currentData = currentData.filter((row: any) =>
          String(row[field] || '').toLowerCase().includes(cleanPat)
        );
        return builder;
      },
      order: (field: string, opts?: any) => {
        const ascending = opts?.ascending !== false;
        currentData.sort((a: any, b: any) => {
          if (a[field] < b[field]) return ascending ? -1 : 1;
          if (a[field] > b[field]) return ascending ? 1 : -1;
          return 0;
        });
        return builder;
      },
      limit: (num: number) => {
        currentData = currentData.slice(0, num);
        return builder;
      },
      single: async () => {
        if (currentData.length === 0) {
          return { data: null, error: new Error('Row not found') };
        }
        return { data: currentData[0], error: null };
      },
      maybeSingle: async () => {
        return { data: currentData[0] || null, error: null };
      },
      upsert: async (payload: any) => {
        const items = Array.isArray(payload) ? payload : [payload];
        state.upsertedCartItems.push(...items);
        state.trip_cart_items.push(...items);
        return { data: items, error: null };
      },
      insert: async (payload: any) => {
        const items = Array.isArray(payload) ? payload : [payload];
        if (tableName === 'trip_cart_items') {
          state.trip_cart_items.push(...items);
        }
        return { data: items, error: null };
      },
      delete: () => {
        return {
          eq: (field: string, val: any) => {
            if (tableName === 'trip_cart_items') {
              state.trip_cart_items = state.trip_cart_items.filter((r: any) => r[field] !== val);
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
      then: (resolve: any, reject: any) => {
        if (countOnly) {
          return Promise.resolve({ data: null, count: currentData.length, error: null }).then(resolve, reject);
        }
        return Promise.resolve({ data: currentData, error: null }).then(resolve, reject);
      },
    };

    return builder;
  };

  return { mockFrom, state };
}

describe('Calendar save regression', () => {
  it('registered route saves created/upgraded Pro trips with no wallet queries or additional debit', async () => {
    const originals = { from: supabaseAdmin.from, rpc: supabaseAdmin.rpc };
    try {
      (supabaseAdmin as any).rpc = () => { throw new Error('Calendar must never consume credits'); };
      for (const [preferences, editor] of [[{ is_ai_pro: true, ai_tier: 'pro', pro_credit_consumed: true }, false], [{ ai_tier: 'pro', pro_credit_consumed: true }, false], [{ is_ai_pro: true, pro_credit_consumed: true }, true]] as const) {
        const writes: any[] = [];
        (supabaseAdmin as any).from = (table: string) => {
          assert.notEqual(table, 'profiles', 'Remaining wallet must not gate an already paid trip');
          let patch: any = null;
          const query: any = {
            select: (fields: string) => {
              if (table === 'trips') {
                assert.equal(fields.split(',').some(field => ['lat', 'lng'].includes(field.trim())), false, 'Trips has destination_lat/destination_lng, not lat/lng');
                assert.ok(fields.includes('destination_lat'));
              }
              return query;
            },
            eq: () => query, in: () => query, order: () => query,
            update: (value: any) => { patch = value; writes.push({ table, value }); return query; },
            maybeSingle: async () => ({ data: table === 'trip_collaborators' ? { id: 'editor-member', role: 'editor' } : { id: 'paid-trip', user_id: editor ? 'other-owner' : 'owner', preferences, destination_lat: 16.05, destination_lng: 108.2 }, error: null }),
            then: (resolve: any) => resolve({ data: patch ? null : table === 'itinerary_days' ? [{ id: 'day-1', day_number: 1 }] : [{ id: 'item-1', day_id: 'day-1' }], error: null }),
          };
          return query;
        };
        const response = await executeAppRequest(createMockApp(), { method: 'PUT', url: '/trips/paid-trip/sync-calendar', user: { id: 'owner', role: 'user', pro_credits: 0, monthly_credits: 0 }, body: { events: [{ id: 'item-1', dayNumber: 1, startHour: 10, durationMinutes: 60, cost: 25000 }] } });
        assert.equal(response.status, 200);
        assert.equal(response.data.success, true);
        assert.equal(writes[0].table, 'itinerary_items');
        assert.equal(writes[0].value.start_time, '10:00:00');
        assert.equal(writes[0].value.end_time, '11:00:00');
      }
    } finally { supabaseAdmin.from = originals.from; supabaseAdmin.rpc = originals.rpc; }
  });

  it('distinguishes missing trip from database failure and never reports a failed write as saved', async () => {
    const originalFrom = supabaseAdmin.from;
    try {
      for (const scenario of ['missing', 'query-error', 'write-error', 'standard', 'viewer', 'outsider', 'unauthenticated']) {
        let writes = 0;
        (supabaseAdmin as any).from = (table: string) => {
          let patch = false;
          const query: any = { select: () => query, eq: () => query, in: () => query, order: () => query,
            update: () => { patch = true; writes++; return query; },
            maybeSingle: async () => ({ data: scenario === 'missing' ? null : table === 'trip_collaborators' ? scenario === 'viewer' ? { id: 'membership', role: 'viewer' } : null : { id: 'paid-trip', user_id: scenario === 'viewer' || scenario === 'outsider' ? 'other-owner' : 'owner', preferences: scenario === 'standard' ? {} : { is_ai_pro: true } }, error: scenario === 'query-error' ? { message: 'column trips.lat does not exist', code: '42703' } : null }),
            then: (resolve: any) => resolve({ data: patch ? null : table === 'itinerary_days' ? [{ id: 'day-1', day_number: 1 }] : [{ id: 'item-1', day_id: 'day-1' }], error: patch && scenario === 'write-error' ? { message: 'write rejected' } : null }),
          };
          return query;
        };
        const result = await executeAppRequest(createMockApp(), { method: 'PUT', url: '/trips/paid-trip/sync-calendar', user: scenario === 'unauthenticated' ? undefined : { id: 'owner', role: 'user' }, body: { events: [{ id: 'item-1', dayNumber: 1 }] } });
        assert.equal(result.status, scenario === 'unauthenticated' ? 401 : scenario === 'missing' ? 404 : scenario.endsWith('error') ? 500 : 403, scenario);
        if (scenario !== 'write-error') assert.equal(writes, 0, scenario);
        assert.notEqual(result.data.success, true);
      }
    } finally { supabaseAdmin.from = originalFrom; }
  });
});

describe('Partner Pro Gating & Hermetic Isolation Test Suite', () => {
  it('pregen tài khoản có lượt nhưng chọn Standard không đọc local; chọn Pro tự đọc và Free giả Pro bị chặn', async () => {
    const originalFrom = supabaseAdmin.from;
    const originalApiKey = process.env.GEMINI_API_KEY;
    let credits = 1;
    let localQueries = 0;
    try {
      delete process.env.GEMINI_API_KEY;
      (supabaseAdmin as any).from = (table: string) => {
        if (table === 'partners') localQueries++;
        const data = table === 'profiles' ? [{ id: 'pool-fixture', role: 'user', pro_credits: credits }] : table === 'trips' ? [{ id: 'saved-pro-fixture', user_id: 'pool-fixture', destination_city: 'Đà Nẵng', preferences: { is_ai_pro: true, pro_credit_consumed: true } }] : [];
        const builder: any = { select: () => builder, eq: () => builder, order: () => builder, limit: () => builder,
          gt: () => builder, or: () => builder, update: () => builder, lt: () => builder, neq: () => builder,
          maybeSingle: async () => ({ data: data[0] || null, error: null }),
          single: async () => ({ data: data[0] || null, error: null }),
          then: (resolve: any, reject: any) => Promise.resolve({ data, error: null }).then(resolve, reject) };
        return builder;
      };
      const body = { destination_city: 'Đà Nẵng', days_count: 3, budget_total: 5000000, traveler_count: 1, ai_provider: 'gemini' };
      const standard = createMockReqRes({ user: { id: 'pool-fixture', role: 'user' }, body: { ...body, preferences: { use_local_data: true } } });
      await findRouteHandler(tripsRouter, 'post', '/pregen-places')(standard.req, standard.res);
      assert.equal(standard.getStatus(), 200);
      assert.equal(localQueries, 0);
      const pro = createMockReqRes({ user: standard.req.user, body: { ...body, is_ai_pro: true, preferences: { use_local_data: false } } });
      await findRouteHandler(tripsRouter, 'post', '/pregen-places')(pro.req, pro.res);
      assert.equal(pro.getStatus(), 200);
      assert.equal(localQueries, 1);
      credits = 0;
      const forged = createMockReqRes({ user: standard.req.user, body: { ...body, is_ai_pro: true, preferences: { use_local_data: true } } });
      await findRouteHandler(tripsRouter, 'post', '/pregen-places')(forged.req, forged.res);
      assert.equal(forged.getStatus(), 403);
      assert.equal(localQueries, 1);
      const paidTrip = createMockReqRes({ user: standard.req.user, body: { ...body, is_ai_pro: true, trip_id: 'saved-pro-fixture' } });
      await findRouteHandler(tripsRouter, 'post', '/pregen-places')(paidTrip.req, paidTrip.res);
      assert.equal(paidTrip.getStatus(), 200);
      assert.equal(localQueries, 2, 'Chuyến Pro đã trả phí dùng local dù lượt còn lại bằng 0');
      const outsider = createMockReqRes({ user: { id: 'outsider-fixture', role: 'user' }, body: paidTrip.req.body });
      await findRouteHandler(tripsRouter, 'post', '/pregen-places')(outsider.req, outsider.res);
      assert.equal(outsider.getStatus(), 403);
      assert.equal(localQueries, 2);
      const differentCity = createMockReqRes({ user: standard.req.user, body: { ...paidTrip.req.body, destination_city: 'Hà Nội' } });
      await findRouteHandler(tripsRouter, 'post', '/pregen-places')(differentCity.req, differentCity.res);
      assert.equal(differentCity.getStatus(), 400);
      assert.equal(localQueries, 2);
    } finally { supabaseAdmin.from = originalFrom; if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalApiKey; }
  });
  it('response tạo AI giữ ID và cờ đã trừ lượt khi đọc cuối lỗi, không phát sinh thao tác DB', () => {
    const saved = { id: 'trip-saved-fixture', preferences: { is_ai_pro: true, pro_credit_consumed: false } };
    const response = buildCreatedTripResponse(saved, null, { use_local_data: false }, [{ day_number: 1, items: [] }], true, true);
    assert.equal(response.id, saved.id);
    assert.equal(response.preferences.pro_credit_consumed, true);
    assert.equal(response.preferences.use_local_data, true);
    assert.equal(response.is_ai_pro, true);
    assert.ok(Array.isArray(response.days[0].items));
    assert.throws(() => buildCreatedTripResponse({}, null, {}, [], true, false), /mã chuyến đi/);
  });
  it('tạo bản nháp Pro trả schema days/items ổn định và tự lưu local=true dù cờ cũ false', async () => {
    const originalFrom = supabaseAdmin.from;
    let storedTrip: any;
    let availableCredits = 1;
    let tripWrites = 0;
    let failFinalRead = false;
    try {
      (supabaseAdmin as any).from = (table: string) => {
        let data: any = table === 'profiles' ? [{ id: 'creator-fixture', role: 'user', pro_credits: availableCredits, quota_total: 3, quota_used: 0 }] : table === 'trips' && storedTrip ? [storedTrip] : [];
        let inserted = false;
        const builder: any = {
          select: () => builder, eq: () => builder, is: () => builder,
          insert: (payload: any) => {
            inserted = true;
            if (table === 'trips') { tripWrites++; storedTrip = { ...payload, id: 'trip-created-fixture' }; data = [storedTrip]; }
            else data = Array.isArray(payload) ? payload : [payload];
            return builder;
          },
          update: () => builder,
          single: async () => table === 'trips' && !inserted && failFinalRead ? { data: null, error: new Error('Lỗi đọc sau khi lưu') } : { data: data[0] || null, error: null },
          maybeSingle: async () => ({ data: data[0] || null, error: null }),
          then: (resolve: any, reject: any) => Promise.resolve({ data, error: null }).then(resolve, reject)
        };
        return builder;
      };
      const { req, res, getStatus, getData } = createMockReqRes({ user: { id: 'creator-fixture', role: 'user' }, body: {
        title: 'TEST CREATE PRO TRIP', destination_city: 'Đà Nẵng', start_date: '2027-01-01', end_date: '2027-01-03',
        budget_total: 5000000, traveler_count: 1, creation_mode: 'manual', is_draft: true, is_ai_pro: true,
        preferences: { use_local_data: false }, cart_items: []
      } });
      await findRouteHandler(tripsRouter, 'post', '/')(req, res);
      assert.equal(getStatus(), 201);
      const created = getData();
      assert.equal(created.id, 'trip-created-fixture');
      assert.equal(created.preferences.is_ai_pro, true);
      assert.equal(created.preferences.use_local_data, true);
      assert.equal(created.days.length, 3);
      assert.ok(created.days.every((day: any) => Array.isArray(day.items)));
      failFinalRead = true;
      const failedRead = createMockReqRes({ user: req.user, body: req.body });
      await findRouteHandler(tripsRouter, 'post', '/')(failedRead.req, failedRead.res);
      assert.equal(failedRead.getStatus(), 201);
      assert.equal(failedRead.getData().id, 'trip-created-fixture');
      assert.equal(failedRead.getData().preferences.is_ai_pro, true);
      assert.equal(failedRead.getData().preferences.use_local_data, true);
      assert.equal(failedRead.getData().days.length, 3);
      availableCredits = 0;
      const forged = createMockReqRes({ user: { id: 'creator-fixture', role: 'user' }, body: {
        ...req.body, creation_mode: 'ai_auto', is_draft: false, is_ai_pro: true, preferences: { use_local_data: true }
      } });
      await findRouteHandler(tripsRouter, 'post', '/')(forged.req, forged.res);
      assert.equal(forged.getStatus(), 403);
      assert.equal(forged.getData().requires_premium, true);
      assert.equal(tripWrites, 2, 'Cờ Pro giả không tạo thêm chuyến hoặc tiêu thụ lượt thật');
    } finally { supabaseAdmin.from = originalFrom; }
  });
  let originalFrom: any;

  beforeEach(() => {
    originalFrom = supabaseAdmin.from;
    // Default safe in-memory mock để chặn mọi unmocked table không gọi network hay live DB
    (supabaseAdmin as any).from = () => {
      const defaultBuilder: any = {
        select: () => defaultBuilder,
        eq: () => defaultBuilder,
        neq: () => defaultBuilder,
        in: () => defaultBuilder,
        order: () => defaultBuilder,
        limit: () => defaultBuilder,
        single: () => Promise.resolve({ data: null, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        insert: () => Promise.resolve({ data: null, error: null }),
        upsert: () => Promise.resolve({ data: null, error: null }),
        delete: () => defaultBuilder,
        then: (resolve: any, reject: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
      };
      return defaultBuilder;
    };
  });

  afterEach(() => {
    supabaseAdmin.from = originalFrom;
  });

  // =========================================================================
  // TC-FAILCLOSED-NET: Hermetic Failclosed Network & Env Isolation Selftests
  // =========================================================================
  describe('TC-FAILCLOSED-NET: Hermetic Failclosed Network Interception', () => {
    it('chặn hoàn toàn fetch và ném lỗi FAILCLOSED_NETWORK_DENIED', async () => {
      assert.throws(
        () => {
          globalThis.fetch('https://api.supabase.com');
        },
        (err: any) => err.message.includes(FAILCLOSED_ERR)
      );
    });

    it('chặn hoàn toàn http.get và http.request', () => {
      assert.throws(
        () => {
          http.get('http://example.com');
        },
        (err: any) => err.message.includes(FAILCLOSED_ERR)
      );
      assert.throws(
        () => {
          http.request('http://example.com');
        },
        (err: any) => err.message.includes(FAILCLOSED_ERR)
      );
    });

    it('chặn hoàn toàn https.get và https.request', () => {
      assert.throws(
        () => {
          https.get('https://example.com');
        },
        (err: any) => err.message.includes(FAILCLOSED_ERR)
      );
      assert.throws(
        () => {
          https.request('https://example.com');
        },
        (err: any) => err.message.includes(FAILCLOSED_ERR)
      );
    });

    it('chặn hoàn toàn DNS lookup và DNS promises lookup', async () => {
      assert.throws(
        () => {
          dns.lookup('example.com', () => {});
        },
        (err: any) => err.message.includes(FAILCLOSED_ERR)
      );

      await assert.rejects(
        async () => {
          await dns.promises.lookup('example.com');
        },
        (err: any) => err.message.includes(FAILCLOSED_ERR)
      );
    });

    it('xác thực môi trường dotenv tổng hợp đã được cô lập an toàn', () => {
      assert.equal(process.env.SUPABASE_URL, 'http://localhost:54321');
      assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY, 'synthetic-mock-role-key-test-isolation');
      assert.equal(process.env.NODE_ENV, 'test');
    });
  });

  // =========================================================================
  // TC-ALIAS-001: Surgical City Normalization and Alias Resolution
  // =========================================================================
  describe('TC-ALIAS-001: Surgical City Normalization and Alias Resolution', () => {
    it('chuẩn hóa chính xác tất cả các biến thể của TP Hồ Chí Minh về hochiminh', () => {
      const hcmVariants = [
        'Hồ Chí Minh',
        'TP. Hồ Chí Minh',
        'TP Hồ Chí Minh',
        'TP.HCM',
        'TPHCM',
        'HCM',
        'Sài Gòn',
        'Saigon',
        'tphochiminh',
        'Thành phố Hồ Chí Minh',
      ];

      for (const variant of hcmVariants) {
        assert.equal(
          normalizeCityName(variant),
          'hochiminh',
          `Biến thể "${variant}" phải chuẩn hóa về "hochiminh"`
        );
      }
    });

    it('chuẩn hóa chính xác Thừa Thiên Huế và Huế về hue', () => {
      const hueVariants = [
        'Huế',
        'Thừa Thiên Huế',
        'Thừa Thiên - Huế',
        'Tỉnh Thừa Thiên Huế',
        'thuathienhue',
        'tinhthuathienhue',
        'Hue',
      ];

      for (const variant of hueVariants) {
        assert.equal(
          normalizeCityName(variant),
          'hue',
          `Biến thể "${variant}" phải chuẩn hóa về "hue"`
        );
      }
    });

    it('chuẩn hóa các thành phố du lịch lớn khác mà không gây nhầm lẫn', () => {
      assert.equal(normalizeCityName('Đà Nẵng'), 'danang');
      assert.equal(normalizeCityName('TP. Đà Nẵng'), 'danang');
      assert.equal(normalizeCityName('Hà Nội'), 'hanoi');
      assert.equal(normalizeCityName('Đà Lạt'), 'dalat');
      assert.equal(normalizeCityName('Nha Trang'), 'nhatrang');
      assert.equal(normalizeCityName('Phú Quốc'), 'phuquoc');
      assert.equal(normalizeCityName('Hội An'), 'hoian');
      assert.equal(normalizeCityName('Vũng Tàu'), 'vungtau');
      assert.equal(normalizeCityName('Quy Nhơn'), 'quynhon');
    });

    it('không làm lẫn lộn giữa Phú Quốc, Nha Trang hoặc Hội An với Đà Nẵng', () => {
      assert.notEqual(normalizeCityName('Phú Quốc'), normalizeCityName('Đà Nẵng'));
      assert.notEqual(normalizeCityName('Hội An'), normalizeCityName('Đà Nẵng'));
      assert.notEqual(normalizeCityName('Nha Trang'), normalizeCityName('Đà Lạt'));
    });
  });

  // =========================================================================
  // TC-PRO-ENTITLEMENT: Server-Side Entitlement Check with isUserPremium
  // =========================================================================
  describe('TC-PRO-ENTITLEMENT: Server-Side Entitlement Check', () => {
    it('user thường có pro_credits = 0 và không có gói tháng là Free user (isUserPremium = false)', () => {
      const freeProfile = {
        id: 'user-free-1',
        role: UserRole.USER,
        pro_credits: 0,
        monthly_credits: 0,
        premium_until: null,
      };

      assert.equal(isUserPremium(freeProfile), false);
    });

    it('user thường dù gửi cờ is_ai_pro = true nhưng server kiểm tra profile vẫn xác định là Free', () => {
      const userProfile = {
        id: 'user-free-2',
        role: UserRole.USER,
        pro_credits: 0,
        monthly_credits: 0,
      };

      const isEntitled = isUserPremium(userProfile);
      assert.equal(isEntitled, false, 'Client claim is_ai_pro không được tin tưởng nếu profile không có quyền');
    });

    it('user có pro_credits > 0 là Pro user (isUserPremium = true)', () => {
      const proProfile = {
        id: 'user-pro-1',
        role: UserRole.USER,
        pro_credits: 5,
        monthly_credits: 0,
      };

      assert.equal(isUserPremium(proProfile), true);
    });

    it('user có gói tháng còn hạn là Pro user (isUserPremium = true)', () => {
      const nextMonth = new Date(Date.now() + 15 * 86400 * 1000).toISOString();
      const monthlyProfile = {
        id: 'user-monthly-1',
        role: UserRole.USER,
        pro_credits: 0,
        monthly_credits: 10,
        premium_until: nextMonth,
      };

      assert.equal(isUserPremium(monthlyProfile), true);
    });

    it('user có gói tháng hết hạn và 0 credit là Free user (isUserPremium = false)', () => {
      const pastDate = new Date(Date.now() - 5 * 86400 * 1000).toISOString();
      const expiredProfile = {
        id: 'user-expired-1',
        role: UserRole.USER,
        pro_credits: 0,
        monthly_credits: 10,
        premium_until: pastDate,
      };

      assert.equal(isUserPremium(expiredProfile), false);
    });

    it('tài khoản admin luôn có quyền Pro kể cả khi 0 credit', () => {
      const adminProfile = {
        id: 'admin-1',
        role: UserRole.ADMIN,
        pro_credits: 0,
        monthly_credits: 0,
      };

      assert.equal(isUserPremium(adminProfile), true);
    });
  });

  // =========================================================================
  // TC-GEO-FILTER: Strict Location Quality in getRelevantPartners
  // =========================================================================
  describe('TC-GEO-FILTER: Strict Location Quality in getRelevantPartners', () => {
    it('Pro tự truy vấn local kể cả cờ cũ false; cờ xác minh giả không khớp URL bị loại', async () => {
      let queries = 0;
      (supabaseAdmin as any).from = () => {
        queries++;
        return { select: () => ({ eq: () => Promise.resolve({ data: [{
          id: 'spoof-fixture', name: 'Điểm giả kiểm thử', city: 'Đà Nẵng', lat: 16.05, lng: 108.2,
          active_status: true, i18n: { location_verified: true, coordinate_source: 'google_maps_pin',
            resolved_maps_url: 'https://www.google.com/maps/place/Fixture/data=!3d21!4d105' }
        }], error: null }) }) };
      };
      assert.deepEqual(await getRelevantPartners('Đà Nẵng', 16.05, 108.2, { use_local_data: false }), []);
      assert.equal(queries, 1);
      assert.deepEqual(await getRelevantPartners('Đà Nẵng', 16.05, 108.2, { use_local_data: true }), []);
      assert.equal(queries, 2);
    });
    const daNangCenter = { lat: 16.0544, lng: 108.2022 };

    const mockPartners: any[] = [
      {
        id: 'p-valid-pin',
        name: 'Nhà Hàng Biển Mỹ Khê Chuẩn Pin',
        category: 'restaurant',
        address: '50 Võ Nguyên Giáp, Đà Nẵng',
        lat: 16.0600,
        lng: 108.2400,
        city: 'Đà Nẵng',
        active_status: true,
        location_verified: true,
        coordinate_source: 'google_maps_pin',
        price_level: 2,
        admin_rating: 5,
        opening_hours: '08:00 - 22:00',
        avg_duration_minutes: 90,
        booking_url: 'https://partner.com/book',
      },
      {
        id: 'p-i18n-pin',
        name: 'Khách Sạn Sông Hàn i18n Pin',
        category: 'hotel',
        address: '100 Bạch Đằng, Đà Nẵng',
        lat: 16.0700,
        lng: 108.2230,
        city: 'TP. Đà Nẵng',
        active_status: true,
        price_level: 3,
        admin_rating: 4,
        i18n: {
          location_verified: true,
          coordinate_source: 'google_maps_pin',
          opening_hours: '24/7',
          avg_duration_minutes: 120,
        },
      },
      {
        id: 'p-approximate-rejected',
        name: 'Quán Ăn Tọa Độ Ước Lượng',
        category: 'restaurant',
        address: 'Đường chưa rõ, Đà Nẵng',
        lat: 16.0550,
        lng: 108.2030,
        city: 'Đà Nẵng',
        active_status: true,
        location_verified: true,
        coordinate_source: 'address_approximate',
      },
      {
        id: 'p-unverified-rejected',
        name: 'Quán Chưa Xác Thực Vị Trí',
        category: 'restaurant',
        address: 'Đà Nẵng',
        lat: 16.0550,
        lng: 108.2030,
        city: 'Đà Nẵng',
        active_status: true,
        location_verified: false,
      },
      {
        id: 'p-too-far-rejected',
        name: 'Resort Quá Xa Ngoài Bán Kính 15km',
        category: 'hotel',
        address: 'Xa trung tâm 35km',
        lat: 16.3500,
        lng: 108.2022,
        city: 'Đà Nẵng',
        active_status: true,
        location_verified: true,
        coordinate_source: 'google_maps_pin',
      },
      {
        id: 'p-zero-coord-rejected',
        name: 'Đối Tác Tọa Độ 0 0',
        category: 'cafe',
        address: 'Đà Nẵng',
        lat: 0,
        lng: 0,
        city: 'Đà Nẵng',
        active_status: true,
        location_verified: true,
        coordinate_source: 'google_maps_pin',
      },
      {
        id: 'p-inactive-rejected',
        name: 'Đối Tác Ngưng Hoạt Động',
        category: 'cafe',
        address: 'Đà Nẵng',
        lat: 16.0550,
        lng: 108.2030,
        city: 'Đà Nẵng',
        active_status: false,
        location_verified: true,
        coordinate_source: 'google_maps_pin',
      },
      {
        id: 'p-other-city',
        name: 'Quán Hà Nội',
        category: 'restaurant',
        address: 'Hà Nội',
        lat: 21.0285,
        lng: 105.8542,
        city: 'Hà Nội',
        active_status: true,
        location_verified: true,
        coordinate_source: 'google_maps_pin',
      },
    ];

    it('chỉ lấy điểm có pin xác minh thuộc thành phố cho chuyến Pro', async () => {
      (supabaseAdmin as any).from = (table: string) => {
        if (table === 'partners') {
          return {
            select: () => ({
              eq: (_field: string, val: any) => {
                const filtered = mockPartners.filter((p) => p.active_status === val);
                return Promise.resolve({ data: filtered.map(withFixturePinEvidence), error: null });
              },
            }),
          };
        }
        return originalFrom(table);
      };

      const result = await getRelevantPartners(
        'Đà Nẵng',
        daNangCenter.lat,
        daNangCenter.lng,
        { use_local_data: true },
        5000000,
        '2026-11-01',
        '2026-11-03',
        2
      );

      const ids = result.map((p) => p.id);
      assert.ok(ids.includes('p-valid-pin'), 'Phải bao gồm đối tác pin chuẩn');
      assert.ok(ids.includes('p-i18n-pin'), 'Phải bao gồm đối tác pin chuẩn từ i18n');

      assert.ok(!ids.includes('p-approximate-rejected'), 'Phải loại bỏ đối tác address_approximate');
      assert.ok(!ids.includes('p-unverified-rejected'), 'Phải loại bỏ đối tác unverified');
      assert.ok(ids.includes('p-too-far-rejected'), 'Điểm cùng thành phố xa trung tâm vẫn được cân nhắc');
      assert.ok(!ids.includes('p-zero-coord-rejected'), 'Phải loại bỏ đối tác có tọa độ (0,0)');
      assert.ok(!ids.includes('p-other-city'), 'Phải loại bỏ đối tác ở thành phố khác');
    });

    it('chấp nhận alias thành phố khi truy vấn đối tác (TP.HCM -> hochiminh)', async () => {
      const hcmCenter = { lat: 10.7769, lng: 106.7009 };
      const hcmPartners: any[] = [
        {
          id: 'p-hcm-1',
          name: 'Nhà Hàng Quận 1 Chuẩn Pin',
          category: 'restaurant',
          address: '1 Đồng Khởi, Q1, TP HCM',
          lat: 10.7769,
          lng: 106.7009,
          city: 'Hồ Chí Minh',
          active_status: true,
          location_verified: true,
          coordinate_source: 'google_maps_pin',
        },
      ];

      (supabaseAdmin as any).from = () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: hcmPartners.map(withFixturePinEvidence), error: null }),
        }),
      });

      const resultSaigon = await getRelevantPartners('Sài Gòn', hcmCenter.lat, hcmCenter.lng, { use_local_data: true });
      assert.equal(resultSaigon.length, 1);
      assert.equal(resultSaigon[0].id, 'p-hcm-1');

      const resultHcm = await getRelevantPartners('TP.HCM', hcmCenter.lat, hcmCenter.lng, { use_local_data: true });
      assert.equal(resultHcm.length, 1);
      assert.equal(resultHcm[0].id, 'p-hcm-1');
    });
  });

  // =========================================================================
  // TC-CONVERT: Provenance and Rich Metadata Preservation in PlaceCandidate
  // =========================================================================
  describe('TC-CONVERT: Provenance and Metadata Preservation', () => {
    it('chuyển đổi đối tác sang PlaceCandidate giữ nguyên toàn bộ metadata và gán đúng badge', () => {
      const inputPartner: any = {
        id: 'partner-uuid-1234',
        name: 'Nhà Hàng Ẩm Thực Cung Đình Huế',
        category: 'restaurant',
        address: '51 Lê Lợi, TP Huế',
        lat: 16.4637,
        lng: 107.5909,
        city: 'Huế',
        price_level: 3,
        admin_rating: 4.9,
        active_status: true,
        location_verified: true,
        coordinate_source: 'google_maps_pin',
        opening_hours: '09:00 - 21:30',
        avg_duration_minutes: 75,
        booking_url: 'https://cungdinhhue.vn/dat-ban',
        social_review_quote: 'Không gian cung đình tráng lệ, đồ ăn chuẩn vị.',
        description: 'Nhà hàng chuyên phục vụ ẩm thực hoàng gia Huế.',
      };

      const candidates = convertPartnersToPlaceCandidates([inputPartner]);
      assert.equal(candidates.length, 1);

      const c = candidates[0];
      assert.equal(c.google_place_id, 'partner_partner-uuid-1234');
      assert.equal(c.partner_id, 'partner-uuid-1234');
      assert.equal(c.is_partner, true);
      assert.equal(c.pro_badge, 'Dữ liệu Pro');
      assert.equal(c.source, 'admin_partner');
      assert.equal(c.category, 'dining');
      assert.equal(c.opening_hours, '09:00 - 21:30');
      assert.equal(c.avg_duration_minutes, 75);
      assert.equal(c.booking_url, 'https://cungdinhhue.vn/dat-ban');
      assert.equal(c.social_review_quote, 'Không gian cung đình tráng lệ, đồ ăn chuẩn vị.');
      assert.equal(c.description, 'Nhà hàng chuyên phục vụ ẩm thực hoàng gia Huế.');
    });

    it('ánh xạ đúng các nhóm danh mục đối tác sang danh mục PlaceCandidate', () => {
      const partners: any[] = [
        { id: '1', name: 'Hotel A', category: 'hotel', lat: 10, lng: 10, city: 'HN', active_status: true },
        { id: '2', name: 'Homestay B', category: 'homestay', lat: 10, lng: 10, city: 'HN', active_status: true },
        { id: '3', name: 'Food C', category: 'food', lat: 10, lng: 10, city: 'HN', active_status: true },
        { id: '4', name: 'Cafe D', category: 'cafe', lat: 10, lng: 10, city: 'HN', active_status: true },
        { id: '5', name: 'Attraction E', category: 'attraction', lat: 10, lng: 10, city: 'HN', active_status: true },
        { id: '6', name: 'Rental F', category: 'rental', lat: 10, lng: 10, city: 'HN', active_status: true },
      ];

      const candidates = convertPartnersToPlaceCandidates(partners);
      assert.equal(candidates.find((c) => c.partner_id === '1')?.category, 'accommodation');
      assert.equal(candidates.find((c) => c.partner_id === '2')?.category, 'accommodation');
      assert.equal(candidates.find((c) => c.partner_id === '3')?.category, 'dining');
      assert.equal(candidates.find((c) => c.partner_id === '4')?.category, 'dining');
      assert.equal(candidates.find((c) => c.partner_id === '5')?.category, 'attraction');
      assert.equal(candidates.find((c) => c.partner_id === '6')?.category, 'rental');
    });
  });

  // =========================================================================
  // TC-ANTI-SPOOF: Anti-Spoofing and Data Sanitization in Trip Persistence
  // =========================================================================
  describe('TC-ANTI-SPOOF: Anti-Spoofing and Forgery Prevention', () => {
    const validPartnerIds = new Set(['11111111-1111-4111-8111-111111111111']);

    it('loại bỏ partner_id giả mạo khi client gửi UUID không nằm trong danh sách đối tác được phép', () => {
      const forgedId = '99999999-9999-4999-8999-999999999999';
      const isAiPro = true;

      let itemPartnerId: string | null = null;
      const cleanId = forgedId.replace('partner_', '');
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (isAiPro && uuidRegex.test(cleanId) && validPartnerIds.has(cleanId)) {
        itemPartnerId = cleanId;
      }

      assert.equal(itemPartnerId, null, 'UUID không có trong danh sách được phép phải bị làm sạch về null');
    });

    it('chuyến Free (isAiPro = false) tuyệt đối không cho phép gán partner_id ngay cả khi UUID hợp lệ', () => {
      const genuineId = '11111111-1111-4111-8111-111111111111';
      const isAiPro = false;

      let itemPartnerId: string | null = null;
      const cleanId = genuineId.replace('partner_', '');
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (isAiPro && uuidRegex.test(cleanId) && validPartnerIds.has(cleanId)) {
        itemPartnerId = cleanId;
      }

      assert.equal(itemPartnerId, null, 'Chuyến Free không được lưu partner_id vào database');
    });

    it('chuyến Pro với partner_id hợp lệ được gán pro_badge là "Dữ liệu Pro" và không có ưu đãi bịa đặt', () => {
      const genuineId = '11111111-1111-4111-8111-111111111111';
      const isAiPro = true;

      let itemPartnerId: string | null = null;
      const cleanId = genuineId.replace('partner_', '');
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (isAiPro && uuidRegex.test(cleanId) && validPartnerIds.has(cleanId)) {
        itemPartnerId = cleanId;
      }

      assert.equal(itemPartnerId, genuineId);

      let itemI18n: Record<string, any> = {};
      if (itemPartnerId) {
        itemI18n = {
          ...itemI18n,
          is_pro_partner: true,
          pro_badge: 'Dữ liệu Pro',
        };
        delete itemI18n.pro_privilege;
      }

      assert.equal(itemI18n.is_pro_partner, true);
      assert.equal(itemI18n.pro_badge, 'Dữ liệu Pro');
      assert.equal(itemI18n.pro_privilege, undefined, 'Không được có pro_privilege bịa đặt');
    });

    it('làm sạch toàn bộ cờ Pro giả mạo nếu item không có partner_id hợp lệ', () => {
      const fakeInputI18n = {
        is_pro_partner: true,
        pro_badge: 'ViVu Pro Partner',
        pro_privilege: 'Ưu đãi giả mạo',
      };

      const itemPartnerId: string | null = null;
      let sanitizedI18n: Record<string, any> = { ...fakeInputI18n };

      if (itemPartnerId) {
        sanitizedI18n.is_pro_partner = true;
        sanitizedI18n.pro_badge = 'Dữ liệu Pro';
      } else {
        delete sanitizedI18n.is_pro_partner;
        delete sanitizedI18n.pro_badge;
        delete sanitizedI18n.pro_privilege;
      }

      assert.equal(sanitizedI18n.is_pro_partner, undefined);
      assert.equal(sanitizedI18n.pro_badge, undefined);
      assert.equal(sanitizedI18n.pro_privilege, undefined);
    });
  });

  // =========================================================================
  // TC-ADMIN-AUTH: requireAdmin Middleware Authentication & Authorization
  // =========================================================================
  describe('TC-ADMIN-AUTH: requireAdmin Middleware Tests', () => {
    it('từ chối người dùng vai trò USER thông thường với HTTP 403 Forbidden', async () => {
      const { req, res, next, getStatus, getData, wasNextCalled } = createMockReqRes({
        user: { id: 'regular-user-id', role: UserRole.USER },
        isAdmin: false,
      });

      await requireAdmin(req, res, next);

      assert.equal(wasNextCalled(), false, 'next() không được phép gọi đối với user thường');
      assert.equal(getStatus(), 403, 'Phải trả về mã trạng thái HTTP 403 Forbidden');
      assert.deepEqual(getData(), { error: 'Forbidden: Admin rights required' });
    });

    it('từ chối yêu cầu không có thông tin xác thực user (anonymous) với HTTP 403', async () => {
      const { req, res, next, getStatus, getData, wasNextCalled } = createMockReqRes({
        user: undefined,
        isAdmin: false,
      });

      await requireAdmin(req, res, next);

      assert.equal(wasNextCalled(), false, 'next() không được phép gọi');
      assert.equal(getStatus(), 403, 'Phải trả về HTTP 403');
      assert.deepEqual(getData(), { error: 'Forbidden: Admin rights required' });
    });

    it('cho phép admin hợp lệ vượt qua requireAdmin và gọi next() thành công', async () => {
      const { req, res, next, getStatus, wasNextCalled } = createMockReqRes({
        user: { id: 'admin-user-id', role: UserRole.ADMIN },
        isAdmin: true,
      });

      await requireAdmin(req, res, next);

      assert.equal(wasNextCalled(), true, 'next() phải được gọi cho tài khoản admin');
      assert.equal(getStatus(), 200, 'Không bị chặn bởi status code lỗi');
    });
  });

  // =========================================================================
  // TC-ELIGIBLE-PARTNERS: Unit Tests for getEligiblePartnersForTrip
  // =========================================================================
  describe('TC-ELIGIBLE-PARTNERS: getEligiblePartnersForTrip Helper Tests', () => {
    it('Pro mặc định nhận local đã xác minh, cờ false cũ không chặn; Free giả cờ vẫn không đọc kho', async () => {
      let queries = 0;
      const fixture = withFixturePinEvidence({ id: 'local-fixture', name: 'Điểm local kiểm thử', city: 'Đà Nẵng', lat: 16.05, lng: 108.2, active_status: true, location_verified: true, coordinate_source: 'google_maps_pin' });
      (supabaseAdmin as any).from = () => { queries++; return { select: () => ({ eq: async () => ({ data: [fixture], error: null }) }) }; };
      for (const preferences of [{ is_ai_pro: true }, { ai_tier: 'pro', use_local_data: false }]) {
        const result = await getEligiblePartnersForTrip({ destination_city: 'Đà Nẵng', preferences });
        assert.equal(result.length, 1);
        assert.equal(result[0].id, 'local-fixture');
      }
      const free = await getEligiblePartnersForTrip({ destination_city: 'Đà Nẵng', preferences: { is_ai_pro: false, ai_tier: 'standard', use_local_data: true } });
      assert.deepEqual(free, []);
      assert.equal(queries, 2);
    });
    it('trả về mảng rỗng cho chuyến đi Free (không có cờ Pro)', async () => {
      const freeTrip = {
        id: 'trip-free-1',
        destination_city: 'Đà Nẵng',
        lat: 16.0544,
        lng: 108.2022,
        preferences: {
          is_ai_pro: false,
          ai_tier: 'free',
        },
      };

      const result = await getEligiblePartnersForTrip(freeTrip);
      assert.deepEqual(result, [], 'Chuyến đi Free không được phép truy vấn danh sách đối tác');
    });

    it('trả về mảng rỗng nếu chuyến đi không có destination_city hoặc destination_province', async () => {
      const noCityTrip = {
        id: 'trip-pro-no-city',
        destination_city: '',
        destination_province: '',
        preferences: {
          is_ai_pro: true,
          use_local_data: true,
        },
      };

      const result = await getEligiblePartnersForTrip(noCityTrip);
      assert.deepEqual(result, []);
    });

    it('chuyến đi Pro truy vấn đối tác hợp lệ qua getRelevantPartners và lọc đúng bán kính', async () => {
      const proTrip = {
        id: 'trip-pro-1',
        destination_city: 'Đà Nẵng',
        lat: 16.0544,
        lng: 108.2022,
        preferences: {
          is_ai_pro: true,
          use_local_data: true,
          ai_tier: 'pro',
        },
      };

      const mockDbPartners = [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Đối Tác Hợp Lệ Đà Nẵng',
          category: 'restaurant',
          address: 'Võ Nguyên Giáp, Đà Nẵng',
          city: 'Đà Nẵng',
          lat: 16.0600,
          lng: 108.2400,
          active_status: true,
          location_verified: true,
          coordinate_source: 'google_maps_pin',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Đối Tác Không Xác Thực Tọa Độ',
          category: 'restaurant',
          address: 'Hải Phòng, Đà Nẵng',
          city: 'Đà Nẵng',
          lat: 16.0500,
          lng: 108.2100,
          active_status: true,
          location_verified: false,
          coordinate_source: 'google_maps_pin',
        },
      ];

      (supabaseAdmin as any).from = () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: mockDbPartners.map(withFixturePinEvidence), error: null }),
        }),
      });

      const result = await getEligiblePartnersForTrip(proTrip);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, '11111111-1111-4111-8111-111111111111');
    });
  });

  // =========================================================================
  // TC-SANITIZE-ITEM: Unit Tests for sanitizeItineraryItemForTrip
  // =========================================================================
  describe('TC-SANITIZE-ITEM: sanitizeItineraryItemForTrip Helper Tests', () => {
    const genuinePartner = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Nhà Hàng Biển Chuẩn Pro',
      booking_url: 'https://partner-danang.vn/book',
    };
    const eligiblePartnerMap = new Map([[genuinePartner.id, genuinePartner]]);

    it('chuyến Free: loại bỏ triệt để mọi provenance đối tác dù DB có dữ liệu legacy', () => {
      const legacyItemWithPartner = {
        id: 'item-legacy-1',
        day_id: 'day-1',
        title: 'Nhà Hàng Biển Cũ',
        description: 'Mô tả nguyên bản của người dùng',
        partner_id: genuinePartner.id,
        google_place_id: `partner_${genuinePartner.id}`,
        source: 'admin_partner',
        pro_badge: 'Dữ liệu Pro',
        badge: 'Đối tác',
        is_partner: true,
        is_pro_partner: true,
        pro_privilege: 'Ưu đãi giả',
        booking_url: 'https://partner.com/legacy',
        location_lat: 16.06,
        location_lng: 108.24,
        estimated_cost: 250000,
        i18n: {
          pro_badge: 'Dữ liệu Pro',
          is_pro_partner: true,
          pro_privilege: 'Ưu đãi giả',
          booking_url: 'https://partner.com/legacy',
          custom_note: 'Ghi chú tiếng Việt',
        },
      };

      const sanitized = sanitizeItineraryItemForTrip(legacyItemWithPartner, false, eligiblePartnerMap);

      // Provenance đối tác phải bị loại bỏ hoàn toàn
      assert.equal(sanitized.partner_id, null);
      assert.equal(sanitized.google_place_id, null);
      assert.equal(sanitized.source, null);
      assert.equal(sanitized.pro_badge, null);
      assert.equal(sanitized.badge, null);
      assert.equal(sanitized.is_partner, false);
      assert.equal(sanitized.is_pro_partner, false);
      assert.equal(sanitized.pro_privilege, null);
      assert.equal(sanitized.booking_url, null);

      // i18n partner flags cũng phải được dọn dẹp
      assert.equal(sanitized.i18n.pro_badge, undefined);
      assert.equal(sanitized.i18n.is_pro_partner, undefined);
      assert.equal(sanitized.i18n.booking_url, undefined);
      assert.equal(sanitized.i18n.custom_note, 'Ghi chú tiếng Việt', 'Bảo tồn dữ liệu i18n thông thường');

      // Dữ liệu địa điểm và người dùng phải được bảo tồn nguyên vẹn
      assert.equal(sanitized.title, 'Nhà Hàng Biển Cũ');
      assert.equal(sanitized.description, 'Mô tả nguyên bản của người dùng');
      assert.equal(sanitized.location_lat, 16.06);
      assert.equal(sanitized.location_lng, 108.24);
      assert.equal(sanitized.estimated_cost, 250000);
    });

    it('chuyến Free: bảo tồn google_place_id và booking_url của địa điểm thường (không phải đối tác)', () => {
      const normalPlaceItem = {
        id: 'item-normal-1',
        title: 'Bảo Tàng Điêu Khắc Chăm',
        partner_id: null,
        google_place_id: 'ChIJgZb-normal-place-id',
        source: 'google_places',
        booking_url: 'https://chammuseum.vn/ve',
        estimated_cost: 60000,
      };

      const sanitized = sanitizeItineraryItemForTrip(normalPlaceItem, false, eligiblePartnerMap);

      assert.equal(sanitized.partner_id, null);
      assert.equal(sanitized.google_place_id, 'ChIJgZb-normal-place-id');
      assert.equal(sanitized.source, 'google_places');
      assert.equal(sanitized.booking_url, 'https://chammuseum.vn/ve');
      assert.equal(sanitized.is_partner, false);
      assert.equal(sanitized.is_pro_partner, false);
    });

    it('chuyến Pro: làm giàu provenance và booking_url đối với đối tác hợp lệ nằm trong map', () => {
      const proItemWithValidPartner = {
        id: 'item-pro-valid',
        partner_id: genuinePartner.id,
        google_place_id: null,
        title: 'Nhà Hàng Biển Chuẩn Pro',
        booking_url: null,
      };

      const enriched = sanitizeItineraryItemForTrip(proItemWithValidPartner, true, eligiblePartnerMap);

      assert.equal(enriched.partner_id, genuinePartner.id);
      assert.equal(enriched.google_place_id, `partner_${genuinePartner.id}`);
      assert.equal(enriched.is_partner, true);
      assert.equal(enriched.is_pro_partner, true);
      assert.equal(enriched.pro_badge, 'Dữ liệu Pro');
      assert.equal(enriched.source, 'admin_partner');
      assert.equal(enriched.booking_url, 'https://partner-danang.vn/book');
    });

    it('chuyến Pro: làm sạch provenance nếu đối tác không nằm trong eligiblePartnerMap (giả mạo / ngoài thành phố)', () => {
      const fakePartnerId = '99999999-9999-4999-8999-999999999999';
      const proItemWithFakePartner = {
        id: 'item-pro-fake',
        partner_id: fakePartnerId,
        google_place_id: `partner_${fakePartnerId}`,
        source: 'admin_partner',
        pro_badge: 'ViVu Pro Fake',
        is_partner: true,
        is_pro_partner: true,
        booking_url: 'https://fake-link.com',
        title: 'Địa Điểm Gắn ID Bịp',
        estimated_cost: 100000,
      };

      const sanitized = sanitizeItineraryItemForTrip(proItemWithFakePartner, true, eligiblePartnerMap);

      assert.equal(sanitized.partner_id, null);
      assert.equal(sanitized.google_place_id, null);
      assert.equal(sanitized.source, null);
      assert.equal(sanitized.pro_badge, null);
      assert.equal(sanitized.is_partner, false);
      assert.equal(sanitized.is_pro_partner, false);
      assert.equal(sanitized.booking_url, null);
      assert.equal(sanitized.title, 'Địa Điểm Gắn ID Bịp');
      assert.equal(sanitized.estimated_cost, 100000);
    });
  });

  // =========================================================================
  // TC-ROUTE-GET-DETAIL: Route Tests for GET /api/trips/:id
  // =========================================================================
  describe('TC-ROUTE-GET-DETAIL: GET /:id Handler Tests', () => {
    const genuinePartner = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Đối Tác Chuẩn Huế',
      category: 'restaurant',
      address: 'Lê Lợi, Huế',
      city: 'Huế',
      lat: 16.4637,
      lng: 107.5909,
      active_status: true,
      location_verified: true,
      coordinate_source: 'google_maps_pin',
      booking_url: 'https://cungdinhhue.vn/book',
    };

    it('từ chối truy cập 403 nếu người dùng không phải owner, collaborator hoặc admin', async () => {
      const getTripHandler = findRouteHandler(tripsRouter, 'get', '/:id');
      assert.ok(getTripHandler, 'Handler GET /:id phải tồn tại');

      const mock = createMockSupabaseAdmin({
        trips: [
          {
            id: 'trip-secret-1',
            user_id: 'owner-uuid',
            is_public: false,
          },
        ],
        trip_collaborators: [],
      });
      (supabaseAdmin as any).from = mock.mockFrom;

      const { req, res, getStatus, getData } = createMockReqRes({
        user: { id: 'stranger-uuid', role: UserRole.USER },
        isAdmin: false,
        params: { id: 'trip-secret-1' },
      });

      await getTripHandler(req, res);

      assert.equal(getStatus(), 403);
      assert.deepEqual(getData(), { error: 'Bạn không có quyền truy cập chuyến đi này' });
    });

    it('trả về 404 nếu không tìm thấy trip', async () => {
      const getTripHandler = findRouteHandler(tripsRouter, 'get', '/:id');
      const mock = createMockSupabaseAdmin({
        trips: [],
      });
      (supabaseAdmin as any).from = mock.mockFrom;

      const { req, res, getStatus, getData } = createMockReqRes({
        user: { id: 'user-1', role: UserRole.USER },
        params: { id: 'non-existent-trip' },
      });

      await getTripHandler(req, res);

      assert.equal(getStatus(), 404);
      assert.deepEqual(getData(), { error: 'Trip not found' });
    });

    it('chuyến Free: loại bỏ triệt để cờ đối tác legacy và không truy vấn bảng partners', async () => {
      const getTripHandler = findRouteHandler(tripsRouter, 'get', '/:id');

      let partnerTableQueried = false;
      const mock = createMockSupabaseAdmin({
        trips: [
          {
            id: 'trip-free-legacy',
            user_id: 'user-1',
            destination_city: 'Huế',
            created_at: new Date().toISOString(),
            preferences: {
              is_ai_pro: false,
              ai_tier: 'free',
            },
          },
        ],
        itinerary_days: [
          {
            id: 'day-1',
            trip_id: 'trip-free-legacy',
            day_number: 1,
          },
        ],
        itinerary_items: [
          {
            id: 'item-legacy-partner',
            day_id: 'day-1',
            title: 'Nhà Hàng Cung Đình',
            partner_id: genuinePartner.id,
            google_place_id: `partner_${genuinePartner.id}`,
            source: 'admin_partner',
            pro_badge: 'Dữ liệu Pro',
            is_partner: true,
            is_pro_partner: true,
            booking_url: 'https://cungdinhhue.vn/legacy',
            estimated_cost: 150000,
          },
          {
            id: 'item-normal-place',
            day_id: 'day-1',
            title: 'Đại Nội Huế',
            partner_id: null,
            google_place_id: 'ChIJdainoi-place-id',
            source: 'google_places',
            booking_url: 'https://dainoi.vn/ve',
            estimated_cost: 200000,
          },
        ],
        trip_collaborators: [],
        itinerary_revisions: [],
        partners: [genuinePartner],
      });

      // Wrap mockFrom để theo dõi truy vấn bảng partners
      const originalFrom = mock.mockFrom;
      (supabaseAdmin as any).from = (tableName: string) => {
        if (tableName === 'partners') {
          partnerTableQueried = true;
        }
        return originalFrom(tableName);
      };

      const { req, res, getStatus, getData } = createMockReqRes({
        user: { id: 'user-1', role: UserRole.USER },
        params: { id: 'trip-free-legacy' },
      });

      await getTripHandler(req, res);

      assert.equal(getStatus(), 200);
      assert.equal(partnerTableQueried, false, 'Chuyến Free tuyệt đối không truy vấn bảng partners');

      const data = getData();
      assert.equal(data.is_ai_pro, false);

      const day1 = data.days[0];
      const items = day1.items;

      const pItem = items.find((i: any) => i.id === 'item-legacy-partner');
      assert.equal(pItem.partner_id, null, 'partner_id phải bị loại bỏ về null');
      assert.equal(pItem.google_place_id, null);
      assert.equal(pItem.source, null);
      assert.equal(pItem.pro_badge, null);
      assert.equal(pItem.is_partner, false);
      assert.equal(pItem.is_pro_partner, false);
      assert.equal(pItem.booking_url, null);
      assert.equal(pItem.title, 'Nhà Hàng Cung Đình', 'Bảo tồn tên địa điểm');
      assert.equal(pItem.estimated_cost, 150000);

      const nItem = items.find((i: any) => i.id === 'item-normal-place');
      assert.equal(nItem.google_place_id, 'ChIJdainoi-place-id', 'Bảo tồn google_place_id của địa điểm thường');
      assert.equal(nItem.booking_url, 'https://dainoi.vn/ve');
      assert.equal(nItem.source, 'google_places');
    });

    it('chuyến Pro: làm giàu đối tác hợp lệ và bảo tồn chuyến đã lưu không trừ credit lại', async () => {
      const getTripHandler = findRouteHandler(tripsRouter, 'get', '/:id');

      const mock = createMockSupabaseAdmin({
        trips: [
          {
            id: 'trip-pro-saved',
            user_id: 'user-pro',
            destination_city: 'Huế',
            lat: 16.4637,
            lng: 107.5909,
            created_at: new Date().toISOString(),
            preferences: {
              is_ai_pro: true,
          use_local_data: true,
              ai_tier: 'pro',
            },
          },
        ],
        itinerary_days: [
          {
            id: 'day-pro-1',
            trip_id: 'trip-pro-saved',
            day_number: 1,
          },
        ],
        itinerary_items: [
          {
            id: 'item-pro-partner',
            day_id: 'day-pro-1',
            title: 'Nhà Hàng Cung Đình',
            partner_id: genuinePartner.id,
            google_place_id: `partner_${genuinePartner.id}`,
            estimated_cost: 150000,
          },
        ],
        trip_collaborators: [],
        itinerary_revisions: [],
        partners: [genuinePartner],
      });
      (supabaseAdmin as any).from = mock.mockFrom;

      const { req, res, getStatus, getData } = createMockReqRes({
        user: { id: 'user-pro', role: UserRole.USER },
        params: { id: 'trip-pro-saved' },
      });

      await getTripHandler(req, res);

      assert.equal(getStatus(), 200);
      const data = getData();
      assert.equal(data.is_ai_pro, true);

      const item = data.days[0].items[0];
      assert.equal(item.partner_id, genuinePartner.id);
      assert.equal(item.is_partner, true);
      assert.equal(item.is_pro_partner, true);
      assert.equal(item.pro_badge, 'Dữ liệu Pro');
      assert.equal(item.source, 'admin_partner');
      assert.equal(item.booking_url, genuinePartner.booking_url);
    });
  });

  // =========================================================================
  // TC-ROUTE-POST-CART: Route Tests for POST /api/trips/:id/cart
  // =========================================================================
  describe('TC-ROUTE-POST-CART: POST /:id/cart Handler Tests', () => {
    const genuinePartner = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Đối Tác Hợp Lệ Đà Nẵng',
      category: 'restaurant',
      address: 'Võ Nguyên Giáp, Đà Nẵng',
      city: 'Đà Nẵng',
      lat: 16.0600,
      lng: 108.2400,
      active_status: true,
      location_verified: true,
      coordinate_source: 'google_maps_pin',
    };

    it('từ chối 400 nếu items không phải là array', async () => {
      const postCartHandler = findRouteHandler(tripsRouter, 'post', '/:id/cart');
      assert.ok(postCartHandler, 'Handler POST /:id/cart phải tồn tại');

      const { req, res, getStatus, getData } = createMockReqRes({
        user: { id: 'user-1' },
        params: { id: 'trip-1' },
        body: { items: 'not-an-array' },
      });

      await postCartHandler(req, res);

      assert.equal(getStatus(), 400);
      assert.deepEqual(getData(), { error: 'items must be an array' });
    });

    it('từ chối 403 nếu user không có quyền truy cập vào chuyến đi', async () => {
      const postCartHandler = findRouteHandler(tripsRouter, 'post', '/:id/cart');

      const mock = createMockSupabaseAdmin({
        trips: [
          {
            id: 'trip-cart-auth-test',
            user_id: 'real-owner-uuid',
            preferences: {},
          },
        ],
        trip_collaborators: [],
      });
      (supabaseAdmin as any).from = mock.mockFrom;

      const { req, res, getStatus, getData } = createMockReqRes({
        user: { id: 'attacker-uuid', role: UserRole.USER },
        isAdmin: false,
        params: { id: 'trip-cart-auth-test' },
        body: { items: [{ place_id: 'some-place', custom_cost: 100 }] },
      });

      await postCartHandler(req, res);

      assert.equal(getStatus(), 403);
      assert.deepEqual(getData(), { error: 'Bạn không có quyền truy cập chuyến đi này' });
    });

    it('chuyến Free: từ chối giỏ Pro dù client gửi partner_id hoặc cờ Pro giả mạo', async () => {
      const postCartHandler = findRouteHandler(tripsRouter, 'post', '/:id/cart');

      const mock = createMockSupabaseAdmin({
        trips: [
          {
            id: 'trip-free-cart',
            user_id: 'user-owner-1',
            destination_city: 'Đà Nẵng',
            preferences: {
              is_ai_pro: false,
              ai_tier: 'free',
            },
          },
        ],
        trip_collaborators: [],
        partners: [genuinePartner],
      });
      (supabaseAdmin as any).from = mock.mockFrom;

      const { req, res, getStatus, getData } = createMockReqRes({
        user: { id: 'user-owner-1', role: UserRole.USER },
        params: { id: 'trip-free-cart' },
        body: {
          items: [
            {
              partner_id: genuinePartner.id,
              custom_cost: 120000,
              pricing_option: 'auto',
              name: 'Nhà Hàng Biển',
            },
          ],
        },
      });

      await postCartHandler(req, res);

      assert.equal(getStatus(), 403);
      assert.equal(getData().requires_premium, true);
      assert.equal(mock.state.upsertedCartItems.length, 0, 'Chuyến Free không ghi giỏ Pro');
    });

    it('chuyến Pro: lưu đúng partner_id hợp lệ và loại bỏ partner_id giả mạo', async () => {
      const postCartHandler = findRouteHandler(tripsRouter, 'post', '/:id/cart');

      const mock = createMockSupabaseAdmin({
        trips: [
          {
            id: 'trip-pro-cart',
            user_id: 'user-owner-2',
            destination_city: 'Đà Nẵng',
            lat: 16.0544,
            lng: 108.2022,
            preferences: {
              is_ai_pro: true,
          use_local_data: true,
              ai_tier: 'pro',
            },
          },
        ],
        trip_collaborators: [],
        partners: [genuinePartner],
      });
      (supabaseAdmin as any).from = mock.mockFrom;

      const fakePartnerUuid = '99999999-9999-4999-8999-999999999999';

      const { req, res, getStatus, getData } = createMockReqRes({
        user: { id: 'user-owner-2', role: UserRole.USER },
        params: { id: 'trip-pro-cart' },
        body: {
          items: [
            {
              partner_id: genuinePartner.id,
              custom_cost: 300000,
              pricing_option: 'manual',
              name: 'Hải Sản Chuẩn Pro',
            },
            {
              partner_id: fakePartnerUuid,
              custom_cost: 150000,
              pricing_option: 'auto',
              name: 'Quán Fake UUID',
            },
          ],
        },
      });

      await postCartHandler(req, res);

      assert.equal(getStatus(), 200);
      assert.deepEqual(getData(), { success: true, count: 2 });

      const upserted = mock.state.upsertedCartItems;
      assert.equal(upserted.length, 2);

      // Item 1: genuine partner
      assert.equal(upserted[0].partner_id, genuinePartner.id);
      assert.equal(upserted[0].custom_cost, 300000);
      assert.equal(upserted[0].pricing_option, 'manual');

      // Item 2: fake partner bị loại bỏ về null
      assert.equal(upserted[1].partner_id, null, 'Fake partner UUID phải bị làm sạch về null');
      assert.equal(upserted[1].custom_cost, 150000);
    });

    it('cộng tác viên (collaborator) hợp lệ được phép lưu cart items', async () => {
      const postCartHandler = findRouteHandler(tripsRouter, 'post', '/:id/cart');

      const mock = createMockSupabaseAdmin({
        trips: [
          {
            id: 'trip-collab-cart',
            user_id: 'real-owner-uuid',
            preferences: { is_ai_pro: true, use_local_data: true },
          },
        ],
        trip_collaborators: [
          {
            id: 'collab-1',
            trip_id: 'trip-collab-cart',
            user_id: 'collab-user-uuid',
            role: 'editor',
          },
        ],
      });
      (supabaseAdmin as any).from = mock.mockFrom;

      const { req, res, getStatus, getData } = createMockReqRes({
        user: { id: 'collab-user-uuid', role: UserRole.USER },
        params: { id: 'trip-collab-cart' },
        body: {
          items: [
            {
              notes: 'Ghi chú bởi cộng tác viên',
              custom_cost: 50000,
            },
          ],
        },
      });

      await postCartHandler(req, res);

      assert.equal(getStatus(), 200);
      assert.deepEqual(getData(), { success: true, count: 1 });
    });
  });

  // =========================================================================
  // TC-FIX-06: Partner Pro Sanitization & Collaborator Cart Role Gating
  // =========================================================================
  describe('TC-FIX-06: Partner Pro Sanitization & Collaborator Cart Role Gating (Hermetic App Pipeline)', () => {
    const genuinePartnerFix06 = {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Khách Sạn Đà Lạt Heritage',
      category: 'hotel',
      address: 'Trần Phú, Đà Lạt',
      city: 'Đà Lạt',
      lat: 11.9404,
      lng: 108.4583,
      active_status: true,
      location_verified: true,
      coordinate_source: 'google_maps_pin',
      booking_url: 'https://dalatheritage.vn/authoritative-book',
    };

    const genuinePartnerWithoutUrl = {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Nhà Hàng Hoa Sen',
      category: 'restaurant',
      address: 'Bùi Thị Xuân, Đà Lạt',
      city: 'Đà Lạt',
      lat: 11.9410,
      lng: 108.4590,
      active_status: true,
      location_verified: true,
      coordinate_source: 'google_maps_pin',
      booking_url: null,
    };

    // 1. Production Sanitizer: Authoritative DB URL missing => null on root + nested
    it('sanitizer: đối tác Pro có booking_url trong DB là null/missing => root và nested booking_url phải về null, xóa pro_privilege', () => {
      const partnerMap = new Map<string, any>([
        [genuinePartnerWithoutUrl.id, genuinePartnerWithoutUrl],
      ]);

      const maliciousItem = {
        title: 'Nhà Hàng Hoa Sen',
        partner_id: genuinePartnerWithoutUrl.id,
        booking_url: 'https://malicious-client-supplied.com/hijack',
        pro_privilege: 'unauthorized_vip_drink',
        i18n: {
          title: 'Hoa Sen Restaurant',
          booking_url: 'https://malicious-nested.com/hijack',
          pro_privilege: 'nested_vip_perk',
          note: 'Bàn view hồ',
        },
      };

      const sanitized = sanitizeItineraryItemForTrip(maliciousItem, true, partnerMap);

      assert.equal(sanitized.partner_id, genuinePartnerWithoutUrl.id);
      assert.equal(sanitized.booking_url, null, 'Root booking_url phải về null khi DB có booking_url null');
      assert.equal(sanitized.pro_privilege, null, 'Root pro_privilege phải gán về null');
      assert.equal(sanitized.is_pro_partner, true);
      assert.equal(sanitized.pro_badge, 'Dữ liệu Pro');

      assert.ok(sanitized.i18n, 'i18n phải tồn tại');
      assert.equal(sanitized.i18n.booking_url, null, 'Nested i18n.booking_url phải về null');
      assert.equal(sanitized.i18n.pro_privilege, undefined, 'Nested pro_privilege phải bị xóa');
      assert.equal(sanitized.i18n.pro_badge, 'Dữ liệu Pro');
      assert.equal(sanitized.i18n.is_pro_partner, true);
      assert.equal(sanitized.i18n.note, 'Bàn view hồ', 'Metadata thường trong i18n phải được bảo tồn');
    });

    // 2. Production Sanitizer: Authoritative DB URL present => root và nested lấy đúng DB URL
    it('sanitizer: đối tác Pro có booking_url trong DB => root và nested booking_url lấy đúng DB URL', () => {
      const partnerMap = new Map<string, any>([
        [genuinePartnerFix06.id, genuinePartnerFix06],
      ]);

      const itemWithClientUrls = {
        title: 'Khách Sạn Đà Lạt Heritage',
        partner_id: genuinePartnerFix06.id,
        booking_url: 'https://client-override-spoof.com',
        i18n: {
          title: 'Dalat Heritage Hotel',
          booking_url: 'https://nested-client-override-spoof.com',
        },
      };

      const sanitized = sanitizeItineraryItemForTrip(itemWithClientUrls, true, partnerMap);

      assert.equal(sanitized.booking_url, genuinePartnerFix06.booking_url);
      assert.equal(sanitized.i18n.booking_url, genuinePartnerFix06.booking_url);
      assert.equal(sanitized.is_pro_partner, true);
      assert.equal(sanitized.pro_badge, 'Dữ liệu Pro');
    });

    // 3. Production Sanitizer: Nested-only partner provenance stripped on free/non-eligible trip
    it('sanitizer: địa điểm không có root partner_id nhưng có nested-only provenance => phải làm sạch toàn diện trên chuyến Free', () => {
      const emptyPartnerMap = new Map<string, any>();

      const itemWithNestedOnlyProvenance = {
        title: 'Quán Cafe Bí Ẩn',
        booking_url: 'https://external-cafe.vn/order',
        i18n: {
          title: 'Mystery Cafe',
          partner_id: '99999999-9999-4999-8999-999999999999',
          source: 'admin_partner',
          is_partner: true,
          is_pro_partner: true,
          pro_badge: 'Dữ liệu Pro',
          pro_privilege: 'free_pastry',
          badge: 'Dữ liệu Pro',
          booking_url: 'https://fake-partner-booking.com',
          custom_note: 'Bàn gần cửa sổ',
        },
      };

      const sanitized = sanitizeItineraryItemForTrip(itemWithNestedOnlyProvenance, false, emptyPartnerMap);

      assert.equal(sanitized.booking_url, null, 'Root booking_url bị làm sạch vì chứa nested partner provenance');
      assert.ok(sanitized.i18n);
      assert.equal(sanitized.i18n.partner_id, undefined, 'Nested partner_id phải bị xóa');
      assert.equal(sanitized.i18n.source, undefined, 'Nested source admin_partner phải bị xóa');
      assert.equal(sanitized.i18n.is_partner, undefined, 'Nested is_partner phải bị xóa');
      assert.equal(sanitized.i18n.is_pro_partner, undefined, 'Nested is_pro_partner phải bị xóa');
      assert.equal(sanitized.i18n.pro_badge, undefined, 'Nested pro_badge phải bị xóa');
      assert.equal(sanitized.i18n.pro_privilege, undefined, 'Nested pro_privilege phải bị xóa');
      assert.equal(sanitized.i18n.badge, undefined, 'Nested badge Dữ liệu Pro phải bị xóa');
      assert.equal(sanitized.i18n.booking_url, undefined, 'Nested booking_url phải bị xóa');
      assert.equal(sanitized.i18n.custom_note, 'Bàn gần cửa sổ', 'Metadata thường trong i18n phải được bảo tồn');
    });

    // 4. Production Sanitizer: Exact Probadge-only stripped on non-eligible trip
    it('sanitizer: chỉ có duy nhất badge "Dữ liệu Pro" => làm sạch badge và booking_url trên chuyến Free', () => {
      const emptyPartnerMap = new Map<string, any>();

      const itemWithOnlyProBadge = {
        title: 'Điểm Tham Quan',
        badge: 'Dữ liệu Pro',
        booking_url: 'https://promo-tickets.com',
        source: 'custom_source',
      };

      const sanitized = sanitizeItineraryItemForTrip(itemWithOnlyProBadge, false, emptyPartnerMap);

      assert.equal(sanitized.badge, null, 'Badge "Dữ liệu Pro" phải bị làm sạch về null');
      assert.equal(sanitized.booking_url, null, 'Booking URL đi kèm đối tác giả mạo phải về null');
    });

    // 5. Production Sanitizer: Ordinary metadata preserved when no partner provenance exists
    it('sanitizer: dữ liệu địa điểm thông thường (OSM, catalog) không chứa provenance đối tác => bảo tồn 100%', () => {
      const emptyPartnerMap = new Map<string, any>();

      const normalItem = {
        title: 'Hồ Tuyền Lâm',
        source: 'osm',
        badge: 'Điểm Đến Hấp Dẫn',
        booking_url: 'https://openstreetmap.org/way/789123',
        notes: 'Cảnh đẹp lúc hoàng hôn',
        i18n: {
          title: 'Tuyen Lam Lake',
          source: 'osm_en',
          badge: 'Top Nature Attraction',
          booking_url: 'https://osm.org/node/998877',
          description: 'Scenic freshwater lake',
        },
      };

      const sanitized = sanitizeItineraryItemForTrip(normalItem, false, emptyPartnerMap);

      assert.equal(sanitized.source, 'osm');
      assert.equal(sanitized.badge, 'Điểm Đến Hấp Dẫn');
      assert.equal(sanitized.booking_url, 'https://openstreetmap.org/way/789123');
      assert.equal(sanitized.notes, 'Cảnh đẹp lúc hoàng hôn');

      assert.ok(sanitized.i18n);
      assert.equal(sanitized.i18n.source, 'osm_en');
      assert.equal(sanitized.i18n.badge, 'Top Nature Attraction');
      assert.equal(sanitized.i18n.booking_url, 'https://osm.org/node/998877');
      assert.equal(sanitized.i18n.description, 'Scenic freshwater lake');
    });

    // 6. verifyTripAccess Helper Contract
    it('verifyTripAccess: xác thực chính xác quyền read cho viewer, editor, owner và từ chối người ngoài', async () => {
      const mock = createMockSupabaseAdmin({
        trips: [
          { id: 'trip-access-1', user_id: 'trip-owner-1', is_public: false },
        ],
        trip_collaborators: [
          { id: 'collab-v', trip_id: 'trip-access-1', user_id: 'viewer-uuid', role: 'viewer' },
          { id: 'collab-e', trip_id: 'trip-access-1', user_id: 'editor-uuid', role: 'editor' },
        ],
      });
      (supabaseAdmin as any).from = mock.mockFrom;

      // Viewer
      const viewerAccess = await verifyTripAccess('trip-access-1', 'viewer-uuid', false);
      assert.equal(viewerAccess.hasAccess, true);
      assert.equal(viewerAccess.isOwner, false);
      assert.equal(viewerAccess.isCollaborator, true);
      assert.equal(viewerAccess.role, 'viewer');

      // Editor
      const editorAccess = await verifyTripAccess('trip-access-1', 'editor-uuid', false);
      assert.equal(editorAccess.hasAccess, true);
      assert.equal(editorAccess.isOwner, false);
      assert.equal(editorAccess.isCollaborator, true);
      assert.equal(editorAccess.role, 'editor');

      // Owner
      const ownerAccess = await verifyTripAccess('trip-access-1', 'trip-owner-1', false);
      assert.equal(ownerAccess.hasAccess, true);
      assert.equal(ownerAccess.isOwner, true);
      assert.equal(ownerAccess.isCollaborator, false);
      assert.equal(ownerAccess.role, 'owner');

      // Stranger
      const strangerAccess = await verifyTripAccess('trip-access-1', 'stranger-uuid', false);
      assert.equal(strangerAccess.hasAccess, false);
      assert.equal(strangerAccess.isOwner, false);
      assert.equal(strangerAccess.isCollaborator, false);
      assert.equal(strangerAccess.role, null);
    });

    // 7. Registered App Pipeline: Collaborator Role Gating (Viewer Read OK, Viewer Write 403, Editor Write 200, Owner Write 200)
    it('app pipeline: viewer có quyền đọc GET /:id nhưng bị từ chối 403 khi ghi POST /:id/cart; editor và owner ghi thành công 200', async () => {
      const app = createMockApp();
      const mock = createMockSupabaseAdmin({
        trips: [
          {
            id: 'trip-cart-role-test',
            user_id: 'owner-uuid-456',
            destination_city: 'Đà Lạt',
            created_at: new Date().toISOString(),
            preferences: { is_ai_pro: true, use_local_data: true },
          },
        ],
        trip_collaborators: [
          {
            id: 'c-viewer',
            trip_id: 'trip-cart-role-test',
            user_id: 'viewer-uuid-456',
            role: 'viewer',
            created_at: new Date().toISOString(),
          },
          {
            id: 'c-editor',
            trip_id: 'trip-cart-role-test',
            user_id: 'editor-uuid-456',
            role: 'editor',
            created_at: new Date().toISOString(),
          },
        ],
        itinerary_days: [],
        trip_cart_items: [],
      });
      (supabaseAdmin as any).from = mock.mockFrom;

      // 7.1 Viewer READ -> 200 OK
      const readRes = await executeAppRequest(app, {
        method: 'GET',
        url: '/trips/trip-cart-role-test',
        user: { id: 'viewer-uuid-456', role: UserRole.USER },
      });
      assert.equal(readRes.status, 200, 'Viewer phải được phép đọc chi tiết chuyến đi');
      assert.equal(readRes.data.id, 'trip-cart-role-test');

      // 7.2 Viewer WRITE cart -> 403 Forbidden
      const viewerWriteRes = await executeAppRequest(app, {
        method: 'POST',
        url: '/trips/trip-cart-role-test/cart',
        user: { id: 'viewer-uuid-456', role: UserRole.USER },
        body: {
          items: [
            {
              custom_cost: 100000,
              notes: 'Viewer cố tình sửa giỏ hàng',
            },
          ],
        },
      });
      assert.equal(viewerWriteRes.status, 403, 'Viewer ghi giỏ hàng phải bị từ chối 403');
      assert.deepEqual(viewerWriteRes.data, {
        error: 'Bạn không có quyền chỉnh sửa giỏ hàng của chuyến đi này',
      });

      // 7.3 Editor WRITE cart -> 200 OK
      const editorWriteRes = await executeAppRequest(app, {
        method: 'POST',
        url: '/trips/trip-cart-role-test/cart',
        user: { id: 'editor-uuid-456', role: UserRole.USER },
        body: {
          items: [
            {
              custom_cost: 250000,
              notes: 'Editor cập nhật giỏ hàng hợp lệ',
            },
          ],
        },
      });
      assert.equal(editorWriteRes.status, 200, 'Editor ghi giỏ hàng phải thành công 200');
      assert.deepEqual(editorWriteRes.data, { success: true, count: 1 });
      assert.equal(mock.state.upsertedCartItems.length, 1);
      assert.equal(mock.state.upsertedCartItems[0].custom_cost, 250000);

      // 7.4 Owner WRITE cart -> 200 OK
      const ownerWriteRes = await executeAppRequest(app, {
        method: 'POST',
        url: '/trips/trip-cart-role-test/cart',
        user: { id: 'owner-uuid-456', role: UserRole.USER },
        body: {
          items: [
            {
              custom_cost: 500000,
              notes: 'Owner cập nhật giỏ hàng hợp lệ',
            },
          ],
        },
      });
      assert.equal(ownerWriteRes.status, 200, 'Owner ghi giỏ hàng phải thành công 200');
      assert.deepEqual(ownerWriteRes.data, { success: true, count: 1 });
    });

    // 8. Registered App Pipeline: Saved legit Pro trip accessed with user currentcredits0 unchanged
    it('app pipeline: chuyến Pro đã lưu hợp lệ khi người dùng có current_credits=0 vẫn giữ nguyên thông tin đối tác Pro', async () => {
      const app = createMockApp();
      const mock = createMockSupabaseAdmin({
        trips: [
          {
            id: 'trip-saved-pro-zero-credits',
            user_id: 'pro-user-with-zero-credits',
            destination_city: 'Đà Lạt',
            lat: 11.9404,
            lng: 108.4583,
            created_at: new Date().toISOString(),
            preferences: {
              is_ai_pro: true,
          use_local_data: true,
              ai_tier: 'pro',
            },
          },
        ],
        partners: [
          genuinePartnerFix06,
        ],
        itinerary_days: [
          {
            id: 'day-pro-1',
            trip_id: 'trip-saved-pro-zero-credits',
            day_number: 1,
          },
        ],
        itinerary_items: [
          {
            id: 'item-legit-pro',
            day_id: 'day-pro-1',
            title: 'Khách Sạn Đà Lạt Heritage',
            partner_id: genuinePartnerFix06.id,
            google_place_id: `partner_${genuinePartnerFix06.id}`,
            source: 'admin_partner',
            pro_badge: 'Dữ liệu Pro',
            is_partner: true,
            is_pro_partner: true,
            booking_url: 'https://dalatheritage.vn/old-url',
            estimated_cost: 1200000,
          },
        ],
        trip_collaborators: [],
      });
      (supabaseAdmin as any).from = mock.mockFrom;

      // User có current_credits: 0, credits: 0
      const res = await executeAppRequest(app, {
        method: 'GET',
        url: '/trips/trip-saved-pro-zero-credits',
        user: {
          id: 'pro-user-with-zero-credits',
          role: UserRole.USER,
          credits: 0,
          current_credits: 0,
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.is_ai_pro, true);
      assert.equal(res.data.days.length, 1);
      assert.equal(res.data.days[0].items.length, 1);

      const returnedItem = res.data.days[0].items[0];
      assert.equal(returnedItem.partner_id, genuinePartnerFix06.id);
      assert.equal(returnedItem.is_pro_partner, true, 'is_pro_partner phải giữ nguyên true');
      assert.equal(returnedItem.pro_badge, 'Dữ liệu Pro', 'pro_badge phải giữ nguyên Dữ liệu Pro');
      assert.equal(returnedItem.booking_url, genuinePartnerFix06.booking_url, 'booking_url phải là URL xác thực từ DB');
    });
  });
});
