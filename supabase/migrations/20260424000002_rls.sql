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
