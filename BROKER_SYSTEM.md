# DadaFX Broker Connection & Auto-Sync — System Documentation

Read-only trade ingestion. This system can never place, modify, or close
trades, move money, or touch SL/TP — enforced by interface, tests, and the
absence of any execution route. (`tests/readonly.test.ts` fails the pipeline
if execution capability is ever added.)

---

## 1. Architecture

```
Broker API ──▶ Provider Adapter ──▶ Normalizer ──▶ DadaFX Trade ──▶ Database ──▶ Dashboard
   (TLS)        (edge function)      (core/)          (journal JSON    (Supabase)   (existing
                                                      + numeric ledger)             charts)
```

- **Frontend** (`src/`): React SPA. Knows only `src/lib/brokers/types.ts`
  (the contract) + `registry.ts` (UI metadata). Never imports provider shapes.
- **Backend**: one Supabase Edge Function (`supabase/functions/broker-sync/`),
  Deno + TypeScript. All secrets, tokens, parsing and merging live here.
- **Database**: Postgres + RLS. `journal_store` stays the app's read model
  (zero rewrite of charts/stats); `broker_*` tables are the precise ledger.
- **Sync transport**: existing realtime channel pulls merged trades to all
  devices automatically — no new sockets, no polling.

## 2. Broker adapters (`supabase/functions/broker-sync/adapters/`)

| Adapter | Source of truth | Auth | History mechanism |
|---|---|---|---|
| `oanda.ts` | OANDA REST v20 (verified vs developer.oanda.com) | Personal token (Bearer), practice/live hosts | Time-range → follow official `pages[]` → group `ORDER_FILL` legs by tradeID; financing → commission |
| `ctrader.ts` | Spotware Open API v2, `.proto` parsed at runtime from the official MIT repo | OAuth (`accounts` scope): consent → code → token exchange → auto-refresh | `ProtoOADealListReq` per discovered account, SL/TP honestly marked unknown |
| `mt5.ts` | Trader's own terminal via `public/DadaFXBridge.mq5` (official WebRequest) | 8-char pairing code (10 min, 5-attempt lockout, single-use) → bearer token | EA pushes validated account + positions + deals |
| `custom` (in `index.ts` + `mt5.ts` validator) | ANY broker/bot/script speaking HTTPS | In-app one-click token (shown once, hash stored) → `custom-push` bearer | Client pushes validated account + positions + deals; same caps/throttle/dedup as MT5 |

Adding a broker: new file implementing `BrokerAdapter` (`core/adapter.ts`) →
wire into `adapterFor()` + `validateCreds()` in `index.ts` → one registry row
in `src/lib/brokers/registry.ts` → `supabase functions deploy broker-sync`.
Nothing else changes — no journal, table, or UI edits required.

## 3. Database schema

- `journal_store` *(pre-existing, untouched)* — app read model.
- `broker_connections` *(extended)* — owner, provider, label, environment,
  account identity, AES-GCM `credentials_enc`, token columns + expiry,
  `last_sync_at`, `last_successful_sync_at`, `last_error`, counters, cursor.
- `broker_accounts` — exact NUMERIC balances per discovered account.
- `broker_trades` — exact NUMERIC per-fill ledger (`provider + external ID`
  unique per user), raw provider object in `raw_metadata` (20 KB cap).
- `broker_positions` — EA-reported open positions (replace-on-push).
- `broker_sync_logs` — every run audited (fetched/created/updated/skipped,
  errors, duration) + connect/disconnect events.
- `mt5_pairing_codes` — hashed, expiring, attempt-capped, single-use.
- `broker_sync_locks` — one runner per connection (stale leases reaped).
- Files: `BROKERS.sql` (v1) + `BROKERS_V2.sql` (everything, idempotent —
  re-running is always safe).

## 4. Authentication

- Users: Supabase Auth (email/password + Apple). Every server query filters
  `(id, user_id)`; RLS owner-only policies on all six tables.
- OANDA: personal token, validated live before storage, AES-GCM encrypted.
- cTrader: OAuth authorization-code flow (`oauth-start` → Spotware consent →
  `oauth/callback` → exchange → discovery → initial sync). Random single-use
  15-min state (CSRF-proof). Tokens auto-refresh; browser only ever sees
  `?connected=ctrader`. Passwords are never collected — the password field
  does not exist in the UI or the credential schema.
- MT5: pairing code → bearer token (SHA-256 stored); pushes authenticate by
  token hash; validation is zero-trust (types, ranges, sizes, timestamps).

## 5–7. Integrations

- **cTrader**: consent `id.ctrader.com/.../grantingaccess` (`scope=accounts`),
  token `openapi.ctrader.com/apps/token`, protobuf on `:5035` (not `:5036`),
  account discovery, per-account incremental deal sync. Needs `CTRADER_CLIENT_ID/SECRET`
  + registered redirect URI (see README).
- **MT5**: MetaQuotes publishes no public API, so no direct connection is
  faked. The v2 EA (`DadaFXBridge.mq5`) pairs, then pushes account snapshot,
  open positions and closed deals. Read-only by construction (grep it: zero
  order functions) and by server design (no execution routes exist).
- **OANDA**: hosts, Bearer auth, `GET /v3/accounts` discovery,
  summary/positions/orders endpoints, paged transaction history grouped by
  tradeID. Tokens revoked at hub.oanda.com kill access server-side too.

## 8. Synchronization

Per connection: authenticate → validate → refresh → accounts snapshot →
history (90-day first pull) or incremental (since `lastSync`, 7-day overlap)
→ normalize → validate → dedup-merge → timestamps → `{imported, updated,
skipped, errors}` (`updated` is always 0 — imports never overwrite journal
rows). Manual **Sync now**, pg_cron sweep (see `BROKERS.sql`), distributed
locks prevent overlaps, 60s throttle prevents hammering.

## 9. Environment variables

| Name | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.local`, `Vercel` | Public app config (RLS protects everything) |
| `BROKER_MASTER_KEY` | Function secrets | AES-GCM for user broker tokens |
| `CRON_SECRET` | Function secrets | pg_cron sweep bearer |
| `CTRADER_CLIENT_ID` / `CTRADER_CLIENT_SECRET` | Function secrets | Spotware OAuth app |
| `APP_URL` | Function secrets | OAuth final redirect |
| *(no `OANDA_*` app secrets — OANDA uses per-user personal tokens by design)* |

`.env.example` documents placeholders; `.gitignore` blocks real `.env` files.

## 10. Local development

```bash
npm install
npm run dev          # app on http://localhost:5173
npm run build        # typecheck + production bundle
npm run lint         # oxlint
deno test --allow-net --allow-read --allow-env supabase/functions/broker-sync/tests/
```
Function deploys need Supabase CLI (`supabase login/link/functions deploy`)
— the frontend degrades to clear "deploy the function first" errors until then.

## 11. Deployment

Frontend: `npx vercel --prod --yes` (static). Backend: SQL files in order
(`SUPABASE.sql`, `BROKERS.sql`, `BROKERS_V2.sql`), secrets set, function
deployed. Mobile: `npm run mobile` re-bakes the APK (Capacitor).

## 12. Troubleshooting

| Symptom | Cause → fix |
|---|---|
| "deploy the function first" | Edge function not deployed → deploy it |
| OANDA 401 | Token revoked → reconnect with fresh token |
| OANDA 404 | Wrong account ID or practice/live mismatch |
| cTrader "server_not_configured" | `CTRADER_*` secrets missing |
| `?oauth_error=…` | Denied/expired — start “Continue with cTrader” again |
| MT5 "Unknown bridge token" | Re-pair (tokens die on disconnect) |
| Custom API "Unknown API token" | Regenerate from Brokers → Custom API (old token dies instantly) |
| Custom API "Rejected" 400 | Deal JSON failed validation — compare against the in-app example (ticket, symbol, type, volume, priceIn/Out, timeIn/Out) |
| Sync shows 0 imports | Already journaled (dedup) — check skipped count |
| "Sync already running" | A sibling run owns the lock — wait a minute |

## 13. Security considerations

Threat model: stolen DB dump (AES-GCM + hashes only), stolen JWT (short-lived,
RLS-scoped), malicious EA payload (validated + capped), CSRF on OAuth
(single-use state), credential stuffing at pairing (5-attempt lockout),
secret leakage into logs (scrubber + friendly-error boundary), double-spend
of sync (locks + idempotent merge), cross-user reads (user_id on every row +
RLS + per-request ownership checks + live cross-user tests).

## 14. Developer guide — adding a broker

1. **Adapter**: new file implementing `BrokerAdapter` (read-only methods only).
2. **Authentication**: collect minimal credentials in `registry.ts` fields;
   validate live in `connect`; encrypt via `encryptJSON` (or OAuth/token flow
   following the cTrader pattern).
3. **Normalization**: map every field through `core/normalize.ts`; attach
   `raw`; never invent SL/TP/P&L — mark unknown.
4. **Sync**: history window + incremental cursor in `state`; rely on
   `mergeFills` dedup (never bypass it).
5. **Tests**: normalizer cases + idempotency rows + error mapping in `tests/`.
6. **Register**: one `PROVIDERS` row (UI metadata only).
7. **UI config**: fields render automatically in the Brokers wizard — no page edits.
