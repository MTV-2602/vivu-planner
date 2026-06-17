-- Migration: Add Partners and Partner Analytics tables

-- ===== 9. partners =====
CREATE TABLE IF NOT EXISTS public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL, -- 'hotel' | 'homestay' | 'resort' | 'restaurant' | 'cafe' | 'attraction' | 'transport'
  address text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  city text NOT NULL,
  district text,
  contact_phone text,
  contact_email text,
  website_url text,
  booking_url text,
  description text,
  image_urls text[] DEFAULT '{}'::text[],
  price_level int DEFAULT 2, -- 1=budget, 2=mid, 3=upscale, 4=luxury
  cuisine_tags text[] DEFAULT '{}'::text[],
  amenity_tags text[] DEFAULT '{}'::text[],
  dietary_safe text[] DEFAULT '{}'::text[],
  admin_rating int DEFAULT 3, -- 1-5 internal score
  admin_notes text,
  partner_priority int DEFAULT 0, -- 0-10 priority
  active_status boolean DEFAULT true,
  impression_count int DEFAULT 0,
  click_count int DEFAULT 0,
  booking_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partners_public_select" ON public.partners
  FOR SELECT USING (true);

-- ===== 10. partner_analytics =====
CREATE TABLE IF NOT EXISTS public.partner_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- 'impression' | 'click' | 'booking' | 'skip'
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.partner_analytics ENABLE ROW LEVEL SECURITY;
