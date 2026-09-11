import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { QUERY_CACHE_TIMES, TripStatus, TravelerType } from '../constants';

export interface Trip {
  id:                string;
  user_id:           string;
  title:             string;
  destination_city:  string;
  start_date:        string;
  end_date:          string;
  budget_total:      number;
  budget_currency:   string;
  traveler_count:    number;
  traveler_type:     TravelerType | string;
  status:            TripStatus | string;
  created_at:        string;
  updated_at:        string;
}

/** Lay danh sach trips cua user hien tai */
export function useTrips() {
  return useQuery<Trip[]>({
    queryKey: ['trips'],
    queryFn:  async () => {
      const res = await api.get('/trips');
      return res.data?.trips ?? res.data ?? [];
    },
    staleTime: QUERY_CACHE_TIMES.TRIPS_LIST_MS,
  });
}

/** Lay chi tiet 1 trip (bao gom days + items) */
export function useTrip(id: string | undefined) {
  return useQuery({
    queryKey: ['trip', id],
    queryFn:  async () => {
      const res = await api.get(`/trips/${id}`);
      return res.data;
    },
    enabled: !!id,
    staleTime: QUERY_CACHE_TIMES.TRIP_DETAIL_MS,
  });
}

/** Mutation: xoa trip */
export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/trips/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trips'] }),
  });
}
