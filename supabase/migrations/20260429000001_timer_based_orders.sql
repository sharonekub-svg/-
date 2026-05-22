-- Timer-based orders: no target amount. Orders close only by time.

alter type public.order_status add value if not exists 'locked';

alter table public.orders
  add column if not exists store_key text not null default 'manual',
  add column if not exists store_label text not null default 'Manual store',
  add column if not exists estimated_shipping_agorot integer not null default 0 check (estimated_shipping_agorot >= 0),
  add column if not exists free_shipping_threshold_agorot integer not null default 0 check (free_shipping_threshold_agorot >= 0),
  add column if not exists closes_at timestamptz,
  add column if not exists edit_locks_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists founder_checkout_url text;

create index if not exists orders_closes_at_idx on public.orders(closes_at);

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

  select * into v_order
  from public.orders
  where id = v_invite.order_id
  for update;

  if v_order.status not in ('open','paying') then
    raise exception 'order_closed' using errcode = 'P0005';
  end if;
  if v_order.closes_at is not null and v_order.closes_at <= now() then
    update public.orders
    set status = 'locked', locked_at = coalesce(locked_at, now())
    where id = v_order.id and status in ('open','paying');
    raise exception 'order_closed' using errcode = 'P0005';
  end if;

  select count(*) into v_count
  from public.participants
  where order_id = v_order.id;

  if v_count >= v_order.max_participants then
    raise exception 'order_full' using errcode = 'P0006';
  end if;

  select id into v_pid
  from public.participants
  where order_id = v_order.id and user_id = p_user_id;

  if v_pid is not null then
    return jsonb_build_object('orderId', v_order.id, 'participantId', v_pid, 'already', true);
  end if;

  v_amount := ceil((v_order.product_price_agorot + v_order.estimated_shipping_agorot)::numeric / v_order.max_participants);

  insert into public.participants (order_id, user_id, status, amount_agorot)
  values (v_order.id, p_user_id, 'joined', v_amount)
  returning id into v_pid;

  update public.invites
  set uses_count = uses_count + 1
  where id = v_invite.id;

  return jsonb_build_object('orderId', v_order.id, 'participantId', v_pid, 'already', false);
end
$$;
