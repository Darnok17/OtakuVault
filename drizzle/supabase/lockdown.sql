-- Supabase only (not a drizzle migration: plain Postgres has no anon/authenticated roles).
-- The app talks to Postgres directly as `postgres` (BYPASSRLS) through Hyperdrive and never uses
-- Supabase's Data API, so the API roles get no access to the app's tables at all, and RLS is on
-- (with no policies) as a second lock. Safe to re-run; run it again after every migration that
-- adds tables:  node -e … or the Supabase SQL editor, against the session pooler URI.

begin;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

commit;
