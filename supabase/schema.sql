-- Tanda · Ukhali Tanda — database schema for Supabase (Postgres).
-- Run once: Supabase dashboard → SQL Editor → paste → Run.
--
-- The game's server functions (api/*.ts on Vercel) are the only thing that talks to these tables,
-- using the service-role key. Row-level security is ON with no policies, so the public anon key
-- (and anyone in a browser) can't read or write anything directly.

-- Everything keyed: players, sessions (token hashes), recovery codes and saves (JSONB).
create table if not exists public.kv (
  key        text primary key,
  value      jsonb not null,
  rev        bigint not null default 0,          -- bumps on every save write; stale writes are refused
  updated_at timestamptz not null default now()
);

-- The public leaderboard: one row per farmer, updated after every accepted move.
create table if not exists public.leaderboard (
  player_id  text primary key,
  name       text not null,
  net_worth  bigint not null default 0,
  title      text not null default 'Small farmer',
  missions   int not null default 0,
  sarpanch   boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists leaderboard_worth on public.leaderboard (net_worth desc, updated_at asc);

-- keep kv.updated_at honest
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists kv_touch on public.kv;
create trigger kv_touch before update on public.kv for each row execute function public.touch_updated_at();

alter table public.kv enable row level security;
alter table public.leaderboard enable row level security;
-- (no policies on purpose: only the service role, which bypasses RLS, may touch these)

-- Later, for sign-up (Supabase Auth): link an auth user to the guest farm they already have.
create table if not exists public.accounts (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  player_id  text not null unique,
  created_at timestamptz not null default now()
);
alter table public.accounts enable row level security;
