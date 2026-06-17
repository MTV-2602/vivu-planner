-- Create pricing_plans table
CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id text PRIMARY KEY,
  amount integer NOT NULL,
  label text NOT NULL,
  duration_days integer NOT NULL DEFAULT 30
);

-- Enable RLS
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access to pricing plans"
ON public.pricing_plans FOR SELECT
USING (true);

-- Allow admin full access
CREATE POLICY "Allow admin full access to pricing plans"
ON public.pricing_plans FOR ALL
USING (true)
WITH CHECK (true);

-- Insert default plans
INSERT INTO public.pricing_plans (id, amount, label, duration_days) VALUES
('starter', 29000, 'Gói Starter', 30),
('plus', 29000, 'Gói Starter', 30),
('premium', 49000, 'Gói Premium', 30),
('pro', 49000, 'Gói Premium', 30),
('monthly', 49000, 'Gói Premium', 30)
ON CONFLICT (id) DO UPDATE SET
  amount = EXCLUDED.amount,
  label = EXCLUDED.label,
  duration_days = EXCLUDED.duration_days;
