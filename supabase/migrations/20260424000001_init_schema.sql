-- Shakana core schema
-- Single source of truth. Every user action maps back to a row here.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ── Enums ────────────────────────────────────────────────────────────────
do $$ begin
  create type order_status as enum (
    'draft','open','paying','escrow','delivered','completed','cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type participant_status as enum ('invited','joined','paid','refunded');
exception when duplicate_object then null; end $$;

-- ── Buildings: aggregate neighbors by physical location ──────────────────
create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  street text not null,
  building_number text not null,
  created_at timestamptz not null default now(),
  unique (city, street, building_number)
);

-- ── Profiles: one per auth user ──────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text not null,
  city text not null default '',
  street text not null default '',
  building text not null default '',
  apt text not null default '',
  floor text,
  building_id uuid references public.buildings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_building_idx on public.profiles(building_id);

-- ── Orders: group purchase ───────────────────────────────────────────────
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  building_id uuid references public.buildings(id) on delete set null,
  product_url text not null,
  product_title text,
  product_image text,
  product_price_agorot integer not null check (product_price_agorot > 0),
  max_participants integer not null check (max_participants between 2 and 12),
  status order_status not null default 'open',
  stripe_transfer_group text,
  delivery_confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_creator_idx on public.orders(creator_id);
create index if not exists orders_building_idx on public.orders(building_id);
create index if not exists orders_status_idx on public.orders(status);

-- ── Participants: membership per order ──────────────────────────────────
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status participant_status not null default 'joined',
  amount_agorot integer not null check (amount_agorot > 0),
  stripe_payment_intent_id text,
  joined_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz,
  unique (order_id, user_id)
);

create index if not exists participants_order_idx on public.participants(order_id);
create index if not exists participants_user_idx on public.participants(user_id);

-- ── Order items: user-provided product details for the shared basket ────
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  title text not null,
  ref text,
  size text,
  price_agorot integer not null check (price_agorot >= 0),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items(order_id);

-- ── Invites: cryptographically-random tokens with TTL + uses ────────────
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  token text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  max_uses integer not null default 20,
  uses_count integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists invites_order_idx on public.invites(order_id);

-- ── Payments: authoritative ledger; only mutated by webhook ─────────────
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  stripe_pi_id text not null unique,
  amount_agorot integer not null check (amount_agorot > 0),
  status text not null,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_order_idx on public.payments(order_id);

-- ── Webhook events: idempotency ledger ──────────────────────────────────
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  stripe_event_id text not null unique,
  type text not null,
  processed_at timestamptz not null default now(),
  payload jsonb not null
);
