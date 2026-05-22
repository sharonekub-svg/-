-- Notification preference foundation for opt-in building and friend order alerts.
-- Push delivery can read these rows after device push tokens are connected.

alter table public.profiles
  add column if not exists username text;

create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null and username <> '';

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  building_order_alerts boolean not null default false,
  friend_order_alerts boolean not null default false,
  order_updates boolean not null default true,
  payment_reminders boolean not null default true,
  product_alerts boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.friend_order_follows (
  follower_user_id uuid not null references auth.users(id) on delete cascade,
  friend_username text not null,
  created_at timestamptz not null default now(),
  primary key (follower_user_id, friend_username)
);

create index if not exists friend_order_follows_username_idx
  on public.friend_order_follows (lower(friend_username));
