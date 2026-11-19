// Kiểm thử thuần cho mã tham gia VIVU — chặn toàn bộ mạng.
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-mock-role-key-test-isolation';
process.env.SUPABASE_ANON_KEY = 'synthetic-mock-anon-key-test-isolation';
process.env.NODE_ENV = 'test';
import dotenv from 'dotenv';
dotenv.config = () => ({ parsed: {} });
if (typeof (dotenv as any).configDotenv === 'function') (dotenv as any).configDotenv = () => ({ parsed: {} });
globalThis.fetch = (() => { throw new Error('FAILCLOSED_NETWORK_DENIED: invite code tests are pure'); }) as any;

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateInviteCode,
  isValidVivuCode,
  normalizeJoinInput,
  inviteValueMatches,
  pickActiveInviteCode,
  seedTripInvites,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
} from '../trips.router';

const NOW = new Date('2026-11-19T00:00:00.000Z');
const future = new Date(NOW.getTime() + 86400000).toISOString();
const past = new Date(NOW.getTime() - 86400000).toISOString();

describe('generateInviteCode', () => {
  it('đúng định dạng VIVU- + 6 ký tự thuộc bảng chữ cái không gây nhầm lẫn', () => {
    const re = new RegExp(`^VIVU-[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`);
    for (let i = 0; i < 500; i++) {
      const code = generateInviteCode();
      assert.match(code, re);
      assert.ok(isValidVivuCode(code));
    }
  });

  it('bảng chữ cái không chứa ký tự dễ nhầm và đủ lớn', () => {
    for (const ch of ['I', 'L', 'O', '0', '1']) assert.ok(!INVITE_CODE_ALPHABET.includes(ch));
    assert.ok(INVITE_CODE_ALPHABET.length ** INVITE_CODE_LENGTH > 100_000_000);
  });

  it('gần như không trùng trong 2000 lần sinh', () => {
    const set = new Set(Array.from({ length: 2000 }, () => generateInviteCode()));
    assert.ok(set.size >= 1995);
  });
});

describe('isValidVivuCode', () => {
  it('chấp nhận mã mới, mã cũ 3 chữ số, không phân biệt hoa thường', () => {
    assert.ok(isValidVivuCode('VIVU-AB23CD'));
    assert.ok(isValidVivuCode('vivu-ab23cd'));
    assert.ok(isValidVivuCode('VIVU-123'));
    assert.ok(isValidVivuCode('  VIVU-789  '));
  });

  it('từ chối chuỗi sai định dạng', () => {
    for (const bad of ['', 'VIVU-', 'VIVU-12', 'VIVU-AB_CD', 'ABC-123456', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', null, undefined, 123]) {
      assert.equal(isValidVivuCode(bad), false, String(bad));
    }
  });
});

describe('normalizeJoinInput', () => {
  it('in hoa mã VIVU và lấy đoạn cuối URL', () => {
    assert.deepEqual(normalizeJoinInput(' vivu-ab23cd '), { value: 'VIVU-AB23CD', isVivuCode: true });
    assert.deepEqual(normalizeJoinInput('https://x.app/join/vivu-ab23cd?x=1'), { value: 'VIVU-AB23CD', isVivuCode: true });
  });

  it('giữ nguyên token hex cũ (phân biệt hoa thường)', () => {
    assert.deepEqual(normalizeJoinInput('a1B2c3'), { value: 'a1B2c3', isVivuCode: false });
  });

  it('chuỗi rỗng → value rỗng', () => {
    assert.equal(normalizeJoinInput('   ').value, '');
    assert.equal(normalizeJoinInput(undefined).value, '');
  });
});

describe('inviteValueMatches', () => {
  it('mã VIVU khớp không phân biệt hoa thường, token hex khớp chính xác', () => {
    assert.ok(inviteValueMatches('vivu-ab23cd', 'VIVU-AB23CD'));
    assert.ok(inviteValueMatches('abcDEF', 'abcDEF'));
    assert.equal(inviteValueMatches('abcDEF', 'ABCDEF'), false);
    assert.equal(inviteValueMatches(undefined, 'VIVU-AB23CD'), false);
    assert.equal(inviteValueMatches('VIVU-AB23CD', ''), false);
  });
});

describe('pickActiveInviteCode / seedTripInvites', () => {
  it('ưu tiên preferences.invite_code còn hạn', () => {
    const prefs = { invite_code: 'vivu-aaaaaa', pending_invites: [{ invite_token: 'VIVU-AAAAAA', invite_code: 'VIVU-AAAAAA', expires_at: future }] };
    assert.equal(pickActiveInviteCode(prefs, NOW), 'VIVU-AAAAAA');
  });

  it('bỏ qua mã đã hết hạn và token hex, rơi về lời mời còn hạn', () => {
    const prefs = {
      invite_code: 'VIVU-OLD123',
      pending_invites: [
        { invite_token: 'VIVU-OLD123', invite_code: 'VIVU-OLD123', expires_at: past },
        { invite_token: 'deadbeefdeadbeef', expires_at: future },
        { invite_token: 'VIVU-BBBBBB', expires_at: future },
      ],
    };
    assert.equal(pickActiveInviteCode(prefs, NOW), 'VIVU-BBBBBB');
    assert.equal(pickActiveInviteCode({ pending_invites: [{ invite_token: 'deadbeef', expires_at: future }] }, NOW), null);
    assert.equal(pickActiveInviteCode({}, NOW), null);
  });

  it('seedTripInvites tái dùng mã còn hạn, không thì thêm lời mời mới lên đầu', () => {
    const kept = seedTripInvites({ invite_code: 'VIVU-AAAAAA' }, 'u1', 'VIVU-NEW234', NOW);
    assert.equal(kept.invite_code, 'VIVU-AAAAAA');

    const legacy = [{ invite_token: 'deadbeef', expires_at: future }];
    const seeded = seedTripInvites({ pending_invites: legacy }, 'u1', 'VIVU-NEW234', NOW);
    assert.equal(seeded.invite_code, 'VIVU-NEW234');
    assert.equal(seeded.pending_invites.length, 2);
    assert.equal(seeded.pending_invites[0].invite_token, 'VIVU-NEW234');
    assert.equal(seeded.pending_invites[0].invited_by, 'u1');
    assert.equal(new Date(seeded.pending_invites[0].expires_at).getTime() - NOW.getTime(), 30 * 24 * 60 * 60 * 1000);

    // preferences dạng mảng (default '[]'::jsonb) không gây lỗi
    assert.equal(seedTripInvites([], 'u1', 'VIVU-NEW234', NOW).invite_code, 'VIVU-NEW234');
  });
});
