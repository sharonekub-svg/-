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
