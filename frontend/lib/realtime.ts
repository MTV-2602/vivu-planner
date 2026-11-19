import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Realtime hub: mỗi topic chỉ có DUY NHẤT 1 Supabase channel dùng chung cho toàn app (ref-count).
 * - Tên topic cố định (không random) để mọi thành viên cùng vào 1 phòng.
 * - Handler lưu trong ref → đổi identity handler KHÔNG resubscribe, không stale closure.
 * - Gỡ channel trễ ~1.5s khi không còn ai dùng → sống sót qua remount / StrictMode.
 */

export const tripTopic = (id: string) => `trip:${id}`;
export const draftCartTopic = (id: string) => `draft-cart:${id}`;

export interface RealtimeChannelOptions {
  presenceKey?: string;
  presenceState?: Record<string, any>;
  onBroadcast?: Record<string, (payload: any) => void>;
  onPresence?: (members: any[]) => void;
  onResync?: () => void;
}

interface Sub {
  opts: { current: RealtimeChannelOptions };
  setStatus: (status: string) => void;
}

interface Entry {
  topic: string;
  channel: RealtimeChannel | null;
  presenceKey?: string;
  subs: Set<Sub>;
  status: string;
  subscribedOnce: boolean;
  createScheduled: boolean;
  teardownTimer: ReturnType<typeof setTimeout> | null;
  members: any[] | null;
  trackedState: Record<string, any> | null;
  lastTrackAt: number;
  trackTimer: ReturnType<typeof setTimeout> | null;
}

const entries = new Map<string, Entry>();
const TEARDOWN_DELAY_MS = 1500;
const TRACK_INTERVAL_MS = 1000;

function safeCall(fn: (() => void) | undefined) {
  if (!fn) return;
  try { fn(); } catch (e) { console.warn('[Realtime] handler error:', e); }
}

// Gom presence state về danh sách member, mỗi presence key (user) chỉ 1 phần tử
function flattenPresence(state: Record<string, any[]>): any[] {
  return Object.entries(state || {})
    .map(([key, metas]) => (Array.isArray(metas) && metas.length ? { ...metas[metas.length - 1], presence_key: key } : null))
    .filter(Boolean) as any[];
}

function dropChannel(ch: RealtimeChannel) {
  try { ch.unsubscribe(); } catch {}
  // teardown() xoá bindings → sự kiện close/leave trễ của channel cũ không thể gỡ nhầm channel mới cùng topic
  try { ch.teardown(); } catch {}
  // realtime-js chỉ gỡ channel khỏi client khi server ack leave; trong lúc chờ, supabase.channel(topic)
  // sẽ trả lại channel "đang rời" này (không thể add presence / không nhận sự kiện) → gỡ ngay khỏi client.
  try { (supabase.realtime as any)._remove?.(ch); } catch {}
  // teardown() cũng gỡ luôn callback onClose (vốn tự gỡ khỏi phoenix socket) → gỡ thủ công để không rò rỉ
  try {
    const phx = (ch as any).channelAdapter?.getChannel?.();
    if (phx) (supabase.realtime as any).socketAdapter?.getSocket?.()?.remove?.(phx);
  } catch {}
}

// Gom các lần track liên tiếp: tối đa 1 lần / TRACK_INTERVAL_MS, lần cuối (state mới nhất) gửi trễ
function trackOn(entry: Entry, state: Record<string, any>) {
  entry.trackedState = state;
  if (entry.trackTimer) return;
  const wait = entry.lastTrackAt + TRACK_INTERVAL_MS - Date.now();
  if (wait > 0) {
    entry.trackTimer = setTimeout(() => {
      entry.trackTimer = null;
      if (entry.trackedState) trackOn(entry, entry.trackedState);
    }, wait);
    return;
  }
  const ch = entry.channel;
  if (ch && entry.presenceKey && entry.status === 'SUBSCRIBED') {
    entry.lastTrackAt = Date.now();
    ch.track(state).catch(() => {});
  }
}

function createChannel(entry: Entry) {
  entry.createScheduled = false;
  if (entry.channel || entry.subs.size === 0 || entries.get(entry.topic) !== entry) return;

  // Dọn channel cũ cùng topic không thuộc hub (đang leaving / còn sót từ lần mount trước)
  supabase.getChannels()
    .filter((c) => c.topic === `realtime:${entry.topic}`)
    .forEach(dropChannel);

  const presenceKey = Array.from(entry.subs).map((s) => s.opts.current.presenceKey).find(Boolean);
  entry.presenceKey = presenceKey;
  entry.members = null;
  const ch = supabase.channel(entry.topic, {
    config: {
      broadcast: { self: false },
      ...(presenceKey ? { presence: { key: presenceKey } } : {}),
    },
  });
  entry.channel = ch;

  ch.on('broadcast', { event: '*' }, (msg: any) => {
    if (entry.channel !== ch) return;
    const event = msg?.event;
    const payload = msg?.payload ?? msg;
    entry.subs.forEach((s) => {
      const handler = s.opts.current.onBroadcast?.[event];
      if (handler) safeCall(() => handler(payload));
    });
  });

  if (presenceKey) {
    // Bug realtime-js 2.108: payload join/leave đổi phx_ref→presence_ref NGAY TRÊN meta của presence state đang sống
    // → khi 1 key có ≥2 kết nối (nhiều tab), meta cũ mất phx_ref, leave sau đó không gỡ được → kẹt online.
    // Khôi phục phx_ref ngay trong callback (chạy đồng bộ, trước diff kế tiếp).
    const restoreRefs = (p: any) => {
      for (const m of p?.currentPresences || []) {
        if (m && m.presence_ref && !m.phx_ref) m.phx_ref = m.presence_ref;
      }
    };
    ch.on('presence', { event: 'join' }, restoreRefs);
    ch.on('presence', { event: 'leave' }, restoreRefs);
    ch.on('presence', { event: 'sync' }, () => {
      if (entry.channel !== ch) return;
      const members = flattenPresence(ch.presenceState() as any);
      entry.members = members;
      entry.subs.forEach((s) => safeCall(s.opts.current.onPresence && (() => s.opts.current.onPresence!(members))));
    });
  }

  ch.subscribe((status) => {
    if (entry.channel !== ch) return;
    entry.status = status;
    entry.subs.forEach((s) => s.setStatus(status));
    if (status === 'SUBSCRIBED') {
      const isResync = entry.subscribedOnce;
      entry.subscribedOnce = true;
      const state = entry.trackedState
        || Array.from(entry.subs).map((s) => s.opts.current.presenceState).find(Boolean);
      if (presenceKey && state) trackOn(entry, state);
      if (isResync) entry.subs.forEach((s) => safeCall(s.opts.current.onResync));
    } else if (status === 'CLOSED' && entry.subs.size > 0) {
      // Server đóng channel (không tự rejoin) → tạo lại sau 1s
      entry.channel = null;
      dropChannel(ch);
      setTimeout(() => createChannel(entry), 1000);
    }
  });
}

let globalListenersInstalled = false;
function resyncAll() {
  entries.forEach((e) => e.subs.forEach((s) => safeCall(s.opts.current.onResync)));
}
function installGlobalListeners() {
  if (globalListenersInstalled) return;
  globalListenersInstalled = true;
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') resyncAll();
      });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', resyncAll);
      // Đóng tab / rời trang → untrack + unsubscribe ngay để server gỡ presence lập tức
      const leaveAll = () => {
        entries.forEach((e) => {
          const ch = e.channel;
          if (!ch) return;
          try { ch.untrack().catch(() => {}); } catch {}
          try { ch.unsubscribe(); } catch {}
        });
      };
      window.addEventListener('pagehide', leaveAll);
      window.addEventListener('beforeunload', leaveAll);
    }
  } else {
    let prev = AppState.currentState;
    AppState.addEventListener('change', (next) => {
      if (prev !== 'active' && next === 'active') resyncAll();
      prev = next;
    });
  }
}

function acquire(topic: string, sub: Sub) {
  installGlobalListeners();
  let entry = entries.get(topic);
  if (!entry) {
    entry = {
      topic, channel: null, subs: new Set(), status: 'idle', subscribedOnce: false,
      createScheduled: false, teardownTimer: null, members: null, trackedState: null,
      lastTrackAt: 0, trackTimer: null,
    };
    entries.set(topic, entry);
  }
  if (entry.teardownTimer) {
    clearTimeout(entry.teardownTimer);
    entry.teardownTimer = null;
  }
  entry.subs.add(sub);

  // Presence chỉ bật được trước subscribe() → channel cũ không có presence thì dựng lại
  if (entry.channel && sub.opts.current.presenceKey && !entry.presenceKey) {
    const old = entry.channel;
    entry.channel = null;
    entry.status = 'idle';
    dropChannel(old);
  }
  if (!entry.channel && !entry.createScheduled) {
    entry.createScheduled = true;
    // Đợi hết lượt effect hiện tại để mọi subscriber cùng commit (con chạy trước cha) đăng ký xong
    const e = entry;
    Promise.resolve().then(() => createChannel(e));
  }
  sub.setStatus(entry.status);
  if (entry.members && sub.opts.current.onPresence) {
    const members = entry.members;
    safeCall(() => sub.opts.current.onPresence!(members));
  }
}

function release(topic: string, sub: Sub) {
  const entry = entries.get(topic);
  if (!entry) return;
  entry.subs.delete(sub);
  if (sub.opts.current.presenceState && !Array.from(entry.subs).some((s) => s.opts.current.presenceState)) {
    entry.trackedState = null;
    if (entry.trackTimer) { clearTimeout(entry.trackTimer); entry.trackTimer = null; }
    entry.channel?.untrack().catch(() => {});
  }
  if (entry.subs.size > 0) return;
  entry.teardownTimer = setTimeout(() => {
    if (entry.subs.size > 0) return;
    entries.delete(topic);
    const ch = entry.channel;
    entry.channel = null;
    if (ch) dropChannel(ch);
  }, TEARDOWN_DELAY_MS);
}

export function useRealtimeChannel(topic: string | null, opts: RealtimeChannelOptions = {}) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const [status, setStatus] = useState('idle');
  const presenceKey = opts.presenceKey;

  useEffect(() => {
    if (!topic) {
      setStatus('idle');
      return;
    }
    const sub: Sub = { opts: optsRef, setStatus };
    acquire(topic, sub);
    return () => release(topic, sub);
  }, [topic, presenceKey]);

  const stateJson = opts.presenceState ? JSON.stringify(opts.presenceState) : '';
  useEffect(() => {
    if (!topic || !stateJson) return;
    const entry = entries.get(topic);
    if (entry) trackOn(entry, JSON.parse(stateJson));
  }, [topic, stateJson, presenceKey]);

  const send = useCallback(async (event: string, payload: any) => {
    if (!topic) return;
    const entry = entries.get(topic);
    if (!entry) return;
    if (!entry.channel) createChannel(entry);
    const ch = entry.channel;
    if (!ch) return;
    try {
      if (entry.status === 'SUBSCRIBED' && (ch as any).state === 'joined') {
        await ch.send({ type: 'broadcast', event, payload });
      } else {
        await ch.httpSend(event, payload);
      }
    } catch (e: any) {
      console.warn(`[Realtime] send ${topic}/${event} lỗi:`, e?.message || e);
    }
  }, [topic]);

  const track = useCallback(async (state: Record<string, any>) => {
    if (!topic) return;
    const entry = entries.get(topic);
    if (entry) trackOn(entry, state);
  }, [topic]);

  return { send, status, track };
}
