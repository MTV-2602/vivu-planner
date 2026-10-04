-- Bảng expense log dùng chung cho cả nhóm
CREATE TABLE IF NOT EXISTS trip_expense_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id TEXT,
  place_name TEXT NOT NULL DEFAULT 'Chi phí khác',
  category TEXT NOT NULL DEFAULT 'other',
  amount BIGINT NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  day_number INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trip_expense_logs_trip_id ON trip_expense_logs(trip_id);
ALTER TABLE trip_expense_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trip_expense_logs_access" ON trip_expense_logs
  FOR ALL USING (
    trip_id IN (
      SELECT id FROM trips WHERE user_id = auth.uid()
      UNION
      SELECT trip_id FROM trip_collaborators WHERE user_id = auth.uid()
    )
  );
