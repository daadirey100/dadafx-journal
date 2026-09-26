-- ============================================================================
-- DadaFX Broker Connections — READ-ONLY auto-import (run in SQL Editor).
-- Secrets are AES-GCM encrypted by the edge function before storage.
-- Plaintext tokens/passwords NEVER touch this table or the browser twice.
-- ============================================================================

create table if not exists broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('oanda', 'ctrader', 'mt5', 'custom')),
  label text not null default 'Broker account',
  credentials_enc jsonb not null, -- { iv, ct } AES-GCM envelope, never plaintext
  bridge_token_hash text, -- MT5 / Custom API ingest bearer (SHA-256 hex), shown once at setup
  status text not null default 'never' check (status in ('never', 'connected', 'error')),
  last_sync_at timestamptz,
  last_error text,
  imported_count integer not null default 0,
  state jsonb not null default '{}', -- per-provider cursor, e.g. {"lastSync":"..."}
  created_at timestamptz not null default now()
);

alter table broker_connections enable row level security;

drop policy if exists "own connections" on broker_connections;
create policy "own connections" on broker_connections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Optional auto-sync every 15 minutes (requires pg_cron + pg_net).
-- 1) Enable extensions once: create extension if not exists pg_cron; create extension if not exists pg_net;
-- 2) Store your SUPABASE SERVICE_ROLE key (Settings -> API, server-side only!):
--      select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'sb_service_role');
-- 3) Schedule (replace PROJECT_REF + FUNCTION URL):
--      select cron.schedule(
--        'dadafx-broker-sync',
--        '*/15 * * * *',
--        $$ select net.http_post(
--             url := 'https://PROJECT_REF.supabase.co/functions/v1/broker-sync',
--             headers := jsonb_build_object(
--               'Content-Type', 'application/json',
--               'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'sb_anon'),
--               'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sb_service_role')
--             ),
--             body := jsonb_build_object('action', 'sync-due')
--           ); $$);
-- Until then (or instead), the app's "Sync now" button calls the same endpoint.
