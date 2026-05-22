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
