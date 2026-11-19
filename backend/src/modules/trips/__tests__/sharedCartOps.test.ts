// Kiểm thử thuần cho logic hợp nhất giỏ hàng nhóm — chặn toàn bộ mạng.
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-mock-role-key-test-isolation';
process.env.SUPABASE_ANON_KEY = 'synthetic-mock-anon-key-test-isolation';
process.env.NODE_ENV = 'test';
import dotenv from 'dotenv';
dotenv.config = () => ({ parsed: {} });
if (typeof (dotenv as any).configDotenv === 'function') (dotenv as any).configDotenv = () => ({ parsed: {} });
globalThis.fetch = (() => { throw new Error('FAILCLOSED_NETWORK_DENIED: shared cart tests are pure'); }) as any;

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applySharedCartOp,
  applyLegacySharedCartBody,
  validateSharedCartOp,
  getCartItemKeys,
  asObject,
} from '../trips.router';

const NOW = 1_800_000_000_000;
const a = { id: 'p_a', name: 'Chợ Hàn', updated_at: NOW - 1000, added_by: 'u1' };
const b = { id: 'p_b', name: 'Cầu Rồng', updated_at: NOW - 1000, added_by: 'u1' };

describe('applySharedCartOp', () => {
  it('add: thêm item mới, xoá tombstone theo key và gán metadata', () => {
    const { cart, tombstones } = applySharedCartOp([a], { p_b: NOW - 10, name_caurong: NOW - 10, other: 1 }, { type: 'add', item: { id: 'p_b', name: 'Cầu Rồng' } }, NOW, 'u2');
    assert.equal(cart.length, 2);
    assert.equal(cart[1].id, 'p_b');
    assert.equal(cart[1].added_by, 'u2');
    assert.equal(cart[1].updated_at, NOW);
    assert.equal(tombstones.p_b, undefined);
    assert.equal(tombstones.name_caurong, undefined);
    assert.equal(tombstones.other, 1);
  });

  it('add: upsert item trùng key (theo tên) thay vì nhân đôi, giữ vị trí và người thêm cũ', () => {
    const { cart } = applySharedCartOp([a, b], {}, { type: 'add', item: { id: 'p_a_dup', name: 'chợ hàn', note: 'x' } }, NOW, 'u2');
    assert.equal(cart.length, 2);
    assert.equal(cart[0].id, 'p_a_dup');
    assert.equal(cart[0].note, 'x');
    assert.equal(cart[0].added_by, 'u1');
    assert.equal(cart[1].id, 'p_b');
  });

  it('add: không làm thay đổi mảng/tombstones đầu vào', () => {
    const cartIn = [a];
    const tsIn = { p_b: 5 };
    applySharedCartOp(cartIn, tsIn, { type: 'add', item: b }, NOW);
    assert.equal(cartIn.length, 1);
    assert.deepEqual(tsIn, { p_b: 5 });
  });

  it('remove: đặt tombstone cho key và mọi key của item bị xoá', () => {
    const { cart, tombstones } = applySharedCartOp([a, b], {}, { type: 'remove', keys: ['p_a'] }, NOW);
    assert.deepEqual(cart.map(i => i.id), ['p_b']);
    assert.equal(tombstones.p_a, NOW);
    assert.equal(tombstones.name_chohan, NOW);
  });

  it('remove: xoá theo key phụ (tên chuẩn hoá) vẫn khớp item', () => {
    const { cart } = applySharedCartOp([a, b], {}, { type: 'remove', keys: ['name_caurong'] }, NOW);
    assert.deepEqual(cart.map(i => i.id), ['p_a']);
  });

  it('clear: làm trống giỏ và tombstone toàn bộ key hiện có', () => {
    const { cart, tombstones } = applySharedCartOp([a, b], {}, { type: 'clear' }, NOW);
    assert.equal(cart.length, 0);
    for (const k of [...getCartItemKeys(a), ...getCartItemKeys(b)]) assert.equal(tombstones[k], NOW);
  });

  it('update_items: merge field vào item tồn tại, bỏ qua item không tồn tại (không hồi sinh)', () => {
    const { cart, tombstones } = applySharedCartOp(
      [a, b],
      { p_c: NOW - 5 },
      { type: 'update_items', items: [{ id: 'p_b', day: 2, custom_cost: 50000 }, { id: 'p_c', name: 'Đã xoá', day: 1 }] },
      NOW
    );
    assert.equal(cart.length, 2);
    assert.equal(cart[1].day, 2);
    assert.equal(cart[1].custom_cost, 50000);
    assert.equal(cart[1].name, 'Cầu Rồng');
    assert.equal(cart[1].updated_at, NOW);
    assert.equal(cart[0].updated_at, a.updated_at);
    assert.equal(tombstones.p_c, NOW - 5);
  });

  it('chuỗi thao tác đồng thời từ 2 thành viên áp tuần tự không mất cập nhật', () => {
    // Thành viên 1 thêm A, thành viên 2 thêm B (cả hai bắt đầu từ giỏ rỗng) — áp trên trạng thái DB mới nhất
    let state = applySharedCartOp([], {}, { type: 'add', item: a }, NOW, 'u1');
    state = applySharedCartOp(state.cart, state.tombstones, { type: 'add', item: b }, NOW + 1, 'u2');
    assert.deepEqual(state.cart.map(i => i.id), ['p_a', 'p_b']);
    // Thành viên 1 xoá A, sau đó thành viên 2 sửa lịch A (client cũ) -> A không được hồi sinh
    state = applySharedCartOp(state.cart, state.tombstones, { type: 'remove', keys: ['p_a'] }, NOW + 2);
    state = applySharedCartOp(state.cart, state.tombstones, { type: 'update_items', items: [{ id: 'p_a', day: 3 }] }, NOW + 3);
    assert.deepEqual(state.cart.map(i => i.id), ['p_b']);
    // Thêm lại A một cách tường minh thì được phép
    state = applySharedCartOp(state.cart, state.tombstones, { type: 'add', item: { id: 'p_a', name: 'Chợ Hàn' } }, NOW + 4);
    assert.deepEqual(state.cart.map(i => i.id), ['p_b', 'p_a']);
    assert.equal(state.tombstones.p_a, undefined);
  });
});

describe('validateSharedCartOp', () => {
  it('chấp nhận op hợp lệ và từ chối op sai', () => {
    assert.equal(validateSharedCartOp({ type: 'add', item: { id: 'x' } }), null);
    assert.equal(validateSharedCartOp({ type: 'remove', keys: ['x'] }), null);
    assert.equal(validateSharedCartOp({ type: 'clear' }), null);
    assert.equal(validateSharedCartOp({ type: 'update_items', items: [] }), null);
    assert.ok(validateSharedCartOp({ type: 'add' }));
    assert.ok(validateSharedCartOp({ type: 'remove', keys: [] }));
    assert.ok(validateSharedCartOp({ type: 'nope' }));
    assert.ok(validateSharedCartOp(null));
    assert.ok(validateSharedCartOp([]));
  });
});

describe('applyLegacySharedCartBody (giữ hành vi cũ)', () => {
  it('cả giỏ gửi lên được hợp nhất với giỏ DB và tôn trọng tombstone', () => {
    const { cart } = applyLegacySharedCartBody([a, b], { p_b: NOW - 500 }, [a], {}, NOW, 'u1');
    assert.deepEqual(cart.map(i => i.id), ['p_a']);
  });

  it('action add xoá tombstone và thêm lại item', () => {
    const { cart, tombstones } = applyLegacySharedCartBody([a], { p_b: NOW - 1 }, [b], { action: 'add' }, NOW, 'u1');
    assert.deepEqual(cart.map(i => i.id).sort(), ['p_a', 'p_b']);
    assert.equal(tombstones.p_b, undefined);
  });

  it('deleted_place_ids và action clear', () => {
    const del = applyLegacySharedCartBody([a, b], {}, [a, b], { deleted_place_ids: ['p_a'] }, NOW, 'u1');
    assert.deepEqual(del.cart.map(i => i.id), ['p_b']);
    assert.equal(del.tombstones.p_a, NOW);
    const clr = applyLegacySharedCartBody([a, b], {}, [], { action: 'clear' }, NOW, 'u1');
    assert.equal(clr.cart.length, 0);
  });
});

describe('asObject', () => {
  it('chuẩn hoá preferences mảng/null về object', () => {
    assert.deepEqual(asObject([]), {});
    assert.deepEqual(asObject(null), {});
    assert.deepEqual(asObject('x'), {});
    assert.deepEqual(asObject({ a: 1 }), { a: 1 });
  });
});
