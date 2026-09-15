-- =============================================================================
--  ViVu Planner — Production Standard Database Schema
--  Version: 2.2.0 (Strict Linear Dependency Order — 100% Clean Execution)
--  Authors: Senior Database Architect Team
--
--  Execution Order (Strict Topological Hierarchy):
--  1. Optional Idempotent Cleanup (Commented out by default for safety)
--  2. Extensions (pgcrypto, pg_trgm)
--  3. Custom Types & Enums
--  4. Tables DDL (Strict top-to-bottom Foreign Key dependency order)
--  5. Incremental Schema Sync Columns
--  6. Security & Helper Functions (can_edit_trip, can_view_trip, is_admin)
--  7. Row Level Security (RLS) & Policies (Tables & Functions already exist)
--  8. Trigger Functions & Triggers
--  9. High-Performance Indexes
--  10. Supabase Auth Custom Claims Hook & Permissions
--  11. Admin Dashboard Views
--  12. Seed Data
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. OPTIONAL IDEMPOTENT CLEANUP (CHỈ DÙNG KHI CẦN RESET TOÀN BỘ DB DEV/TEST)
-- CẢNH BÁO: MẶC ĐỊNH ĐÃ ĐƯỢC COMMENT ĐỂ BẢO VỆ AN TOÀN TUYỆT ĐỐI CHO DỮ LIỆU THẬT TRÊN PRODUCTION.
-- ---------------------------------------------------------------------------
/*
DROP VIEW IF EXISTS public.admin_stats_view CASCADE;
DROP VIEW IF EXISTS public.admin_users_view CASCADE;
DROP TABLE IF EXISTS public.payment_webhook_logs CASCADE;
DROP TABLE IF EXISTS public.pricing_plan_history CASCADE;
DROP TABLE IF EXISTS public.place_reviews CASCADE;
DROP TABLE IF EXISTS public.trip_collaborators CASCADE;
DROP TABLE IF EXISTS public.bookings CASCADE;
DROP TABLE IF EXISTS public.pricing_plans CASCADE;
DROP TABLE IF EXISTS public.gemini_api_keys CASCADE;
DROP TABLE IF EXISTS public.places_cache CASCADE;
DROP TABLE IF EXISTS public.partner_analytics CASCADE;
DROP TABLE IF EXISTS public.itinerary_revisions CASCADE;
DROP TABLE IF EXISTS public.disruption_events CASCADE;
DROP TABLE IF EXISTS public.itinerary_items CASCADE;
DROP TABLE IF EXISTS public.itinerary_days CASCADE;
DROP TABLE IF EXISTS public.trip_chat_messages CASCADE;
DROP TABLE IF EXISTS public.payment_orders CASCADE;
DROP TABLE IF EXISTS public.trips CASCADE;
DROP TABLE IF EXISTS public.partners CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TYPE IF EXISTS public.payment_provider CASCADE;
DROP TYPE IF EXISTS public.collaborator_role CASCADE;
DROP TYPE IF EXISTS public.partner_event_type CASCADE;
DROP TYPE IF EXISTS public.booking_status CASCADE;
DROP TYPE IF EXISTS public.chat_role CASCADE;
DROP TYPE IF EXISTS public.partner_category CASCADE;
DROP TYPE IF EXISTS public.api_key_status CASCADE;
DROP TYPE IF EXISTS public.payment_status CASCADE;
DROP TYPE IF EXISTS public.disruption_type CASCADE;
DROP TYPE IF EXISTS public.item_status CASCADE;
DROP TYPE IF EXISTS public.item_type CASCADE;
DROP TYPE IF EXISTS public.trip_status CASCADE;
DROP TYPE IF EXISTS public.traveler_type CASCADE;
DROP TYPE IF EXISTS public.user_role CASCADE;
*/

-- ---------------------------------------------------------------------------
-- 2. EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ---------------------------------------------------------------------------
-- 3. CUSTOM TYPES & ENUMS (Centralized, No duplicates)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('user', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.traveler_type AS ENUM ('solo', 'couple', 'family', 'friends', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.trip_status AS ENUM ('draft', 'active', 'completed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.item_type AS ENUM ('accommodation', 'transport', 'dining', 'attraction', 'rental', 'experience');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.item_status AS ENUM ('planned', 'confirmed', 'skipped', 'replaced');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.disruption_type AS ENUM ('delay', 'budget_shortage', 'health_issue', 'weather_change', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('pending', 'completed', 'cancelled', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.api_key_status AS ENUM ('active', 'rate_limited', 'quota_exceeded', 'invalid', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.partner_category AS ENUM ('hotel', 'homestay', 'resort', 'restaurant', 'cafe', 'attraction', 'transport', 'experience');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.chat_role AS ENUM ('user', 'assistant', 'model');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.booking_status AS ENUM ('pending', 'confirmed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.partner_event_type AS ENUM ('impression', 'click', 'booking', 'skip');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.collaborator_role AS ENUM ('editor', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_provider AS ENUM ('payos', 'momo', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 4. BASE TABLES DDL (Order: Parent Tables -> Child Tables)
-- ---------------------------------------------------------------------------

-- ── 4.1 profiles ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text,
  full_name     text        NOT NULL DEFAULT '',
  avatar_url    text,
  phone         text,
  role          public.user_role NOT NULL DEFAULT 'user',
  -- Goi dich vu & Han muc
  is_premium    boolean     NOT NULL DEFAULT false,
  premium_until timestamptz,
  quota_total   int         NOT NULL DEFAULT 3 CHECK (quota_total >= 0),
  quota_used    int         NOT NULL DEFAULT 0 CHECK (quota_used >= 0),
  -- Cot sinh tu dong ho tro tuong thich nguoc (v1 fallback)
  custom_quota  int         GENERATED ALWAYS AS (quota_total) STORED,
  trips_used    int         GENERATED ALWAYS AS (quota_used) STORED,
  -- Timestamps
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'Ho so nguoi dung, phan quyen he thong va han muc su dung AI';
COMMENT ON COLUMN public.profiles.id IS 'Khoa ngoai lien ket 1-1 voi auth.users cua Supabase';
COMMENT ON COLUMN public.profiles.quota_total IS 'Tong so luot tao chuyen di duoc phep (Free mac dinh: 3)';
COMMENT ON COLUMN public.profiles.quota_used IS 'So luot tao chuyen di da su dung thuc te';

-- ── 4.2 partners ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partners (
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
  cuisine_tags     text[]  NOT NULL DEFAULT '{}',
  amenity_tags     text[]  NOT NULL DEFAULT '{}',
  dietary_safe     text[]  NOT NULL DEFAULT '{}',
  admin_rating     int     NOT NULL DEFAULT 3 CHECK (admin_rating BETWEEN 1 AND 5),
  admin_notes      text,
  priority         int     NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 10),
  partner_priority int     NOT NULL DEFAULT 0 CHECK (partner_priority BETWEEN 0 AND 10),
  active_status    boolean NOT NULL DEFAULT true,
  is_active        boolean GENERATED ALWAYS AS (active_status) STORED,
  impression_count int     NOT NULL DEFAULT 0 CHECK (impression_count >= 0),
  click_count      int     NOT NULL DEFAULT 0 CHECK (click_count >= 0),
  booking_count    int     NOT NULL DEFAULT 0 CHECK (booking_count >= 0),
  i18n             jsonb   NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.partners IS 'Danh ba doi tac du lich duoc admin quan ly va tich hop vao AI itinerary';
COMMENT ON COLUMN public.partners.active_status IS 'Trang thai bat/tat doi tac tren he thong';
COMMENT ON COLUMN public.partners.i18n IS 'Ho tro da ngon ngu (ten, mo ta) cho mo rong tuong lai';

-- ── 4.3 trips ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trips (
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
  is_public             boolean    NOT NULL DEFAULT false,
  share_token           text       UNIQUE,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.trips IS 'Luu thong tin chuyen di goc do nguoi dung tao lap';

-- ── 4.4 itinerary_days ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.itinerary_days (
  id              uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         uuid  NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_number      int   NOT NULL CHECK (day_number > 0),
  date            date  NOT NULL,
  weather_summary jsonb,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, day_number)
);

COMMENT ON TABLE public.itinerary_days IS 'Chi tiet tung ngay trong hanh trinh cua chuyen di';

-- ── 4.5 itinerary_items ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.itinerary_items (
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
  i18n            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.itinerary_items IS 'Hoat dong cu the (dia diem, gio giac, chi phi) trong tung ngay';

-- ── 4.6 disruption_events ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.disruption_events (
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

COMMENT ON TABLE public.disruption_events IS 'Cac su co thoi tiet hoac lich trinh duoc he thong AI phat hien';

-- ── 4.7 itinerary_revisions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.itinerary_revisions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id              uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  disruption_event_id  uuid REFERENCES public.disruption_events(id) ON DELETE SET NULL,
  revision_type        text NOT NULL DEFAULT 'ai_disruption',
  previous_snapshot    jsonb NOT NULL,
  new_snapshot         jsonb NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.itinerary_revisions IS 'Snapshot lich su thay doi lich trinh cho phep hoan tac (undo)';

-- ── 4.8 trip_chat_messages ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trip_chat_messages (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id            uuid REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role               public.chat_role NOT NULL,
  content            text NOT NULL,
  adapted_itinerary  jsonb,
  diff               text,
  previous_snapshot  jsonb,
  is_create_trip     boolean NOT NULL DEFAULT false,
  create_trip_params jsonb,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.trip_chat_messages IS 'Tin nhan hoi thoai chatbot AI ho tro de xuat lich trinh';

-- ── 4.9 payment_orders ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id            text  PRIMARY KEY,
  user_id       uuid  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method        text  NOT NULL,
  plan          text  NOT NULL,
  amount        numeric NOT NULL CHECK (amount > 0),
  status        public.payment_status NOT NULL DEFAULT 'pending',
  order_code    text  NOT NULL,
  quota_granted int   NOT NULL DEFAULT 0,
  completed_at  timestamptz,
  cancelled_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payment_orders IS 'Don hang thanh toan dich vu nang cap tai khoan';

-- ── 4.10 bookings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bookings (
  id            text PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  trip_id       uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  token         text UNIQUE NOT NULL,
  guest_name    text NOT NULL,
  guest_email   text NOT NULL,
  guest_phone   text,
  guest_count   int NOT NULL DEFAULT 1 CHECK (guest_count > 0),
  items         jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_cost    numeric NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  status        public.booking_status NOT NULL DEFAULT 'pending',
  confirmed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bookings IS 'Don dat dich vu 1-click duoc tao tu wizard lich trinh';

-- ── 4.11 partner_analytics ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_analytics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  event_type  public.partner_event_type NOT NULL,
  trip_id     uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.partner_analytics IS 'Nhat ky su kien phan tich hieu qua tiep thi cua doi tac';

-- ── 4.12 places_cache ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.places_cache (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id text UNIQUE NOT NULL,
  name            text,
  category        text,
  lat             double precision NOT NULL,
  lng             double precision NOT NULL,
  rating          numeric,
  price_level     int,
  address         text,
  raw_data        jsonb,
  cached_at       timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

COMMENT ON TABLE public.places_cache IS 'Bo dem dia diem giup giam thieu truy van API ngoai';

-- ── 4.13 gemini_api_keys ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gemini_api_keys (
  id            uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  key_value     text  UNIQUE NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  status        public.api_key_status NOT NULL DEFAULT 'active',
  usage_count   int   NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  daily_usage   int   NOT NULL DEFAULT 0 CHECK (daily_usage >= 0),
  last_used_at  timestamptz,
  last_reset_at timestamptz DEFAULT now(),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.gemini_api_keys IS 'Be chua key AI Gemini voi co che cooldown va xoay vong tu dong';

-- ── 4.14 pricing_plans ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id                text PRIMARY KEY,
  amount            integer NOT NULL CHECK (amount > 0),
  label             text NOT NULL,
  duration_days     integer NOT NULL DEFAULT 30 CHECK (duration_days > 0),
  quota_total_grant integer NOT NULL DEFAULT 9999,
  is_unlimited      boolean NOT NULL DEFAULT false,
  features          text[] NOT NULL DEFAULT '{}',
  is_active         boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE public.pricing_plans IS 'Bang gia cac goi cuoc dich vu nang cap';

-- ── 4.15 trip_collaborators ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trip_collaborators (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.collaborator_role NOT NULL DEFAULT 'editor',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id)
);

COMMENT ON TABLE public.trip_collaborators IS 'Danh sach thanh vien cung tham gia len ke hoach chuyen di';

-- ── 4.16 place_reviews ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.place_reviews (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id           uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  itinerary_item_id uuid REFERENCES public.itinerary_items(id) ON DELETE SET NULL,
  google_place_id   text,
  partner_id        uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  rating            int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment           text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.place_reviews IS 'Danh gia va phan hoi cua khach ve cac dia diem du lich';

-- ── 4.17 pricing_plan_history ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pricing_plan_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       text NOT NULL REFERENCES public.pricing_plans(id) ON DELETE CASCADE,
  old_amount    integer,
  new_amount    integer NOT NULL,
  changed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pricing_plan_history IS 'Nhat ky lich su bien dong gia cac goi cuoc theo thoi gian';

-- ── 4.18 payment_webhook_logs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_webhook_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         public.payment_provider NOT NULL,
  order_code       text,
  order_id         text REFERENCES public.payment_orders(id) ON DELETE SET NULL,
  raw_payload      jsonb NOT NULL,
  signature        text,
  is_verified      boolean NOT NULL DEFAULT false,
  processed_status text NOT NULL DEFAULT 'pending',
  error_message    text,
  ip_address       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payment_webhook_logs IS 'Nhat ky webhook thanh toan tu PayOS va MoMo phuc vu doi soat va audit';

-- ---------------------------------------------------------------------------
-- 5. INCREMENTAL SCHEMA SYNC (Dam bao cot moi ton tai tren DB cu ma khong loi)
-- ---------------------------------------------------------------------------
ALTER TABLE public.pricing_plans 
  ADD COLUMN IF NOT EXISTS amount integer,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS price integer,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS quota_total_grant integer NOT NULL DEFAULT 9999,
  ADD COLUMN IF NOT EXISTS is_unlimited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS features text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.itinerary_items 
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 6. SECURITY & RLS HELPER FUNCTIONS
-- (Tat ca cac bang public.trips, public.trip_collaborators da ton tai hop le)
-- ---------------------------------------------------------------------------

-- Kiem tra xem user hien tai co claim user_role = 'admin' tu Supabase JWT hay khong
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'user_role')::text = 'admin',
    false
  );
$$;

-- Kiem tra xem user co quyen edit trip (chu so huu, collaborator editor, hoac admin)
CREATE OR REPLACE FUNCTION public.can_edit_trip(check_trip_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips t WHERE t.id = check_trip_id AND t.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.trip_collaborators c 
    WHERE c.trip_id = check_trip_id AND c.user_id = auth.uid() AND c.role = 'editor'
  )
  OR public.is_admin();
$$;

-- Kiem tra quyen xem trip (chu so huu, collaborator, admin, hoac trip che do cong khai)
CREATE OR REPLACE FUNCTION public.can_view_trip(check_trip_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips t WHERE t.id = check_trip_id AND (t.user_id = auth.uid() OR t.is_public = true)
  )
  OR EXISTS (
    SELECT 1 FROM public.trip_collaborators c WHERE c.trip_id = check_trip_id AND c.user_id = auth.uid()
  )
  OR public.is_admin();
$$;

-- ---------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- (Tat ca cac bang va helper functions da san sang)
-- ---------------------------------------------------------------------------

-- 7.1 profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select"     ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_admin());
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all"  ON public.profiles FOR ALL    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 7.2 partners
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partners_public_select" ON public.partners;
CREATE POLICY "partners_public_select" ON public.partners FOR SELECT USING (active_status = true);
DROP POLICY IF EXISTS "partners_admin_all" ON public.partners;
CREATE POLICY "partners_admin_all"     ON public.partners FOR ALL    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 7.3 trips
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trips_select" ON public.trips;
CREATE POLICY "trips_select" ON public.trips FOR SELECT USING (public.can_view_trip(id));
DROP POLICY IF EXISTS "trips_insert" ON public.trips;
CREATE POLICY "trips_insert" ON public.trips FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "trips_update" ON public.trips;
CREATE POLICY "trips_update" ON public.trips FOR UPDATE USING (public.can_edit_trip(id)) WITH CHECK (public.can_edit_trip(id));
DROP POLICY IF EXISTS "trips_delete" ON public.trips;
CREATE POLICY "trips_delete" ON public.trips FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- 7.4 itinerary_days
ALTER TABLE public.itinerary_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "days_select" ON public.itinerary_days;
CREATE POLICY "days_select" ON public.itinerary_days FOR SELECT USING (public.can_view_trip(trip_id));
DROP POLICY IF EXISTS "days_modify" ON public.itinerary_days;
CREATE POLICY "days_modify" ON public.itinerary_days FOR ALL    USING (public.can_edit_trip(trip_id)) WITH CHECK (public.can_edit_trip(trip_id));

-- 7.5 itinerary_items
ALTER TABLE public.itinerary_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "items_select" ON public.itinerary_items;
CREATE POLICY "items_select" ON public.itinerary_items
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.itinerary_days d WHERE d.id = day_id AND public.can_view_trip(d.trip_id)));
DROP POLICY IF EXISTS "items_modify" ON public.itinerary_items;
CREATE POLICY "items_modify" ON public.itinerary_items
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.itinerary_days d WHERE d.id = day_id AND public.can_edit_trip(d.trip_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.itinerary_days d WHERE d.id = day_id AND public.can_edit_trip(d.trip_id)));

-- 7.6 disruption_events
ALTER TABLE public.disruption_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "disruptions_select" ON public.disruption_events;
CREATE POLICY "disruptions_select" ON public.disruption_events FOR SELECT USING (public.can_view_trip(trip_id));
DROP POLICY IF EXISTS "disruptions_modify" ON public.disruption_events;
CREATE POLICY "disruptions_modify" ON public.disruption_events FOR ALL    USING (public.can_edit_trip(trip_id)) WITH CHECK (public.can_edit_trip(trip_id));

-- 7.7 itinerary_revisions
ALTER TABLE public.itinerary_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "revisions_select" ON public.itinerary_revisions;
CREATE POLICY "revisions_select" ON public.itinerary_revisions FOR SELECT USING (public.can_view_trip(trip_id));
DROP POLICY IF EXISTS "revisions_modify" ON public.itinerary_revisions;
CREATE POLICY "revisions_modify" ON public.itinerary_revisions FOR ALL    USING (public.can_edit_trip(trip_id)) WITH CHECK (public.can_edit_trip(trip_id));

-- 7.8 trip_chat_messages
ALTER TABLE public.trip_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_owner_all" ON public.trip_chat_messages;
CREATE POLICY "chat_owner_all" ON public.trip_chat_messages FOR ALL USING (auth.uid() = user_id OR public.is_admin()) WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- 7.9 payment_orders
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_owner_all" ON public.payment_orders;
CREATE POLICY "payments_owner_all" ON public.payment_orders FOR ALL USING (auth.uid() = user_id OR public.is_admin()) WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- 7.10 bookings
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bookings_select" ON public.bookings;
CREATE POLICY "bookings_select" ON public.bookings FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
DROP POLICY IF EXISTS "bookings_insert" ON public.bookings;
CREATE POLICY "bookings_insert" ON public.bookings FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "bookings_update" ON public.bookings;
CREATE POLICY "bookings_update" ON public.bookings FOR UPDATE USING (auth.uid() = user_id OR public.is_admin());

-- 7.11 partner_analytics
ALTER TABLE public.partner_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "analytics_user_insert" ON public.partner_analytics;
CREATE POLICY "analytics_user_insert" ON public.partner_analytics FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
DROP POLICY IF EXISTS "analytics_admin_all" ON public.partner_analytics;
CREATE POLICY "analytics_admin_all"   ON public.partner_analytics FOR ALL    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 7.12 places_cache
ALTER TABLE public.places_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "places_auth_select" ON public.places_cache;
CREATE POLICY "places_auth_select" ON public.places_cache FOR SELECT USING (true);
DROP POLICY IF EXISTS "places_admin_all" ON public.places_cache;
CREATE POLICY "places_admin_all"   ON public.places_cache FOR ALL    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 7.13 gemini_api_keys
ALTER TABLE public.gemini_api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_keys_admin_all" ON public.gemini_api_keys;
CREATE POLICY "api_keys_admin_all" ON public.gemini_api_keys FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 7.14 pricing_plans
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pricing_plans_select" ON public.pricing_plans;
CREATE POLICY "pricing_plans_select"    ON public.pricing_plans FOR SELECT USING (true);
DROP POLICY IF EXISTS "pricing_plans_admin_all" ON public.pricing_plans;
CREATE POLICY "pricing_plans_admin_all" ON public.pricing_plans FOR ALL    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 7.15 trip_collaborators
ALTER TABLE public.trip_collaborators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "collaborators_select" ON public.trip_collaborators;
CREATE POLICY "collaborators_select" ON public.trip_collaborators FOR SELECT USING (public.can_view_trip(trip_id));
DROP POLICY IF EXISTS "collaborators_manage" ON public.trip_collaborators;
CREATE POLICY "collaborators_manage" ON public.trip_collaborators FOR ALL    USING (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid()) OR public.is_admin());

-- 7.16 place_reviews
ALTER TABLE public.place_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reviews_select" ON public.place_reviews;
CREATE POLICY "reviews_select" ON public.place_reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS "reviews_insert" ON public.place_reviews;
CREATE POLICY "reviews_insert" ON public.place_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "reviews_update" ON public.place_reviews;
CREATE POLICY "reviews_update" ON public.place_reviews FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "reviews_delete" ON public.place_reviews;
CREATE POLICY "reviews_delete" ON public.place_reviews FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- 7.17 pricing_plan_history
ALTER TABLE public.pricing_plan_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plan_history_select" ON public.pricing_plan_history;
CREATE POLICY "plan_history_select" ON public.pricing_plan_history FOR SELECT USING (public.is_admin());
DROP POLICY IF EXISTS "plan_history_modify" ON public.pricing_plan_history;
CREATE POLICY "plan_history_modify" ON public.pricing_plan_history FOR ALL    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 7.18 payment_webhook_logs
ALTER TABLE public.payment_webhook_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "webhook_logs_admin_all" ON public.payment_webhook_logs;
CREATE POLICY "webhook_logs_admin_all" ON public.payment_webhook_logs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 8. TRIGGERS & SECURITY FUNCTIONS
-- ---------------------------------------------------------------------------

-- 8.1 CHONG LEO QUYEN: Ngan chan nguoi dung tu sua role/is_premium/quota
CREATE OR REPLACE FUNCTION public.protect_profile_privilege_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (auth.jwt() ->> 'role') = 'service_role'
     OR auth.role() = 'service_role'
     OR current_user IN ('postgres', 'service_role', 'supabase_admin')
     OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Tu choi: Nguoi dung khong co quyen thay doi vai tro (role)!';
  END IF;

  IF NEW.is_premium IS DISTINCT FROM OLD.is_premium THEN
    RAISE EXCEPTION 'Tu choi: Nguoi dung khong co quyen thay doi trang thai premium!';
  END IF;

  IF NEW.premium_until IS DISTINCT FROM OLD.premium_until THEN
    RAISE EXCEPTION 'Tu choi: Nguoi dung khong co quyen thay doi thoi han premium (premium_until)!';
  END IF;

  IF NEW.quota_total IS DISTINCT FROM OLD.quota_total THEN
    RAISE EXCEPTION 'Tu choi: Nguoi dung khong co quyen thay doi tong han muc (quota_total)!';
  END IF;

  IF NEW.quota_used < OLD.quota_used THEN
    RAISE EXCEPTION 'Tu choi: Khong the giam so luot da su dung (quota_used)!';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileges BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_privilege_fields();

-- 8.2 Tu dong tao ho so khi nguoi dung dang ky tai khoan moi
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = CASE WHEN profiles.full_name = '' THEN EXCLUDED.full_name ELSE profiles.full_name END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 8.3 Tu dong cap nhat updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trips_updated_at ON public.trips;
CREATE TRIGGER trg_trips_updated_at BEFORE UPDATE ON public.trips    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_partners_updated_at ON public.partners;
CREATE TRIGGER trg_partners_updated_at BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_reviews_updated_at ON public.place_reviews;
CREATE TRIGGER trg_reviews_updated_at BEFORE UPDATE ON public.place_reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8.4 Tu dong tang chi so thong ke cua doi tac (impressions / clicks / bookings)
CREATE OR REPLACE FUNCTION public.handle_partner_analytics_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.event_type = 'impression' THEN
    UPDATE public.partners SET impression_count = impression_count + 1 WHERE id = NEW.partner_id;
  ELSIF NEW.event_type = 'click' THEN
    UPDATE public.partners SET click_count = click_count + 1 WHERE id = NEW.partner_id;
  ELSIF NEW.event_type = 'booking' THEN
    UPDATE public.partners SET booking_count = booking_count + 1 WHERE id = NEW.partner_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_analytics_insert ON public.partner_analytics;
CREATE TRIGGER trg_analytics_insert AFTER INSERT ON public.partner_analytics
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_partner_analytics_insert();

-- 8.5 Tu dong tao share_token an toan khi bat is_public
CREATE OR REPLACE FUNCTION public.handle_trip_share_token()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_trip_share_toggle ON public.trips;
CREATE TRIGGER trg_trip_share_toggle BEFORE UPDATE ON public.trips
  FOR EACH ROW
  WHEN (NEW.is_public IS DISTINCT FROM OLD.is_public)
  EXECUTE FUNCTION public.handle_trip_share_token();

-- 8.6 Tu dong luu lich su thay doi gia goi cuoc
CREATE OR REPLACE FUNCTION public.log_pricing_plan_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.amount IS DISTINCT FROM NEW.amount THEN
    INSERT INTO public.pricing_plan_history (plan_id, old_amount, new_amount, changed_by)
    VALUES (NEW.id, OLD.amount, NEW.amount, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pricing_plan_audit ON public.pricing_plans;
CREATE TRIGGER trg_pricing_plan_audit AFTER UPDATE ON public.pricing_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.log_pricing_plan_history();

-- 8.7 Tu dong don dep cache dia diem het han (qua 30 ngay)
CREATE OR REPLACE FUNCTION public.cleanup_expired_places_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.places_cache
  WHERE expires_at < now();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_expired_places_cache IS 'Ham tu dong don dep cac dia diem OpenStreetMap da het han luu tru';

-- ---------------------------------------------------------------------------
-- 9. HIGH-PERFORMANCE INDEXES
-- ---------------------------------------------------------------------------
-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role            ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email           ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_quota           ON public.profiles(quota_used, quota_total);

-- Trips
CREATE INDEX IF NOT EXISTS idx_trips_user_id           ON public.trips(user_id);
CREATE INDEX IF NOT EXISTS idx_trips_status            ON public.trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_destination       ON public.trips(destination_city);
CREATE INDEX IF NOT EXISTS idx_trips_created_at        ON public.trips(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trips_share_token       ON public.trips(share_token) WHERE share_token IS NOT NULL;

-- Itinerary Days & Items
CREATE INDEX IF NOT EXISTS idx_days_trip_day           ON public.itinerary_days(trip_id, day_number);
CREATE INDEX IF NOT EXISTS idx_items_day_order         ON public.itinerary_items(day_id, order_index);
CREATE INDEX IF NOT EXISTS idx_items_partner_id        ON public.itinerary_items(partner_id) WHERE partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_google_place_id   ON public.itinerary_items(google_place_id) WHERE google_place_id IS NOT NULL;

-- Disruptions & Revisions
CREATE INDEX IF NOT EXISTS idx_disruptions_trip_id     ON public.disruption_events(trip_id);
CREATE INDEX IF NOT EXISTS idx_revisions_trip_created  ON public.itinerary_revisions(trip_id, created_at DESC);

-- Chat Messages
CREATE INDEX IF NOT EXISTS idx_chat_trip_created       ON public.trip_chat_messages(trip_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_user_general       ON public.trip_chat_messages(user_id, created_at ASC) WHERE trip_id IS NULL;

-- Partners & Geo Search
CREATE INDEX IF NOT EXISTS idx_partners_city_cat       ON public.partners(city, category);
CREATE INDEX IF NOT EXISTS idx_partners_active_prio    ON public.partners(active_status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_partner_event ON public.partner_analytics(partner_id, event_type);

-- Places Cache (Bounding box search index + GIN Trigram index)
CREATE INDEX IF NOT EXISTS idx_places_cache_geo        ON public.places_cache(lat, lng);
CREATE INDEX IF NOT EXISTS idx_places_cache_cat_geo    ON public.places_cache(category, lat, lng);
CREATE INDEX IF NOT EXISTS idx_places_cache_name       ON public.places_cache USING gin (name gin_trgm_ops);

-- Payments & Bookings
CREATE INDEX IF NOT EXISTS idx_payments_user_status    ON public.payment_orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_order_code     ON public.payment_orders(order_code);
CREATE INDEX IF NOT EXISTS idx_payments_created_at     ON public.payment_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id        ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_trip_id        ON public.bookings(trip_id);
CREATE INDEX IF NOT EXISTS idx_bookings_token          ON public.bookings(token);
CREATE INDEX IF NOT EXISTS idx_bookings_status         ON public.bookings(status);

-- Key Manager
CREATE INDEX IF NOT EXISTS idx_gemini_keys_rotation    ON public.gemini_api_keys(is_active, status, last_used_at ASC NULLS FIRST);

-- Collaborators & Reviews
CREATE INDEX IF NOT EXISTS idx_collaborators_lookup    ON public.trip_collaborators(trip_id, user_id);
CREATE INDEX IF NOT EXISTS idx_place_reviews_place     ON public.place_reviews(google_place_id);
CREATE INDEX IF NOT EXISTS idx_place_reviews_partner   ON public.place_reviews(partner_id);

-- ---------------------------------------------------------------------------
-- 10. SUPABASE AUTH CUSTOM CLAIMS HOOK
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
    REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
    GRANT SELECT ON public.profiles TO supabase_auth_admin;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 11. ADMIN DASHBOARD VIEWS
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
  (SELECT COUNT(*) FROM public.partners WHERE active_status = true)                     AS active_partners,
  (SELECT COALESCE(SUM(amount), 0) FROM public.payment_orders WHERE status = 'completed') AS total_revenue;

-- ---------------------------------------------------------------------------
-- 12. SEED DATA (Bang gia mac dinh & Han muc tap trung)
-- ---------------------------------------------------------------------------
INSERT INTO public.pricing_plans (
  id, amount, label, duration_days, quota_total_grant, is_unlimited, features, is_active
) VALUES
  ('starter',   29000, 'Gói Khởi Động',          30, 10,   false, ARRAY['10 chuyến đi / tháng', 'Dự báo thời tiết & OpenStreetMap', 'AI điều chỉnh lịch trình'], true),
  ('plus',      29000, 'Gói Khởi Động (Alias)',  30, 10,   false, ARRAY['10 chuyến đi / tháng', 'Dự báo thời tiết & OpenStreetMap', 'AI điều chỉnh lịch trình'], true),
  ('premium',   49000, 'Gói Chuyên Nghiệp',      30, 9999, true,  ARRAY['Không giới hạn chuyến đi', 'Tự động xử lý sự cố thông minh', 'Chatbot AI không giới hạn'], true),
  ('pro',       49000, 'Gói Chuyên Nghiệp (Pro)',30, 9999, true,  ARRAY['Không giới hạn chuyến đi', 'Tự động xử lý sự cố thông minh', 'Chatbot AI không giới hạn'], true),
  ('monthly',   49000, 'Gói Hàng Tháng',         30, 9999, true,  ARRAY['Không giới hạn chuyến đi', 'Tự động xử lý sự cố thông minh', 'Chatbot AI không giới hạn'], true),
  ('quarterly', 119000, 'Gói 3 Tháng Tiết Kiệm', 90, 9999, true,  ARRAY['Không giới hạn chuyến đi 90 ngày', 'Mọi tính năng gói Pro', 'Tiết kiệm 20%'], true)
ON CONFLICT (id) DO NOTHING;

/*
-- =============================================================================
-- TRUY VẤN TIỆN ÍCH KIỂM TRA & BÙ ĐƠN THANH TOÁN BỊ KẸT (AUDIT & REMEDIATION)
-- =============================================================================

-- 1. KIỂM TRA: Tìm các đơn hàng đã thanh toán thành công nhưng chưa kích hoạt Premium
SELECT 
  o.id AS order_id,
  o.order_code,
  o.user_id,
  p.full_name,
  o.amount,
  o.plan,
  o.status AS order_status,
  o.created_at AS order_created_at,
  p.is_premium AS current_is_premium,
  p.premium_until,
  p.quota_total
FROM public.payment_orders o
JOIN public.profiles p ON o.user_id = p.id
WHERE o.status = 'completed'
  AND (p.is_premium = false OR p.premium_until IS NULL OR p.premium_until < now())
ORDER BY o.created_at DESC;

-- 2. BÙ TỰ ĐỘNG: Kích hoạt Premium 30 ngày & hạn mức 9999 cho các tài khoản bị kẹt trên
UPDATE public.profiles p
SET 
  is_premium = true,
  premium_until = now() + interval '30 days',
  quota_total = GREATEST(p.quota_total, 9999),
  updated_at = now()
FROM public.payment_orders o
WHERE p.id = o.user_id
  AND o.status = 'completed'
  AND (p.is_premium = false OR p.premium_until IS NULL OR p.premium_until < now());
*/
