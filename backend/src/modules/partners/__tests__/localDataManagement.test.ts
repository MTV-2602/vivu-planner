process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service-role-local-data-test';
process.env.SUPABASE_ANON_KEY = 'synthetic-anon-local-data-test';
import dotenv from 'dotenv';
dotenv.config = () => ({ parsed: {} });
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { supabaseAdmin } from '../../../config/supabase';
import { requireAdmin } from '../../../middleware/requireAdmin';
import router from '../partners.router';
import { deleteSelectedLocations, validateSelectedLocationIds, verifySelectedLocations } from '../localDataManagement.service';

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];

describe('Quản lý địa điểm hàng loạt với cơ sở dữ liệu cô lập', () => {
  it('chỉ chấp nhận danh sách UUID rõ ràng, không rỗng hoặc vượt giới hạn', () => {
    for (const value of [undefined, [], ['all'], ['*'], { filter: 'all' }, [...Array(501)].map(() => ids[0])]) assert.throws(() => validateSelectedLocationIds(value, 500), /Chọn từ/);
    assert.throws(() => validateSelectedLocationIds([...Array(21)].map(() => ids[0]), 20), /1 đến 20/);
    assert.deepEqual(validateSelectedLocationIds([ids[0], ids[0], ids[1].toUpperCase()], 500), ids.slice(0, 2));
  });

  it('các endpoint mới nằm sau requireAdmin và người dùng thường bị từ chối', async () => {
    const layers = (router as any).stack;
    const guardIndex = layers.findIndex((layer: any) => layer.handle === requireAdmin);
    for (const route of ['/batch-delete', '/bulk-delete', '/batch-verify', '/verify-locations', '/:id/verify-location']) {
      const index = layers.findIndex((layer: any) => layer.route && (Array.isArray(layer.route.path) ? layer.route.path.includes(route) : layer.route.path === route));
      assert.ok(index > guardIndex && guardIndex >= 0, route);
    }
    let status = 200;
    let next = false;
    const res: any = { status: (code: number) => { status = code; return res; }, json: () => res };
    await requireAdmin({ user: { role: 'user' } } as any, res, () => { next = true; });
    assert.equal(status, 403);
    assert.equal(next, false);
  });

  it('xóa đúng ID được chọn, báo số thực tế và ID không còn tồn tại', async () => {
    const original = supabaseAdmin.from;
    let selected: string[] = [];
    try {
      (supabaseAdmin as any).from = (table: string) => {
        assert.equal(table, 'partners');
        return { delete: () => ({ in: (field: string, values: string[]) => {
          assert.equal(field, 'id'); selected = values;
          return { select: async () => ({ data: [{ id: ids[0] }], error: null }) };
        } }) };
      };
      const result = await deleteSelectedLocations([ids[0], ids[1], ids[0]]);
      assert.deepEqual(selected, ids.slice(0, 2));
      assert.deepEqual(result.deletedIds, [ids[0]]);
      assert.equal(result.deletedCount, 1);
      assert.deepEqual(result.errors.map(error => error.id), [ids[1]]);
    } finally { supabaseAdmin.from = original; }
  });

  it('pipeline API chặn 401/403 và body thiếu hoặc giả mạo trước khi truy vấn DB', async () => {
    const original = supabaseAdmin.from;
    let queries = 0;
    try {
      (supabaseAdmin as any).from = () => { queries++; throw new Error('Không được truy vấn'); };
      const request = (url: string, user: any, body: any): Promise<number> => new Promise((resolve, reject) => {
        const req: any = { method: 'POST', url, headers: {}, user, body };
        let status = 200;
        const res: any = { status: (code: number) => { status = code; return res; }, json: () => { resolve(status); return res; } };
        (router as any).handle(req, res, (err: any) => err ? reject(err) : resolve(404));
      });
      for (const url of ['/batch-delete', '/batch-verify']) {
        assert.equal(await request(url, undefined, { ids: [ids[0]] }), 401);
        assert.equal(await request(url, { role: 'user' }, { ids: [ids[0]] }), 403);
        for (const body of [null, undefined, {}, { ids: [] }, { ids: 'all' }, { ids: [ids[0], 'bad'] }, { ids: Array(501).fill(ids[0]) }]) {
          assert.equal(await request(url, { id: 'admin-fixture', role: 'admin' }, body), 400);
        }
      }
      assert.equal(queries, 0);
    } finally { supabaseAdmin.from = original; }
  });

  it('tự mở lại link cũ; pin thật được lưu nhưng điểm tắt không tự bật; viewport vẫn chờ', async () => {
    const originalFrom = supabaseAdmin.from;
    const originalGet = axios.get;
    const updates: Record<string, any> = {};
    let requests = 0;
    try {
      (axios as any).get = async (url: string) => {
        if (url.includes('/@')) return { status: 200, headers: {}, data: '', config: { url } };
        requests++;
        assert.equal(url, 'https://maps.app.goo.gl/testExistingSource');
        return { status: 302, headers: { location: 'https://www.google.com/maps/place/Fixture/data=!3d16.05!4d108.2' } };
      };
      (supabaseAdmin as any).from = () => ({
        select: () => ({ in: async () => ({ data: [
          { id: ids[0], active_status: false, i18n: { source_maps_url: 'https://maps.app.goo.gl/testExistingSource', original_price: '100.000–200.000' } },
          { id: ids[1], active_status: true, i18n: { source_maps_url: 'https://www.google.com/maps/@16.05,108.2,15z', resolved_lat: 99, pin_provenance: 'old' } }
        ], error: null }) }),
        update: (payload: any) => ({ eq: (_field: string, id: string) => {
          updates[id] = payload; return { select: () => ({ maybeSingle: async () => ({ data: { id }, error: null }) }) };
        } })
      });
      const result = await verifySelectedLocations(ids);
      assert.equal(requests, 1);
      assert.deepEqual(result.verifiedIds, [ids[0]]);
      assert.deepEqual(result.unresolvedIds, [ids[1]]);
      assert.equal(result.failed, 1);
      assert.equal(updates[ids[0]].active_status, false);
      assert.equal(updates[ids[0]].lat, 16.05);
      assert.equal(updates[ids[0]].lng, 108.2);
      assert.equal(updates[ids[0]].i18n.original_price, '100.000–200.000');
      assert.equal(updates[ids[1]].active_status, false);
      assert.equal(updates[ids[1]].lat, null);
      assert.equal(updates[ids[1]].lng, null);
      assert.equal(updates[ids[1]].i18n.resolved_lat, undefined);
    } finally { supabaseAdmin.from = originalFrom; axios.get = originalGet; }
  });

  it('lỗi lưu DB báo failed, không tuyên bố đã xác minh; thiếu nguồn được lưu tắt', async () => {
    const originalFrom = supabaseAdmin.from;
    let update: any;
    try {
      (supabaseAdmin as any).from = () => ({
        select: () => ({ in: async () => ({ data: [{ id: ids[0], active_status: true, i18n: {} }], error: null }) }),
        update: (payload: any) => { update = payload; return { eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'Lỗi DB kiểm thử' } }) }) }) }; }
      });
      const result = await verifySelectedLocations([ids[0]]);
      assert.equal(result.failed, 1);
      assert.deepEqual(result.verifiedIds, []);
      assert.deepEqual(result.unresolvedIds, []);
      assert.match(result.errors[0].error!, /Lỗi DB kiểm thử/);
      assert.equal(update.active_status, false);
      assert.equal(update.lat, null);
    } finally { supabaseAdmin.from = originalFrom; }
  });
});
