-- PERFECT FISHING VR - core schema
-- All economy-changing writes happen through SECURITY DEFINER functions that are only
-- executable by the service_role (i.e. from Edge Functions), never from the browser.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 20 and username ~ '^[A-Za-z0-9_]+$'),
  coins integer not null default 250 check (coins >= 0),
  xp integer not null default 0 check (xp >= 0),
  level integer not null default 1,
  equipped_rod text not null default 'willow_starter',
  total_catches integer not null default 0,
  total_perfects integer not null default 0,
  best_score integer not null default 0,
  total_score bigint not null default 0,
  legendary_catches integer not null default 0,
  pvp_wins integer not null default 0,
  pvp_losses integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- rods owned
create table if not exists public.player_rods (
  user_id uuid not null references public.profiles(id) on delete cascade,
  rod_id text not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id, rod_id)
);

-- ---------------------------------------------------------------- fishing sessions (server-authoritative)
create table if not exists public.fishing_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  world_id text not null,
  rod_id text not null,
  seed bigint not null,
  species_id text not null,
  rarity text not null,
  length_cm numeric(7,1) not null,
  weight_kg numeric(10,3) not null,
  variant text not null default 'normal',
  bite_delay numeric(6,2) not null,
  event_id text not null default 'none',
  luck numeric(5,3) not null default 0,
  status text not null default 'active' check (status in ('active','caught','escaped','snapped','missed','abandoned','rejected','expired')),
  result jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists fishing_sessions_user_idx on public.fishing_sessions(user_id, started_at desc);
create index if not exists fishing_sessions_active_idx on public.fishing_sessions(user_id) where status = 'active';

-- ---------------------------------------------------------------- inventory of caught fish
create table if not exists public.fish_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.fishing_sessions(id) on delete set null,
  species_id text not null,
  rarity text not null,
  world_id text not null,
  length_cm numeric(7,1) not null,
  weight_kg numeric(10,3) not null,
  variant text not null default 'normal',
  score integer not null default 0,
  perfects integer not null default 0,
  value integer not null check (value >= 0),
  sold boolean not null default false,
  caught_at timestamptz not null default now(),
  sold_at timestamptz
);
create index if not exists fish_inventory_user_idx on public.fish_inventory(user_id, sold, caught_at desc);

-- ---------------------------------------------------------------- personal catalogue / discoveries
create table if not exists public.fish_discoveries (
  user_id uuid not null references public.profiles(id) on delete cascade,
  species_id text not null,
  first_caught_at timestamptz not null default now(),
  catch_count integer not null default 1,
  best_weight_kg numeric(10,3) not null default 0,
  best_length_cm numeric(7,1) not null default 0,
  best_score integer not null default 0,
  primary key (user_id, species_id)
);

-- ---------------------------------------------------------------- PvP
create table if not exists public.pvp_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null default 'Fishing Duel',
  host_id uuid not null references public.profiles(id) on delete cascade,
  is_private boolean not null default false,
  max_players integer not null default 4 check (max_players between 2 and 8),
  world_id text not null default 'lake',
  status text not null default 'lobby' check (status in ('lobby','countdown','active','finished','cancelled')),
  seed bigint,
  species_id text,
  weight_kg numeric(10,3),
  length_cm numeric(7,1),
  min_score integer not null default 600,
  prize integer not null default 150,
  starts_at timestamptz,
  ends_at timestamptz,
  winner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists pvp_rooms_status_idx on public.pvp_rooms(status, is_private, created_at desc);

create table if not exists public.pvp_participants (
  room_id uuid not null references public.pvp_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  ready boolean not null default false,
  submitted boolean not null default false,
  result text,
  score integer not null default 0,
  perfects integer not null default 0,
  finish_t numeric(8,3),
  valid boolean,
  placement integer,
  joined_at timestamptz not null default now(),
  submitted_at timestamptz,
  primary key (room_id, user_id)
);
create index if not exists pvp_participants_user_idx on public.pvp_participants(user_id, joined_at desc);

create table if not exists public.pvp_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.pvp_rooms(id) on delete cascade,
  from_user uuid not null references public.profiles(id) on delete cascade,
  from_username text not null,
  to_user uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  created_at timestamptz not null default now()
);
create index if not exists pvp_invites_to_idx on public.pvp_invites(to_user, status);

-- ---------------------------------------------------------------- public views
create or replace view public.leaderboard
with (security_invoker = true) as
select id, username, level, xp, coins, total_catches, total_perfects, best_score, total_score,
       legendary_catches, pvp_wins, pvp_losses
from public.profiles;

create or replace view public.match_history
with (security_invoker = true) as
select p.user_id, r.id as room_id, r.code, r.name, r.world_id, r.species_id, r.status,
       r.winner_id, w.username as winner_name, r.finished_at, r.created_at,
       p.score, p.perfects, p.result, p.placement, p.finish_t, p.valid
from public.pvp_participants p
join public.pvp_rooms r on r.id = p.room_id
left join public.profiles w on w.id = r.winner_id;

-- ---------------------------------------------------------------- new user bootstrap
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_name text;
  final_name text;
  n integer := 0;
begin
  base_name := regexp_replace(coalesce(new.raw_user_meta_data->>'username', 'Angler'), '[^A-Za-z0-9_]', '', 'g');
  if char_length(base_name) < 3 then base_name := 'Angler'; end if;
  base_name := left(base_name, 14);
  final_name := base_name;
  while exists (select 1 from public.profiles where username = final_name) loop
    n := n + 1;
    final_name := base_name || (floor(random() * 90000) + 10000)::int::text;
    exit when n > 20;
  end loop;
  insert into public.profiles (id, username) values (new.id, final_name);
  insert into public.player_rods (user_id, rod_id) values (new.id, 'willow_starter');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
