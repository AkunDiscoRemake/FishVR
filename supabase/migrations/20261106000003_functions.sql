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
