create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Schema is prepared for Supabase Auth. Until app auth is added, app data should remain in
-- AsyncStorage and any database tests should use a controlled local test user id created manually.

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  nutrition_goal text,
  nutrition_style text,
  age integer,
  sex text,
  height_cm numeric,
  weight_kg numeric,
  activity_level text,
  target_calories integer,
  target_protein numeric,
  target_carbs numeric,
  target_fat numeric,
  nutrition_profile_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists nutrition_goal text,
add column if not exists nutrition_style text,
add column if not exists age integer,
add column if not exists sex text,
add column if not exists height_cm numeric,
add column if not exists weight_kg numeric,
add column if not exists activity_level text,
add column if not exists target_calories integer,
add column if not exists target_protein numeric,
add column if not exists target_carbs numeric,
add column if not exists target_fat numeric,
add column if not exists nutrition_profile_updated_at timestamptz;

create table if not exists public.token_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  balance integer not null default 50 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.token_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  wallet_id uuid references public.token_wallets(id) on delete set null,
  type text not null check (type in ('initial', 'spend', 'purchase_test')),
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  food_key text,
  name text not null,
  source text,
  calories integer not null check (calories >= 0),
  quantity text,
  quantity_value numeric,
  unit text,
  protein numeric,
  carbs numeric,
  fat numeric,
  base_quantity numeric,
  base_calories integer,
  base_protein numeric,
  base_carbs numeric,
  base_fat numeric,
  meal_label text,
  entry_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.food_entries
add column if not exists source text;

alter table if exists public.food_entries
add column if not exists base_quantity numeric;

alter table if exists public.food_entries
add column if not exists base_calories integer;

alter table if exists public.food_entries
add column if not exists base_protein numeric;

alter table if exists public.food_entries
add column if not exists base_carbs numeric;

alter table if exists public.food_entries
add column if not exists base_fat numeric;

alter table if exists public.food_entries
add column if not exists meal_label text;

alter table if exists public.food_entries
add column if not exists entry_date date;

create table if not exists public.custom_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  food_key text,
  barcode text,
  name text not null,
  category text,
  base_quantity numeric not null check (base_quantity > 0),
  unit text not null,
  calories integer not null default 0 check (calories >= 0),
  base_calories integer check (base_calories > 0),
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  keywords text[] not null default '{}',
  serving_presets jsonb,
  source text not null default 'custom' check (source in ('custom', 'barcode')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table if exists public.custom_foods
add column if not exists food_key text;

alter table if exists public.custom_foods
add column if not exists calories integer;

alter table if exists public.custom_foods
alter column calories set default 0;

alter table if exists public.custom_foods
alter column base_calories drop not null;

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category text not null default 'Meals',
  source text not null default 'meal',
  base_quantity numeric not null default 1,
  unit text not null default 'meal',
  calories integer not null check (calories >= 0),
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table if exists public.meals
add column if not exists category text not null default 'Meals';

alter table if exists public.meals
add column if not exists source text not null default 'meal';

alter table if exists public.meals
add column if not exists base_quantity numeric not null default 1;

alter table if exists public.meals
add column if not exists unit text not null default 'meal';

create table if not exists public.meal_ingredients (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  food_id text not null,
  source text,
  name text not null,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  calories integer not null check (calories >= 0),
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  base_quantity numeric,
  base_calories integer,
  base_protein numeric,
  base_carbs numeric,
  base_fat numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.meal_ingredients
add column if not exists source text;

create table if not exists public.scanned_foods_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  barcode text not null,
  food_key text,
  name text not null,
  category text,
  base_quantity numeric not null check (base_quantity > 0),
  unit text not null,
  calories integer,
  base_calories integer not null check (base_calories > 0),
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  base_protein numeric not null default 0,
  base_carbs numeric not null default 0,
  base_fat numeric not null default 0,
  keywords text[] not null default '{}',
  serving_presets jsonb,
  source text not null default 'barcode' check (source = 'barcode'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, barcode)
);

alter table if exists public.scanned_foods_cache
add column if not exists category text;

alter table if exists public.scanned_foods_cache
add column if not exists food_key text;

alter table if exists public.scanned_foods_cache
add column if not exists base_quantity numeric not null default 100;

alter table if exists public.scanned_foods_cache
add column if not exists unit text not null default 'g';

alter table if exists public.scanned_foods_cache
add column if not exists calories integer;

alter table if exists public.scanned_foods_cache
add column if not exists base_calories integer not null default 1;

alter table if exists public.scanned_foods_cache
add column if not exists protein numeric not null default 0;

alter table if exists public.scanned_foods_cache
add column if not exists carbs numeric not null default 0;

alter table if exists public.scanned_foods_cache
add column if not exists fat numeric not null default 0;

alter table if exists public.scanned_foods_cache
add column if not exists base_protein numeric not null default 0;

alter table if exists public.scanned_foods_cache
add column if not exists base_carbs numeric not null default 0;

alter table if exists public.scanned_foods_cache
add column if not exists base_fat numeric not null default 0;

alter table if exists public.scanned_foods_cache
add column if not exists keywords text[] not null default '{}';

alter table if exists public.scanned_foods_cache
add column if not exists serving_presets jsonb;

alter table if exists public.scanned_foods_cache
add column if not exists source text not null default 'barcode';

create index if not exists food_entries_user_date_idx on public.food_entries(user_id, entry_date desc, created_at desc);
create index if not exists token_transactions_user_created_idx on public.token_transactions(user_id, created_at desc);
create index if not exists custom_foods_user_name_idx on public.custom_foods(user_id, lower(name));
create index if not exists meals_user_name_idx on public.meals(user_id, lower(name));
create index if not exists meal_ingredients_meal_id_idx on public.meal_ingredients(meal_id);
create index if not exists scanned_foods_user_barcode_idx on public.scanned_foods_cache(user_id, barcode);

create table if not exists public.daily_logging_streaks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_logged_date date,
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists daily_logging_streaks_user_idx on public.daily_logging_streaks(user_id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists token_wallets_set_updated_at on public.token_wallets;
create trigger token_wallets_set_updated_at
before update on public.token_wallets
for each row execute function public.set_updated_at();

drop trigger if exists token_transactions_set_updated_at on public.token_transactions;
create trigger token_transactions_set_updated_at
before update on public.token_transactions
for each row execute function public.set_updated_at();

drop trigger if exists food_entries_set_updated_at on public.food_entries;
create trigger food_entries_set_updated_at
before update on public.food_entries
for each row execute function public.set_updated_at();

drop trigger if exists custom_foods_set_updated_at on public.custom_foods;
create trigger custom_foods_set_updated_at
before update on public.custom_foods
for each row execute function public.set_updated_at();

drop trigger if exists meals_set_updated_at on public.meals;
create trigger meals_set_updated_at
before update on public.meals
for each row execute function public.set_updated_at();

drop trigger if exists meal_ingredients_set_updated_at on public.meal_ingredients;
create trigger meal_ingredients_set_updated_at
before update on public.meal_ingredients
for each row execute function public.set_updated_at();

drop trigger if exists scanned_foods_cache_set_updated_at on public.scanned_foods_cache;
create trigger scanned_foods_cache_set_updated_at
before update on public.scanned_foods_cache
for each row execute function public.set_updated_at();

drop trigger if exists daily_logging_streaks_set_updated_at on public.daily_logging_streaks;
create trigger daily_logging_streaks_set_updated_at
before update on public.daily_logging_streaks
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.token_wallets enable row level security;
alter table public.token_transactions enable row level security;
alter table public.food_entries enable row level security;
alter table public.custom_foods enable row level security;
alter table public.meals enable row level security;
alter table public.meal_ingredients enable row level security;
alter table public.scanned_foods_cache enable row level security;
alter table public.daily_logging_streaks enable row level security;

-- Future auth policies: every user-owned table is restricted to auth.uid() = user_id.
-- These policies are intentionally strict. The app should keep using AsyncStorage until
-- authentication and user id creation are wired in.

drop policy if exists "Users can manage own profile" on public.profiles;
create policy "Users can manage own profile"
on public.profiles for all
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can manage own token wallets" on public.token_wallets;
create policy "Users can manage own token wallets"
on public.token_wallets for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own token transactions" on public.token_transactions;
create policy "Users can manage own token transactions"
on public.token_transactions for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Temporary no-auth development policies.
-- Remove these when real Supabase Auth is added. They allow the Expo app, using only the
-- anon key, to create a local test profile and sync the token wallet during MVP testing.

drop policy if exists "Temporary anon can manage test profiles" on public.profiles;
create policy "Temporary anon can manage test profiles"
on public.profiles for all
to anon
using (true)
with check (true);

drop policy if exists "Temporary anon can manage test token wallets" on public.token_wallets;
create policy "Temporary anon can manage test token wallets"
on public.token_wallets for all
to anon
using (true)
with check (true);

drop policy if exists "Temporary anon can manage test token transactions" on public.token_transactions;
create policy "Temporary anon can manage test token transactions"
on public.token_transactions for all
to anon
using (true)
with check (true);

drop policy if exists "Temporary anon can manage test food entries" on public.food_entries;
create policy "Temporary anon can manage test food entries"
on public.food_entries for all
to anon
using (true)
with check (true);

drop policy if exists "Temporary anon can manage test custom foods" on public.custom_foods;
create policy "Temporary anon can manage test custom foods"
on public.custom_foods for all
to anon
using (true)
with check (true);

drop policy if exists "Temporary anon can manage test meals" on public.meals;
create policy "Temporary anon can manage test meals"
on public.meals for all
to anon
using (true)
with check (true);

drop policy if exists "Temporary anon can manage test meal ingredients" on public.meal_ingredients;
create policy "Temporary anon can manage test meal ingredients"
on public.meal_ingredients for all
to anon
using (true)
with check (true);

drop policy if exists "Temporary anon can manage test scanned foods cache" on public.scanned_foods_cache;
create policy "Temporary anon can manage test scanned foods cache"
on public.scanned_foods_cache for all
to anon
using (true)
with check (true);

drop policy if exists "Temporary anon can manage test daily logging streaks" on public.daily_logging_streaks;
create policy "Temporary anon can manage test daily logging streaks"
on public.daily_logging_streaks for all
to anon
using (true)
with check (true);

drop policy if exists "Users can manage own food entries" on public.food_entries;
create policy "Users can manage own food entries"
on public.food_entries for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own custom foods" on public.custom_foods;
create policy "Users can manage own custom foods"
on public.custom_foods for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own meals" on public.meals;
create policy "Users can manage own meals"
on public.meals for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own meal ingredients" on public.meal_ingredients;
create policy "Users can manage own meal ingredients"
on public.meal_ingredients for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own scanned foods cache" on public.scanned_foods_cache;
create policy "Users can manage own scanned foods cache"
on public.scanned_foods_cache for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own daily logging streaks" on public.daily_logging_streaks;
create policy "Users can manage own daily logging streaks"
on public.daily_logging_streaks for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
