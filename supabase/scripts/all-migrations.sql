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
-- Row-Level Security for every table. No table is readable by `anon`.
-- Service role bypasses RLS and is the only way inserts/updates happen
-- on payment-authoritative tables.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

alter table public.profiles       enable row level security;
alter table public.buildings      enable row level security;
alter table public.orders         enable row level security;
alter table public.participants   enable row level security;
alter table public.order_items    enable row level security;
alter table public.invites        enable row level security;
alter table public.payments       enable row level security;
alter table public.webhook_events enable row level security;

-- ── Profiles: users manage only their own row. ───────────────────────────
drop policy if exists "profiles self select" on public.profiles;
create policy "profiles self select" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles self upsert" on public.profiles;
create policy "profiles self upsert" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ── Buildings: readable by any authenticated user in the same building. ─
-- Clients only need building metadata by id (never list).
drop policy if exists "buildings member read" on public.buildings;
create policy "buildings member read" on public.buildings
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.building_id = buildings.id
    )
  );

-- ── Orders: creator OR a participant may read. ─────────────────────────
drop policy if exists "orders member read" on public.orders;
create policy "orders member read" on public.orders
  for select using (
    creator_id = auth.uid()
    or exists (
      select 1 from public.participants pp
      where pp.order_id = orders.id and pp.user_id = auth.uid()
    )
  );

-- Creation happens only via the `create-order` edge function which uses the
-- service role. No client-side inserts are allowed.
drop policy if exists "orders creator update" on public.orders;
create policy "orders creator update" on public.orders
  for update using (
    creator_id = auth.uid() and status in ('draft','open')
  ) with check (creator_id = auth.uid());

-- ── Participants: visible to other participants of the same order. ─────
drop policy if exists "participants co-member read" on public.participants;
create policy "participants co-member read" on public.participants
  for select using (
    exists (
      select 1 from public.participants pp
      where pp.order_id = participants.order_id and pp.user_id = auth.uid()
    )
  );

-- No client-side insert/update on participants; edge functions only.

-- ── Order items: visible to participants of the order. ─────────────────
drop policy if exists "order_items participants read" on public.order_items;
create policy "order_items participants read" on public.order_items
  for select using (
    exists (
      select 1 from public.participants pp
      where pp.order_id = order_items.order_id and pp.user_id = auth.uid()
    )
  );

drop policy if exists "order_items self write" on public.order_items;
create policy "order_items self write" on public.order_items
  for insert with check (
    exists (
      select 1 from public.participants pp
      where pp.id = order_items.participant_id and pp.user_id = auth.uid()
    )
  );

-- ── Invites / Payments / Webhook events: no client access whatsoever. ──
-- (No policies created → RLS blocks all non-service-role access.)
-- Server-side helpers. Called from edge functions under the service role.

-- Updated-at trigger helper.
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists t_profiles_updated on public.profiles;
create trigger t_profiles_updated
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

drop trigger if exists t_orders_updated on public.orders;
create trigger t_orders_updated
  before update on public.orders
  for each row execute function public.tg_set_updated_at();

drop trigger if exists t_payments_updated on public.payments;
create trigger t_payments_updated
  before update on public.payments
  for each row execute function public.tg_set_updated_at();

-- Link / create a building row when a profile completes its address.
create or replace function public.tg_link_building()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b_id uuid;
begin
  if (new.city = '' or new.street = '' or new.building = '') then
    return new;
  end if;

  select id into b_id
  from public.buildings
  where city = new.city and street = new.street and building_number = new.building
  limit 1;

  if b_id is null then
    insert into public.buildings (city, street, building_number)
    values (new.city, new.street, new.building)
    returning id into b_id;
  end if;

  new.building_id = b_id;
  return new;
end
$$;

drop trigger if exists t_profiles_link_building on public.profiles;
create trigger t_profiles_link_building
  before insert or update of city, street, building on public.profiles
  for each row execute function public.tg_link_building();

-- Transactional invite claim. Takes a row lock on the order so concurrent
-- joins on the last slot serialize cleanly.
create or replace function public.claim_invite(
  p_token text,
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite  public.invites%rowtype;
  v_order   public.orders%rowtype;
  v_count   integer;
  v_pid     uuid;
  v_amount  integer;
begin
  select * into v_invite
  from public.invites
  where token = p_token
  for update;

  if not found then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'invite_revoked' using errcode = 'P0002';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'invite_expired' using errcode = 'P0003';
  end if;
  if v_invite.uses_count >= v_invite.max_uses then
    raise exception 'invite_exhausted' using errcode = 'P0004';
  end if;

  -- Lock the order row so last-slot races serialize.
  select * into v_order
  from public.orders
  where id = v_invite.order_id
  for update;

  if v_order.status not in ('open','paying') then
    raise exception 'order_closed' using errcode = 'P0005';
  end if;

  select count(*) into v_count
  from public.participants
  where order_id = v_order.id;

  if v_count >= v_order.max_participants then
    raise exception 'order_full' using errcode = 'P0006';
  end if;

  -- Already joined? Idempotent success.
  select id into v_pid
  from public.participants
  where order_id = v_order.id and user_id = p_user_id;

  if v_pid is not null then
    return jsonb_build_object('orderId', v_order.id, 'participantId', v_pid, 'already', true);
  end if;

  v_amount := ceil(v_order.product_price_agorot::numeric / v_order.max_participants);

  insert into public.participants (order_id, user_id, status, amount_agorot)
  values (v_order.id, p_user_id, 'joined', v_amount)
  returning id into v_pid;

  update public.invites
  set uses_count = uses_count + 1
  where id = v_invite.id;

  return jsonb_build_object('orderId', v_order.id, 'participantId', v_pid, 'already', false);
end
$$;

-- Enforce invariants on order status transitions.
create or replace function public.tg_order_status_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'completed' and new.status <> 'completed' then
    raise exception 'cannot_transition_out_of_completed';
  end if;
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'cannot_transition_out_of_cancelled';
  end if;
  return new;
end
$$;

drop trigger if exists t_orders_status_guard on public.orders;
create trigger t_orders_status_guard
  before update of status on public.orders
  for each row execute function public.tg_order_status_guard();

-- Realtime publication: allow clients to subscribe to orders + participants.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'orders'
  ) then
    execute 'alter publication supabase_realtime add table public.orders';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'participants'
  ) then
    execute 'alter publication supabase_realtime add table public.participants';
  end if;
end $$;

-- Delivery and pickup lifecycle.
-- Keeps Shakana out of external checkout automation and makes completion depend
-- on actual participant receipt confirmations.

alter table public.orders
  add column if not exists pickup_responsible_user_id uuid references auth.users(id) on delete set null,
  add column if not exists pickup_responsible_name text not null default '',
  add column if not exists preferred_pickup_location text not null default '',
  add column if not exists pickup_location_note text not null default 'Pickup location may vary depending on the store/shipping provider',
  add column if not exists shipping_status text not null default 'not_shipped',
  add column if not exists shipped_at timestamptz,
  add column if not exists ready_for_pickup_at timestamptz,
  add column if not exists picked_up_at timestamptz,
  add column if not exists ready_for_distribution_at timestamptz;

do $$ begin
  alter table public.orders
    add constraint orders_shipping_status_check
    check (shipping_status in (
      'not_shipped',
      'shipped',
      'ready_for_pickup',
      'picked_up',
      'ready_for_distribution'
    ));
exception when duplicate_object then null; end $$;

alter table public.participants
  add column if not exists delivered_to_user_at timestamptz,
  add column if not exists received_confirmed_at timestamptz;

create index if not exists orders_pickup_responsible_idx
  on public.orders(pickup_responsible_user_id);

create index if not exists participants_delivery_order_idx
  on public.participants(order_id, delivered_to_user_at, received_confirmed_at);
