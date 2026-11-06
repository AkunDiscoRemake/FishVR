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
