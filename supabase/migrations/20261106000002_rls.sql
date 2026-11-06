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
