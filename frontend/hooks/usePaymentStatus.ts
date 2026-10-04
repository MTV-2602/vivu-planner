import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import type { PaymentStatus } from '../lib/plans';

export const PAYMENT_STATUS_QUERY_KEY = ['payment-status'];

interface UserRealtimeEntry {
  channel: RealtimeChannel;
  refCount: number;
  listeners: Set<() => void>;
}

// Module-level map quản lý 1 Realtime subscription duy nhất cho mỗi user
// Tránh lỗi tái đăng ký channel đã subscribe khi nhiều component cùng gọi hook
const activeChannels = new Map<string, UserRealtimeEntry>();

export function usePaymentStatus(enabled = true) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<PaymentStatus>({
    queryKey: PAYMENT_STATUS_QUERY_KEY,
    queryFn: async () => {
      const res = await api.get('/payment/status');
      return res.data;
    },
    enabled: enabled && !!user?.id,
    staleTime: 5000,
  });

  // Lắng nghe realtime để tự động đồng bộ khi tài khoản được cộng lượt / đổi gói
  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    const onUpdate = () => {
      queryClient.invalidateQueries({ queryKey: PAYMENT_STATUS_QUERY_KEY });
    };

    let entry = activeChannels.get(userId);

    if (entry) {
      entry.refCount += 1;
      entry.listeners.add(onUpdate);
    } else {
      const listeners = new Set<() => void>();
      listeners.add(onUpdate);

      const dispatchUpdate = () => {
        listeners.forEach((cb) => {
          try {
            cb();
          } catch (e) {
            console.warn('[usePaymentStatus] Listener callback error:', e);
          }
        });
      };

      try {
        const channel = supabase
          .channel(`user_channel_${userId}`)
          .on('broadcast', { event: 'user_updated' }, () => {
            dispatchUpdate();
          })
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'profiles',
              filter: `id=eq.${userId}`,
            },
            () => {
              dispatchUpdate();
            }
          )
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR') {
              console.warn(`[usePaymentStatus] Realtime channel error for user ${userId}`);
            }
          });

        entry = { channel, refCount: 1, listeners };
        activeChannels.set(userId, entry);
      } catch (err) {
        console.warn('[usePaymentStatus] Realtime subscribe error:', err);
      }
    }

    return () => {
      const currentEntry = activeChannels.get(userId);
      if (!currentEntry) return;

      currentEntry.listeners.delete(onUpdate);
      currentEntry.refCount -= 1;

      if (currentEntry.refCount <= 0) {
        try {
          supabase.removeChannel(currentEntry.channel);
        } catch (err) {
          console.warn('[usePaymentStatus] Remove channel error:', err);
        }
        activeChannels.delete(userId);
      }
    };
  }, [user?.id, queryClient]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: PAYMENT_STATUS_QUERY_KEY });
  };

  return {
    ...query,
    paymentStatus: query.data,
    invalidate,
  };
}
