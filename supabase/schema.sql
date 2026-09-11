-- =============================================================================
--  ViVu Planner — Database Schema (Production Standard)
--  Rebuilt from scratch: role-based auth, clean RLS, Supabase JWT claims
--  Apply order: extensions → types → functions → tables → policies → triggers → views
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. CUSTOM TYPES / ENUMS
-- ---------------------------------------------------------------------------
CREATE TYPE public.user_role        AS ENUM ('user', 'admin');
CREATE TYPE public.traveler_type    AS ENUM ('solo', 'couple', 'family', 'friends', 'other');
CREATE TYPE public.trip_status      AS ENUM ('draft', 'active', 'completed', 'archived');
CREATE TYPE public.item_type        AS ENUM ('accommodation', 'transport', 'dining', 'attraction', 'rental', 'experience');
CREATE TYPE public.item_status      AS ENUM ('planned', 'confirmed', 'skipped', 'replaced');
CREATE TYPE public.disruption_type  AS ENUM ('delay', 'budget_shortage', 'health_issue', 'weather_change', 'other');
CREATE TYPE public.payment_status   AS ENUM ('pending', 'completed', 'cancelled', 'refunded');
CREATE TYPE public.api_key_status   AS ENUM ('active', 'rate_limited', 'quota_exceeded', 'invalid', 'disabled');
CREATE TYPE public.partner_category AS ENUM ('hotel', 'homestay', 'resort', 'restaurant', 'cafe', 'attraction', 'transport', 'experience');
CREATE TYPE public.chat_role        AS ENUM ('user', 'assistant');

-- ---------------------------------------------------------------------------
-- 2. HELPER FUNCTIONS (dung trong RLS policies)
-- ---------------------------------------------------------------------------

-- 2.1 Kiem tra user hien tai co role admin khong (doc tu JWT claim)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'user_role')::text = 'admin',
    false
  );
$$;

-- 2.2 Policy helper: owner hoac admin
CREATE OR REPLACE FUNCTION public.owns_or_admin(resource_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT auth.uid() = resource_user_id OR public.is_admin();
$$;

-- ---------------------------------------------------------------------------
-- 3. TABLES & RLS POLICIES
-- ---------------------------------------------------------------------------

-- ── 3.1 profiles ─────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     text        NOT NULL DEFAULT '',
  avatar_url    text,
  phone         text,
  role          public.user_role NOT NULL DEFAULT 'user',
  -- Premium / Quota
  is_premium    boolean     NOT NULL DEFAULT false,
  premium_until timestamptz,
  quota_total   int         NOT NULL DEFAULT 3,
  quota_used    int         NOT NULL DEFAULT 0,
  -- Timestamps
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select"      ON public.profiles FOR SELECT  USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "profiles_insert_own"  ON public.profiles FOR INSERT  WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own"  ON public.profiles FOR UPDATE  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_admin_all"   ON public.profiles FOR ALL     USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 3.2 trips ────────────────────────────────────────────────────────────────
CREATE TABLE public.trips (
  id                    uuid       PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid       NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                 text       NOT NULL,
  destination_city      text       NOT NULL,
  destination_province  text,
  destination_lat       double precision,
  destination_lng       double precision,
  start_date            date       NOT NULL,
  end_date              date       NOT NULL,
  budget_total          numeric    NOT NULL CHECK (budget_total >= 0),
  budget_currency       text       NOT NULL DEFAULT 'VND',
  traveler_count        int        NOT NULL DEFAULT 1 CHECK (traveler_count > 0),
  traveler_type         public.traveler_type NOT NULL DEFAULT 'solo',
  preferences           jsonb      NOT NULL DEFAULT '[]'::jsonb,
  health_conditions     text,
  special_requirements  text,
  status                public.trip_status NOT NULL DEFAULT 'draft',
  -- Public sharing
  is_public             boolean    NOT NULL DEFAULT false,
  share_token           text       UNIQUE,
  -- Timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trips_owner_all"      ON public.trips FOR ALL    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "trips_admin_all"      ON public.trips FOR ALL    USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "trips_public_select"  ON public.trips FOR SELECT USING (is_public = true);

-- ── 3.3 itinerary_days ───────────────────────────────────────────────────────
CREATE TABLE public.itinerary_days (
  id              uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         uuid  NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_number      int   NOT NULL CHECK (day_number > 0),
  date            date  NOT NULL,
  weather_summary jsonb,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, day_number)
);

ALTER TABLE public.itinerary_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "days_owner_all" ON public.itinerary_days
  FOR ALL
  USING  (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid()));
CREATE POLICY "days_admin_all"      ON public.itinerary_days FOR ALL    USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "days_public_select"  ON public.itinerary_days FOR SELECT USING (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.is_public = true));

-- ── 3.4 itinerary_items ──────────────────────────────────────────────────────
CREATE TABLE public.itinerary_items (
  id              uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id          uuid  NOT NULL REFERENCES public.itinerary_days(id) ON DELETE CASCADE,
  partner_id      uuid  REFERENCES public.partners(id) ON DELETE SET NULL,
  item_type       public.item_type NOT NULL,
  title           text  NOT NULL,
  description     text,
  start_time      time,
  end_time        time,
  location_name   text,
  location_lat    double precision,
  location_lng    double precision,
  google_place_id text,
  estimated_cost  numeric CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  booking_url     text,
  order_index     int   NOT NULL DEFAULT 0,
  status          public.item_status NOT NULL DEFAULT 'planned',
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.itinerary_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_owner_all" ON public.itinerary_items
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.itinerary_days d JOIN public.trips t ON t.id = d.trip_id WHERE d.id = day_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.itinerary_days d JOIN public.trips t ON t.id = d.trip_id WHERE d.id = day_id AND t.user_id = auth.uid()));
CREATE POLICY "items_admin_all"     ON public.itinerary_items FOR ALL    USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "items_public_select" ON public.itinerary_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.itinerary_days d JOIN public.trips t ON t.id = d.trip_id WHERE d.id = day_id AND t.is_public = true));

-- ── 3.5 disruption_events ────────────────────────────────────────────────────
CREATE TABLE public.disruption_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id            uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_id             uuid REFERENCES public.itinerary_days(id) ON DELETE SET NULL,
  disruption_type    public.disruption_type NOT NULL,
  description        text,
  detected_at        timestamptz NOT NULL DEFAULT now(),
  resolved           boolean NOT NULL DEFAULT false,
  resolved_at        timestamptz,
  resolution_summary text
);

ALTER TABLE public.disruption_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "disruptions_owner_all" ON public.disruption_events
  FOR ALL
  USING  (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid()));
CREATE POLICY "disruptions_admin_all" ON public.disruption_events FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 3.6 itinerary_revisions ──────────────────────────────────────────────────
CREATE TABLE public.itinerary_revisions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id              uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  disruption_event_id  uuid REFERENCES public.disruption_events(id) ON DELETE SET NULL,
  revision_type        text NOT NULL DEFAULT 'ai_disruption',
  previous_snapshot    jsonb NOT NULL,
  new_snapshot         jsonb NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.itinerary_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "revisions_owner_select" ON public.itinerary_revisions
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid()));
CREATE POLICY "revisions_admin_all" ON public.itinerary_revisions FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 3.7 trip_chat_messages ───────────────────────────────────────────────────
CREATE TABLE public.trip_chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        public.chat_role NOT NULL,
  content     text NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_owner_all" ON public.trip_chat_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chat_admin_all" ON public.trip_chat_messages FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 3.8 payment_orders ───────────────────────────────────────────────────────
CREATE TABLE public.payment_orders (
  id            text  PRIMARY KEY,
  user_id       uuid  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method        text  NOT NULL,
  plan          text  NOT NULL,
  amount        numeric NOT NULL CHECK (amount > 0),
  status        public.payment_status NOT NULL DEFAULT 'pending',
  order_code    text  NOT NULL UNIQUE,
  quota_granted int   NOT NULL DEFAULT 0,
  completed_at  timestamptz,
  cancelled_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_owner_all" ON public.payment_orders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "payments_admin_all" ON public.payment_orders FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 3.9 partners ─────────────────────────────────────────────────────────────
CREATE TABLE public.partners (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text    NOT NULL,
  category         public.partner_category NOT NULL,
  city             text    NOT NULL,
  district         text,
  address          text    NOT NULL,
  lat              double precision NOT NULL,
  lng              double precision NOT NULL,
  contact_phone    text,
  contact_email    text,
  website_url      text,
  booking_url      text,
  description      text,
  image_urls       text[]  NOT NULL DEFAULT '{}',
  price_level      int     NOT NULL DEFAULT 2 CHECK (price_level BETWEEN 1 AND 4),
  tags             text[]  NOT NULL DEFAULT '{}',
  admin_rating     int     NOT NULL DEFAULT 3 CHECK (admin_rating BETWEEN 1 AND 5),
  admin_notes      text,
  priority         int     NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 10),
  is_active        boolean NOT NULL DEFAULT true,
  impression_count int     NOT NULL DEFAULT 0,
  click_count      int     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partners_public_select" ON public.partners FOR SELECT USING (is_active = true);
CREATE POLICY "partners_admin_all"     ON public.partners FOR ALL    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 3.10 partner_analytics ───────────────────────────────────────────────────
CREATE TABLE public.partner_analytics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  event_type  text NOT NULL CHECK (event_type IN ('impression', 'click', 'booking', 'skip')),
  trip_id     uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics_user_insert" ON public.partner_analytics FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "analytics_admin_all"   ON public.partner_analytics FOR ALL    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 3.11 places_cache ────────────────────────────────────────────────────────
CREATE TABLE public.places_cache (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id text UNIQUE NOT NULL,
  name            text,
  category        text,
  lat             double precision,
  lng             double precision,
  rating          numeric,
  price_level     int,
  address         text,
  raw_data        jsonb,
  cached_at       timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

ALTER TABLE public.places_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "places_auth_select" ON public.places_cache FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "places_admin_all"   ON public.places_cache FOR ALL    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 3.12 gemini_api_keys ─────────────────────────────────────────────────────
CREATE TABLE public.gemini_api_keys (
  id            uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  key_value     text  UNIQUE NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  status        public.api_key_status NOT NULL DEFAULT 'active',
  usage_count   int   NOT NULL DEFAULT 0,
  daily_usage   int   NOT NULL DEFAULT 0,
  last_used_at  timestamptz,
  last_reset_at timestamptz DEFAULT now(),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gemini_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_keys_admin_all" ON public.gemini_api_keys FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 3.13 pricing_plans ───────────────────────────────────────────────────────
CREATE TABLE public.pricing_plans (
  id            text PRIMARY KEY,
  amount        integer NOT NULL,
  label         text NOT NULL,
  duration_days integer NOT NULL DEFAULT 30
);

ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing_plans_select"    ON public.pricing_plans FOR SELECT USING (true);
CREATE POLICY "pricing_plans_admin_all" ON public.pricing_plans FOR ALL    USING (public.is_admin()) WITH CHECK (public.is_admin());

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

-- ---------------------------------------------------------------------------
-- 4. INDEXES
-- ---------------------------------------------------------------------------
CREATE INDEX idx_trips_user_id      ON public.trips(user_id);
CREATE INDEX idx_trips_status       ON public.trips(status);
CREATE INDEX idx_trips_share_token  ON public.trips(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX idx_trips_created_at   ON public.trips(created_at DESC);
CREATE INDEX idx_days_trip_id       ON public.itinerary_days(trip_id);
CREATE INDEX idx_items_day_id       ON public.itinerary_items(day_id);
CREATE INDEX idx_items_order        ON public.itinerary_items(day_id, order_index);
CREATE INDEX idx_disruptions_trip   ON public.disruption_events(trip_id);
CREATE INDEX idx_revisions_trip     ON public.itinerary_revisions(trip_id);
CREATE INDEX idx_chat_trip_id       ON public.trip_chat_messages(trip_id);
CREATE INDEX idx_chat_user_id       ON public.trip_chat_messages(user_id);
CREATE INDEX idx_partners_city      ON public.partners(city);
CREATE INDEX idx_partners_category  ON public.partners(category);
CREATE INDEX idx_partners_active    ON public.partners(is_active, priority DESC);
CREATE INDEX idx_analytics_partner  ON public.partner_analytics(partner_id);
CREATE INDEX idx_payments_user      ON public.payment_orders(user_id);
CREATE INDEX idx_payments_status    ON public.payment_orders(status);
CREATE INDEX idx_api_keys_status    ON public.gemini_api_keys(status, is_active);

-- ---------------------------------------------------------------------------
-- 5. TRIGGERS
-- ---------------------------------------------------------------------------

-- 5.1 Auto-create profile khi user dang ky
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5.2 Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER trg_trips_updated_at    BEFORE UPDATE ON public.trips    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trg_partners_updated_at BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5.3 Auto increment partner stats
CREATE OR REPLACE FUNCTION public.handle_partner_analytics_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NEW.event_type = 'impression' THEN
    UPDATE public.partners SET impression_count = impression_count + 1 WHERE id = NEW.partner_id;
  ELSIF NEW.event_type = 'click' THEN
    UPDATE public.partners SET click_count = click_count + 1 WHERE id = NEW.partner_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_analytics_insert
  AFTER INSERT ON public.partner_analytics FOR EACH ROW EXECUTE FUNCTION public.handle_partner_analytics_insert();

-- 5.4 Auto generate share_token khi bat is_public
CREATE OR REPLACE FUNCTION public.handle_trip_share_token()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_public = true AND (OLD.is_public = false OR OLD.share_token IS NULL) THEN
    NEW.share_token = encode(gen_random_bytes(16), 'hex');
  ELSIF NEW.is_public = false THEN
    NEW.share_token = NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_trip_share_toggle
  BEFORE UPDATE ON public.trips FOR EACH ROW
  WHEN (NEW.is_public IS DISTINCT FROM OLD.is_public)
  EXECUTE FUNCTION public.handle_trip_share_token();

-- ---------------------------------------------------------------------------
-- 6. AUTH HOOK — Inject user_role vao JWT claim
-- ---------------------------------------------------------------------------
-- SAU KHI CHAY SQL NAY:
-- → Vao Supabase Dashboard → Authentication → Hooks
-- → Enable "Customize Access Token (JWT) Claim"
-- → Chon function: public.custom_access_token_hook
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  claims        jsonb;
  user_role_val text;
BEGIN
  SELECT role::text INTO user_role_val FROM public.profiles WHERE id = (event->>'user_id')::uuid;
  claims := event->'claims';
  claims := jsonb_set(claims, '{user_role}', to_jsonb(COALESCE(user_role_val, 'user')));
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
GRANT SELECT ON public.profiles TO supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- 7. HELPER VIEWS (admin dashboard)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.admin_users_view AS
SELECT
  u.id,
  u.email,
  u.created_at       AS registered_at,
  u.last_sign_in_at,
  p.full_name,
  p.avatar_url,
  p.role,
  p.is_premium,
  p.premium_until,
  p.quota_total,
  p.quota_used,
  (p.quota_total - p.quota_used) AS quota_remaining,
  (SELECT COUNT(*) FROM public.trips t WHERE t.user_id = u.id) AS trip_count
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id;

CREATE OR REPLACE VIEW public.admin_stats_view AS
SELECT
  (SELECT COUNT(*) FROM auth.users)                                                     AS total_users,
  (SELECT COUNT(*) FROM public.profiles WHERE role = 'admin')                           AS total_admins,
  (SELECT COUNT(*) FROM public.profiles WHERE is_premium = true)                        AS premium_users,
  (SELECT COUNT(*) FROM public.trips)                                                   AS total_trips,
  (SELECT COUNT(*) FROM public.disruption_events WHERE resolved = false)                AS open_disruptions,
  (SELECT COUNT(*) FROM public.gemini_api_keys WHERE is_active = true)                  AS active_api_keys,
  (SELECT COUNT(*) FROM public.partners WHERE is_active = true)                         AS active_partners,
  (SELECT COALESCE(SUM(amount), 0) FROM public.payment_orders WHERE status = 'completed') AS total_revenue;
