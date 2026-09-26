-- DadaFX cloud sync — run ONCE in Supabase → SQL Editor → New query → Run.
-- Creates one row per journal section, owned by each logged-in user.

create table if not exists journal_store (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  data jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table journal_store enable row level security;

drop policy if exists "own rows" on journal_store;
create policy "own rows" on journal_store
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Live PC <-> laptop updates:
alter publication supabase_realtime add table journal_store;

-- Mentor read-only share links (unguessable tokens, screenshots never included).
create table if not exists shared_views (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Mentor view',
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table shared_views enable row level security;

drop policy if exists "owner write" on shared_views;
create policy "owner write" on shared_views
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Anyone WITH the secret link can view that snapshot (tokens are unguessable).
-- Revoke anytime by deleting the link in the app.
drop policy if exists "public read by token" on shared_views;
create policy "public read by token" on shared_views
  for select
  using (true);
