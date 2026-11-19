import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useRealtimeChannel } from '../lib/realtime';
import { useAuth } from './useAuth';
import type { PaymentStatus } from '../lib/plans';

export const PAYMENT_STATUS_QUERY_KEY = ['payment-status'];

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

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: PAYMENT_STATUS_QUERY_KEY });
  }, [queryClient]);

  // Lắng nghe broadcast user_updated (server phát khi cộng lượt / đổi gói) qua realtime hub dùng chung
  useRealtimeChannel(user?.id ? `user_channel_${user.id}` : null, {
    onBroadcast: { user_updated: () => { invalidate(); } },
  });

  return {
    ...query,
    paymentStatus: query.data,
    invalidate,
  };
}
