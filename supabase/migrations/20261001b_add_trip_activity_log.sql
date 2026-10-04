-- ── 4.16b trip_activity_log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trip_activity_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type  text NOT NULL,  -- 'drag_item','edit_item','add_item','delete_item','join_trip','leave_trip','save_schedule','apply_ai'
  item_title   text,           -- tên địa điểm/hoạt động bị tác động
  item_id      text,           -- ID của itinerary_item nếu có
  detail       jsonb,          -- chi tiết thêm: { from_time, to_time, day_number, ... }
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_trip ON public.trip_activity_log(trip_id, created_at DESC);

ALTER TABLE public.trip_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_log_select" ON public.trip_activity_log;
CREATE POLICY "activity_log_select" ON public.trip_activity_log
  FOR SELECT USING (public.can_view_trip(trip_id));

DROP POLICY IF EXISTS "activity_log_insert" ON public.trip_activity_log;
CREATE POLICY "activity_log_insert" ON public.trip_activity_log
  FOR INSERT WITH CHECK (public.can_view_trip(trip_id) AND auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_activity_log;
