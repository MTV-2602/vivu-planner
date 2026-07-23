create extension if not exists "pgcrypto";

-- ===== ENUMS =====
create type traveler_type as enum ('solo','couple','family','friends','other');
create type trip_status as enum ('draft','active','completed','cancelled');
create type item_type as enum ('accommodation','transport','dining','attraction','rental','experience');
create type item_status as enum ('planned','confirmed','skipped','replaced');
create type disruption_type as enum ('delay','budget_shortage','health_issue','weather_change','other');

-- ===== 1. profiles =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  role text default 'user' check (role in ('user', 'admin')),
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

-- ===== 2. trips =====
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  destination_city text not null,
  destination_province text,
  start_date date not null,
  end_date date not null,
  budget_total numeric not null,
  budget_currency text default 'VND',
  traveler_count int default 1,
  traveler_type traveler_type default 'solo',
  preferences jsonb default '{}'::jsonb,
  health_conditions text,
  special_requirements text,
  status trip_status default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.trips enable row level security;
create policy "trips_owner_all" on public.trips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===== 3. itinerary_days =====
create table public.itinerary_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_number int not null,
  date date not null,
  weather_summary jsonb,
  notes text,
  unique (trip_id, day_number)
);
alter table public.itinerary_days enable row level security;
create policy "days_owner_all" on public.itinerary_days
  for all using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

-- ===== 4. itinerary_items =====
create table public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.itinerary_days(id) on delete cascade,
  item_type item_type not null,
  title text not null,
  description text,
  start_time time,
  end_time time,
  location_name text,
  location_lat double precision,
  location_lng double precision,
  google_place_id text,
  estimated_cost numeric,
  booking_url text,
  order_index int default 0,
  status item_status default 'planned',
  created_at timestamptz default now()
);
alter table public.itinerary_items enable row level security;
create policy "items_owner_all" on public.itinerary_items
  for all using (exists (
    select 1 from public.itinerary_days d join public.trips t on t.id = d.trip_id
    where d.id = day_id and t.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.itinerary_days d join public.trips t on t.id = d.trip_id
    where d.id = day_id and t.user_id = auth.uid()
  ));

-- ===== 5. disruption_events =====
create table public.disruption_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_id uuid references public.itinerary_days(id) on delete set null,
  disruption_type disruption_type not null,
  description text,
  detected_at timestamptz default now(),
  resolved boolean default false,
  resolution_summary text
);
alter table public.disruption_events enable row level security;
create policy "disruptions_owner_all" on public.disruption_events
  for all using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

-- ===== 6. itinerary_revisions =====
create table public.itinerary_revisions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  disruption_event_id uuid references public.disruption_events(id) on delete set null,
  previous_snapshot jsonb not null,
  new_snapshot jsonb not null,
  created_at timestamptz default now()
);
alter table public.itinerary_revisions enable row level security;
create policy "revisions_owner_select" on public.itinerary_revisions
  for select using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

-- ===== 7. places_cache =====
create table public.places_cache (
  id uuid primary key default gen_random_uuid(),
  google_place_id text unique not null,
  name text,
  category text,
  lat double precision,
  lng double precision,
  rating numeric,
  price_level int,
  address text,
  raw_data jsonb,
  cached_at timestamptz default now()
);
alter table public.places_cache enable row level security;
create policy "places_cache_public_select" on public.places_cache for select using (true);

-- ===== 8. gemini_api_keys =====
create table public.gemini_api_keys (
  id uuid primary key default gen_random_uuid(),
  key_value text unique not null,
  is_active boolean default true,
  status text default 'active', -- 'active', 'rate_limited', 'invalid'
  usage_count int default 0,
  last_used_at timestamptz,
  created_at timestamptz default now()
);
alter table public.gemini_api_keys enable row level security;
-- No public policies, as only service role (backend admin client) queries this table.

-- ===== 9. partners =====
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null, -- 'hotel' | 'homestay' | 'resort' | 'restaurant' | 'cafe' | 'attraction' | 'transport'
  address text not null,
  lat double precision not null,
  lng double precision not null,
  city text not null,
  district text,
  contact_phone text,
  contact_email text,
  website_url text,
  booking_url text,
  description text,
  image_urls text[] default '{}'::text[],
  price_level int default 2, -- 1=budget, 2=mid, 3=upscale, 4=luxury
  cuisine_tags text[] default '{}'::text[],
  amenity_tags text[] default '{}'::text[],
  dietary_safe text[] default '{}'::text[],
  admin_rating int default 3, -- 1-5 internal score
  admin_notes text,
  partner_priority int default 0, -- 0-10 priority
  active_status boolean default true,
  impression_count int default 0,
  click_count int default 0,
  booking_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.partners enable row level security;
create policy "partners_public_select" on public.partners for select using (true);

-- ===== 10. partner_analytics =====
create table public.partner_analytics (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  event_type text not null, -- 'impression' | 'click' | 'booking' | 'skip'
  trip_id uuid references public.trips(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
alter table public.partner_analytics enable row level security;

-- ===== 11. bookings =====
create table public.bookings (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  token text unique not null,
  guest_name text not null,
  guest_email text not null,
  guest_phone text,
  guest_count int default 1,
  items jsonb default '[]'::jsonb,
  total_cost numeric default 0,
  status text default 'pending', -- 'pending', 'confirmed', 'cancelled'
  confirmed_at timestamptz,
  created_at timestamptz default now()
);
alter table public.bookings enable row level security;
create policy "bookings_owner_all" on public.bookings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===== 12. payment_orders =====
create table public.payment_orders (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  method text not null,
  plan text not null,
  amount numeric not null,
  status text default 'pending', -- 'pending', 'completed', 'cancelled'
  order_code text not null,
  created_at timestamptz default now()
);
alter table public.payment_orders enable row level security;
create policy "payment_orders_owner_all" on public.payment_orders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===== 13. trip_chat_messages =====
create table if not exists public.trip_chat_messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('user', 'model')),
  content text not null,
  adapted_itinerary jsonb,
  diff text,
  previous_snapshot jsonb,
  is_create_trip boolean,
  create_trip_params jsonb,
  created_at timestamptz default now()
);
alter table public.trip_chat_messages enable row level security;
create policy "chat_messages_owner_all" on public.trip_chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

