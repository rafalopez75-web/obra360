#!/bin/zsh
# Recrea las dos BD del banco (e2e migrada, e2e_sin sin migrar) con el esquema de prod y datos ficticios
set -e
SP=${0:A:h}; export PATH=/opt/homebrew/opt/libpq/bin:$PATH; T="postgresql://postgres:test@127.0.0.1:55432"
for db in e2e e2e_sin; do
  psql "$T/postgres" -X -q -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='$db'" >/dev/null
  psql "$T/postgres" -X -q -c "drop database if exists $db" -c "create database $db"
  psql "$T/$db" -X -q -v ON_ERROR_STOP=1 <<'SQL'
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(coalesce(current_setting('request.jwt.claim.sub', true), current_setting('request.jwt.claims', true)::jsonb->>'sub'), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
SQL
  psql "$T/$db" -X -q -f $SP/public_schema_now.sql >/dev/null 2>&1
  psql "$T/$db" -X -q -v ON_ERROR_STOP=1 -c "grant usage on schema public to anon, authenticated; grant all on all tables in schema public to anon, authenticated; grant all on all sequences in schema public to anon, authenticated;"
  psql "$T/$db" -X -q -v ON_ERROR_STOP=1 -f $SP/seed_e2e.sql >/dev/null
done
psql "$T/e2e" -X -q -v ON_ERROR_STOP=1 -f /Users/rafa/Projects/obra360-archivo/sql/migrations/2026-10-28_obras_cierre_archivo.sql
docker restart obra360-archivo-pgrst-e2e obra360-archivo-pgrst-sin >/dev/null; sleep 3
echo "bancos listos: e2e=$(psql "$T/e2e" -XAtc 'select count(*) from obras') obras, e2e_sin=$(psql "$T/e2e_sin" -XAtc 'select count(*) from obras') obras"
