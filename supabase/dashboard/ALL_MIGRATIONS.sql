-- ===== 20261106000001_schema.sql
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

-- ===== 20261106000002_rls.sql
-- Row Level Security: players can read what they need, but cannot write
-- coins, xp, inventory, sessions or match results directly.

alter table public.profiles enable row level security;
alter table public.player_rods enable row level security;
alter table public.fishing_sessions enable row level security;
alter table public.fish_inventory enable row level security;
alter table public.fish_discoveries enable row level security;
alter table public.pvp_rooms enable row level security;
alter table public.pvp_participants enable row level security;
alter table public.pvp_invites enable row level security;

-- profiles: public read (leaderboard), owner may only update username/settings (column grants below)
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (true);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (username, settings) on public.profiles to authenticated;

-- owned rods: read own
drop policy if exists rods_read_own on public.player_rods;
create policy rods_read_own on public.player_rods for select using (auth.uid() = user_id);
revoke insert, update, delete on public.player_rods from anon, authenticated;
grant select on public.player_rods to authenticated;

-- sessions: read own (seed is only meaningful together with the server checks)
drop policy if exists sessions_read_own on public.fishing_sessions;
create policy sessions_read_own on public.fishing_sessions for select using (auth.uid() = user_id);
revoke insert, update, delete on public.fishing_sessions from anon, authenticated;
grant select on public.fishing_sessions to authenticated;

-- inventory
drop policy if exists inventory_read_own on public.fish_inventory;
create policy inventory_read_own on public.fish_inventory for select using (auth.uid() = user_id);
revoke insert, update, delete on public.fish_inventory from anon, authenticated;
grant select on public.fish_inventory to authenticated;

-- discoveries
drop policy if exists discoveries_read_own on public.fish_discoveries;
create policy discoveries_read_own on public.fish_discoveries for select using (auth.uid() = user_id);
revoke insert, update, delete on public.fish_discoveries from anon, authenticated;
grant select on public.fish_discoveries to authenticated;

-- helper used by policies (security definer avoids recursive RLS on participants)
create or replace function public.is_room_member(p_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pvp_participants where room_id = p_room and user_id = auth.uid());
$$;
grant execute on function public.is_room_member(uuid) to authenticated;

-- rooms: public rooms visible to everyone logged in, private rooms only to members / invitees
drop policy if exists rooms_read on public.pvp_rooms;
create policy rooms_read on public.pvp_rooms for select to authenticated using (
  is_private = false
  or host_id = auth.uid()
  or public.is_room_member(pvp_rooms.id)
  or exists (select 1 from public.pvp_invites i where i.room_id = pvp_rooms.id and i.to_user = auth.uid())
);
revoke insert, update, delete on public.pvp_rooms from anon, authenticated;
grant select on public.pvp_rooms to authenticated;

drop policy if exists participants_read on public.pvp_participants;
create policy participants_read on public.pvp_participants for select to authenticated using (
  exists (select 1 from public.pvp_rooms r where r.id = room_id and (r.is_private = false or public.is_room_member(r.id)))
);
revoke insert, update, delete on public.pvp_participants from anon, authenticated;
grant select on public.pvp_participants to authenticated;

drop policy if exists invites_read on public.pvp_invites;
create policy invites_read on public.pvp_invites for select to authenticated using (to_user = auth.uid() or from_user = auth.uid());
revoke insert, update, delete on public.pvp_invites from anon, authenticated;
grant select on public.pvp_invites to authenticated;

grant select on public.leaderboard to anon, authenticated;
grant select on public.match_history to authenticated;

-- ===== 20261106000003_functions.sql
-- Transactional game functions. EXECUTE is granted to service_role only:
-- they are called by Edge Functions after the server re-simulated / validated the action.

create or replace function public.fn_level_for_xp(p_xp integer)
returns integer language plpgsql immutable as $$
declare lvl integer := 1;
begin
  while p_xp >= floor(100 * power(lvl, 1.6)) loop lvl := lvl + 1; end loop;
  return lvl;
end; $$;

-- Close a fishing session. Inserts the fish when caught. Idempotent per session.
create or replace function public.fn_complete_catch(
  p_session uuid,
  p_status text,
  p_result jsonb,
  p_value integer,
  p_xp integer,
  p_score integer,
  p_perfects integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.fishing_sessions%rowtype;
  inv_id uuid;
  is_new boolean := false;
  prof public.profiles%rowtype;
begin
  select * into s from public.fishing_sessions where id = p_session for update;
  if not found then raise exception 'session_not_found'; end if;
  if s.status <> 'active' then raise exception 'session_already_closed'; end if;

  update public.fishing_sessions
     set status = p_status, result = p_result, completed_at = now()
   where id = p_session;

  if p_status = 'caught' then
    insert into public.fish_inventory (user_id, session_id, species_id, rarity, world_id, length_cm, weight_kg, variant, score, perfects, value)
    values (s.user_id, s.id, s.species_id, s.rarity, s.world_id, s.length_cm, s.weight_kg, s.variant, p_score, p_perfects, p_value)
    returning id into inv_id;

    is_new := not exists (select 1 from public.fish_discoveries where user_id = s.user_id and species_id = s.species_id);
    insert into public.fish_discoveries as d (user_id, species_id, best_weight_kg, best_length_cm, best_score)
    values (s.user_id, s.species_id, s.weight_kg, s.length_cm, p_score)
    on conflict (user_id, species_id) do update
      set catch_count = d.catch_count + 1,
          best_weight_kg = greatest(d.best_weight_kg, excluded.best_weight_kg),
          best_length_cm = greatest(d.best_length_cm, excluded.best_length_cm),
          best_score = greatest(d.best_score, excluded.best_score);

    update public.profiles
       set xp = xp + p_xp,
           level = public.fn_level_for_xp(xp + p_xp),
           total_catches = total_catches + 1,
           total_perfects = total_perfects + p_perfects,
           total_score = total_score + p_score,
           best_score = greatest(best_score, p_score),
           legendary_catches = legendary_catches + case when s.rarity = 'L' then 1 else 0 end
     where id = s.user_id;
  else
    update public.profiles
       set xp = xp + greatest(0, p_xp),
           level = public.fn_level_for_xp(xp + greatest(0, p_xp)),
           total_perfects = total_perfects + p_perfects
     where id = s.user_id;
  end if;

  select * into prof from public.profiles where id = s.user_id;
  return jsonb_build_object('inventory_id', inv_id, 'new_discovery', is_new, 'coins', prof.coins, 'xp', prof.xp, 'level', prof.level);
end; $$;

create or replace function public.fn_purchase_rod(p_user uuid, p_rod text, p_price integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c integer;
begin
  if p_price < 0 then raise exception 'bad_price'; end if;
  if exists (select 1 from public.player_rods where user_id = p_user and rod_id = p_rod) then
    raise exception 'already_owned';
  end if;
  select coins into c from public.profiles where id = p_user for update;
  if c is null then raise exception 'profile_not_found'; end if;
  if c < p_price then raise exception 'not_enough_coins'; end if;
  update public.profiles set coins = coins - p_price where id = p_user;
  insert into public.player_rods (user_id, rod_id) values (p_user, p_rod);
  return jsonb_build_object('coins', c - p_price);
end; $$;

create or replace function public.fn_equip_rod(p_user uuid, p_rod text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.player_rods where user_id = p_user and rod_id = p_rod) then
    raise exception 'not_owned';
  end if;
  update public.profiles set equipped_rod = p_rod where id = p_user;
  return jsonb_build_object('equipped_rod', p_rod);
end; $$;

-- Sell fish: value was fixed by the server at catch time.
create or replace function public.fn_sell_fish(p_user uuid, p_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare total integer; n integer; c integer;
begin
  with sold as (
    update public.fish_inventory
       set sold = true, sold_at = now()
     where user_id = p_user and id = any(p_ids) and sold = false
     returning value
  )
  select coalesce(sum(value), 0), count(*) into total, n from sold;
  update public.profiles set coins = coins + total where id = p_user returning coins into c;
  return jsonb_build_object('earned', total, 'count', n, 'coins', c);
end; $$;

-- Finalise a PvP room: placements, wins/losses and prize.
create or replace function public.fn_pvp_finalize(p_room uuid, p_winner uuid, p_prize integer, p_placements jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.pvp_rooms%rowtype; item jsonb;
begin
  select * into r from public.pvp_rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if r.status = 'finished' then
    return jsonb_build_object('already', true, 'winner_id', r.winner_id);
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_placements, '[]'::jsonb)) loop
    update public.pvp_participants
       set placement = (item->>'placement')::int
     where room_id = p_room and user_id = (item->>'user_id')::uuid;
  end loop;

  update public.pvp_rooms set status = 'finished', winner_id = p_winner, finished_at = now() where id = p_room;

  if p_winner is not null then
    update public.profiles set pvp_wins = pvp_wins + 1, coins = coins + greatest(0, p_prize) where id = p_winner;
  end if;
  update public.profiles set pvp_losses = pvp_losses + 1
   where id in (select user_id from public.pvp_participants where room_id = p_room)
     and (p_winner is null or id <> p_winner);

  return jsonb_build_object('winner_id', p_winner);
end; $$;

-- Housekeeping: expire stale sessions and abandoned rooms (call from cron or functions).
create or replace function public.fn_housekeeping()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.fishing_sessions set status = 'expired', completed_at = now()
   where status = 'active' and started_at < now() - interval '15 minutes';
  update public.pvp_rooms set status = 'cancelled', finished_at = now()
   where status = 'lobby' and created_at < now() - interval '2 hours';
  update public.pvp_invites set status = 'expired'
   where status = 'pending' and created_at < now() - interval '30 minutes';
end; $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.fn_complete_catch(uuid,text,jsonb,integer,integer,integer,integer)',
    'public.fn_purchase_rod(uuid,text,integer)',
    'public.fn_equip_rod(uuid,text)',
    'public.fn_sell_fish(uuid,uuid[])',
    'public.fn_pvp_finalize(uuid,uuid,integer,jsonb)',
    'public.fn_housekeeping()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ===== 20261106000004_realtime.sql
-- Realtime: lobby / room / invite changes are streamed to clients (RLS still applies).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['pvp_rooms','pvp_participants','pvp_invites','profiles'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- full row images so UPDATE events carry every column
alter table public.pvp_rooms replica identity full;
alter table public.pvp_participants replica identity full;
alter table public.pvp_invites replica identity full;

-- Optional: schedule housekeeping every 10 minutes when pg_cron is enabled in the project.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('pfvr-housekeeping', '*/10 * * * *', 'select public.fn_housekeeping()');
  end if;
end $$;
