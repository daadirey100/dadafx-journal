-- ============================================================================
-- DadaFX Broker schema v2 — EXTENDS v1, never replaces.
-- Re-run the whole file safely (every statement is idempotent).
--
-- Design notes (precision + ownership):
-- * Money at rest uses NUMERIC, never float/double. JS math stays float64
--   (unavoidable in the browser), but the database ledger is exact and the
--   edge function rounds to cents at the boundary.
-- * Every row carries user_id directly (defense in depth: even if a
--   connection id is guessed, RLS + the explicit eq(user_id) checks in the
--   function make cross-user access impossible).
-- * journal_store remains the app's read model (zero frontend breakage);
--   broker_trades is the precise, auditable import ledger beside it.
-- ============================================================================

-- ---------- 1. broker_connections (extend v1) ----------
create table if not exists broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('oanda', 'ctrader', 'mt5', 'custom')),
  label text not null default 'Broker account',
  credentials_enc jsonb not null,
  bridge_token_hash text,
  status text not null default 'never' check (status in ('never', 'connected', 'error')),
  last_sync_at timestamptz,
  last_error text,
  imported_count integer not null default 0,
  state jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table broker_connections
  add column if not exists external_account_id text,
  add column if not exists account_name text,
  add column if not exists account_currency text,
  add column if not exists environment text,
  add column if not exists access_token_enc jsonb,
  add column if not exists refresh_token_enc jsonb,
  add column if not exists token_expires_at timestamptz,
  add column if not exists last_successful_sync_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table broker_connections enable row level security;

-- ---------- 1b. Custom push-API provider (any broker / bot / script) ----------
-- Widens the provider check on databases created before this change.
-- Safe to re-run: drops the same-named constraint, then re-adds it wider.
alter table broker_connections drop constraint if exists broker_connections_provider_check;
alter table broker_connections add constraint broker_connections_provider_check
  check (provider in ('oanda', 'ctrader', 'mt5', 'custom'));

drop policy if exists "own connections" on broker_connections;
create policy "own connections" on broker_connections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists broker_connections_user_idx
  on broker_connections (user_id);
create index if not exists broker_connections_user_provider_idx
  on broker_connections (user_id, provider);

-- ---------- 2. broker_accounts (one row per trading account) ----------
create table if not exists broker_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references broker_connections(id) on delete cascade,
  external_account_id text not null,
  account_number text not null default '',
  broker_name text not null default '',
  currency text not null default 'USD',
  balance numeric not null default 0,
  equity numeric not null default 0,
  margin numeric not null default 0,
  free_margin numeric not null default 0,
  leverage integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_account_id)
);

alter table broker_accounts enable row level security;

drop policy if exists "own broker accounts" on broker_accounts;
create policy "own broker accounts" on broker_accounts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists broker_accounts_user_idx
  on broker_accounts (user_id);
create index if not exists broker_accounts_connection_idx
  on broker_accounts (connection_id);

-- ---------- 3. broker_trades (precise numeric import ledger) ----------
-- The journal JSON stays the read model; this table is the exact,
-- per-fill audit trail behind it (dedup: one row per provider fill).
create table if not exists broker_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references broker_connections(id) on delete set null,
  broker_account_id uuid references broker_accounts(id) on delete set null,
  provider text not null,
  external_trade_id text not null,
  external_order_id text,
  symbol text not null,
  side text not null check (side in ('Buy', 'Sell')),
  quantity numeric not null,
  entry_price numeric not null,
  exit_price numeric not null,
  stop_loss numeric not null default 0,
  take_profit numeric not null default 0,
  gross_profit numeric not null default 0,
  commission numeric not null default 0,
  swap numeric not null default 0,
  net_profit numeric not null default 0,
  opened_at timestamptz,
  closed_at timestamptz,
  status text not null default 'closed',
  source text not null default 'broker',
  raw_metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, external_trade_id)
);

alter table broker_trades enable row level security;

drop policy if exists "own broker trades" on broker_trades;
create policy "own broker trades" on broker_trades
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists broker_trades_user_closed_idx
  on broker_trades (user_id, closed_at desc);
create index if not exists broker_trades_connection_idx
  on broker_trades (connection_id);
create index if not exists broker_trades_dedup_idx
  on broker_trades (user_id, provider, external_trade_id);

-- ---------- 4. updated_at maintenance ----------
create or replace function dadafx_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_broker_connections_updated on broker_connections;
create trigger trg_broker_connections_updated
  before update on broker_connections
  for each row execute function dadafx_touch_updated_at();

drop trigger if exists trg_broker_accounts_updated on broker_accounts;
create trigger trg_broker_accounts_updated
  before update on broker_accounts
  for each row execute function dadafx_touch_updated_at();

drop trigger if exists trg_broker_trades_updated on broker_trades;
create trigger trg_broker_trades_updated
  before update on broker_trades
  for each row execute function dadafx_touch_updated_at();

-- ---------- 5. OAuth state (cTrader connect flow: CSRF + single-use) ----------
create table if not exists oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  environment text not null default '',
  label text not null default '',
  manual_account_id text,
  created_at timestamptz not null default now()
);

alter table oauth_states enable row level security;

drop policy if exists "own oauth states" on oauth_states;
create policy "own oauth states" on oauth_states
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists oauth_states_user_idx on oauth_states (user_id);

-- ---------- 6. MT5 pairing codes (one-time, short-lived, hashed) ----------
create table if not exists mt5_pairing_codes (
  code_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'MT5 terminal',
  attempts integer not null default 0,
  used boolean not null default false,
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now()
);

alter table mt5_pairing_codes enable row level security;

drop policy if exists "own pairing codes" on mt5_pairing_codes;
create policy "own pairing codes" on mt5_pairing_codes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists mt5_pairing_codes_user_idx on mt5_pairing_codes (user_id);

-- ---------- 7. broker_positions (EA-reported open positions, replace-on-push) ----------
create table if not exists broker_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references broker_connections(id) on delete cascade,
  external_position_id text not null,
  pair text not null,
  direction text not null check (direction in ('Buy', 'Sell')),
  lot numeric not null default 0,
  entry numeric not null default 0,
  stop_loss numeric not null default 0,
  take_profit numeric not null default 0,
  unrealized numeric not null default 0,
  opened_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (connection_id, external_position_id)
);

alter table broker_positions enable row level security;

drop policy if exists "own broker positions" on broker_positions;
create policy "own broker positions" on broker_positions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists broker_positions_user_idx on broker_positions (user_id);
create index if not exists broker_positions_connection_idx on broker_positions (connection_id);

drop trigger if exists trg_broker_positions_updated on broker_positions;
create trigger trg_broker_positions_updated
  before update on broker_positions
  for each row execute function dadafx_touch_updated_at();

-- ---------- 8. broker_sync_logs (every run audited) ----------
create table if not exists broker_sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references broker_connections(id) on delete cascade,
  provider text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'error')),
  records_fetched integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0, -- always 0: imports never overwrite journal rows
  records_skipped integer not null default 0,
  error_message text,
  duration_ms integer
);

alter table broker_sync_logs enable row level security;

drop policy if exists "own sync logs" on broker_sync_logs;
create policy "own sync logs" on broker_sync_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists broker_sync_logs_user_conn_idx
  on broker_sync_logs (user_id, connection_id, started_at desc);

-- kind: 'sync' runs vs 'connect'/'disconnect' audit events (UI reads sync only).
alter table broker_sync_logs
  add column if not exists kind text not null default 'sync';

-- ---------- 9. broker_sync_locks (one runner per connection, serverless-safe) ----------
-- Cron ticks and manual taps race constantly on serverless. The lock is a row:
-- insert wins, losers back off. Stale leases (>10 min, crashed worker) are
-- reaped on every acquire, so a dead runner can never wedge a connection.
create table if not exists broker_sync_locks (
  connection_id uuid primary key references broker_connections(id) on delete cascade,
  worker text not null default '',
  locked_at timestamptz not null default now()
);

-- No RLS policies = locked down (service role bypasses RLS; anon gets nothing).
alter table broker_sync_locks enable row level security;

-- ---------- 10. Optional auto-sync (unchanged from v1) ----------
-- See the commented pg_cron block at the end of BROKERS.sql (kept as-is).
