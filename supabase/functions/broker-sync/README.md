# DadaFX Broker Sync — setup (one time, ~10 minutes)

Read-only auto-import. Nothing here can place, modify, or close trades.

## 1. Database (2 min)

Supabase → **SQL Editor → New query** → paste the whole `BROKERS.sql` file → **Run**.
Expected: `Success. No rows returned`.

## 2. Master encryption key (1 min)

Any terminal with openssl (or Git Bash on Windows):

```bash
openssl rand -hex 32
```

Supabase → **Edge Functions → Manage secrets** (or CLI: `supabase secrets set`):

```
BROKER_MASTER_KEY=<the 64 hex chars>
CRON_SECRET=<any long random string, e.g. openssl rand -hex 24>
```

Without `BROKER_MASTER_KEY`, connecting a broker fails loudly — by design.

```bash
supabase secrets set BROKER_MASTER_KEY=<64 hex> CRON_SECRET=<random> \
  CTRADER_CLIENT_ID=<spotware app id> CTRADER_CLIENT_SECRET=<spotware secret> \
  APP_URL=https://app-murex-iota-40.vercel.app
```

## 3. Deploy the function (3 min)

```bash
npm i -g supabase
supabase login
supabase link --project-ref ypayyghgwbmsejehndwj
supabase functions deploy broker-sync
```

## Verify (idempotency proof, guards, normalization, read-only, analytics)

```bash
deno test --allow-net --allow-read --allow-env supabase/functions/broker-sync/tests/
```
Pure-function tests need no credentials (install Deno from deno.land if
missing). `security.test.ts` additionally needs live keys and skips cleanly
without them:

```bash
SUPABASE_URL=... TEST_SERVICE_ROLE_KEY=... TEST_ANON_KEY=... \
  deno test --allow-net --allow-env --allow-read supabase/functions/broker-sync/tests/security.test.ts
```

No `--no-verify-jwt`: user routes stay JWT-protected; only `mt5-push`
(authenticates by bridge token) and `sync-due` (CRON_SECRET) skip it.

## 4. Per-provider setup

**OANDA** (verified against developer.oanda.com/rest-live-v20):
1. fxTrade → My Account → My Services → **Manage API Access** → generate a
   **personal access token** (it acts like a password — guard it).
2. In DadaFX: Brokers → OANDA → nickname, environment (**practice** =
   `api-fxpractice.oanda.com`, **live** = `api-fxtrade.oanda.com`),
   Account ID (the `001-…` form), token → Connect.
3. The function validates via `GET /v3/accounts/{id}/summary`, discovers all
   token-visible accounts (`GET /v3/accounts`), then syncs closed fills by
   following official transaction **pages** (`ORDER_FILL` legs grouped by
   tradeID, financing into commission). Incremental via 7-day overlap +
   external-ID dedup. Disconnect deletes credentials; revoke the token at
   Manage API Access to kill access server-side too.

**cTrader (OAuth — users never type passwords)** —
1. cTrader.com → Open API portal → create an app (https://openapi.ctrader.com).
2. In the app settings add redirect URI:
   `https://ypayyghgwbmsejehndwj.supabase.co/functions/v1/broker-sync/oauth/callback`
3. Set `CTRADER_CLIENT_ID` / `CTRADER_CLIENT_SECRET` as function secrets.
4. In DadaFX: Brokers → cTrader → **Continue with cTrader** → approve at
   cTrader.com → sent back with accounts discovered + first sync done.
   Scope requested is `accounts` (data only). Tokens auto-refresh; users can
   revoke at cTrader ID → Open API or via Disconnect (deletes everything).

**MT5 — pairing codes, never passwords or tokens in human hands:**
1. In the app: Brokers → MT5 → **Generate pairing code** (8 chars, 10 minutes, one terminal, 5-attempt lockout).
2. Download `DadaFXBridge.mq5` (linked in the dialog, also in `public/`) → compile in MetaEditor (F7) → drag onto any chart.
3. Tools → Options → Expert Advisors → allow WebRequest for
   `https://ypayyghgwbmsejehndwj.supabase.co/functions/v1/broker-sync`.
4. Type the code into the EA inputs. The EA swaps it for its own bearer
   (stored in the terminal's GlobalVariables) and pushes account snapshot +
   open positions + closed deals every 15 min.
5. The EA is read-only by construction — grep it: zero order functions.
   The server additionally validates every field (types, ranges, sizes,
   timestamps) and rejects the whole push on violation.

## 5. Optional auto-sync (2 min)

Either leave the cron SQL in `BROKERS.sql` commented and press **Sync now**,
or enable pg_cron + pg_net and schedule it (service-role key stays in Vault,
never in the app).

## Adding a broker later

1. New file `supabase/functions/broker-sync/adapters/<name>.ts`
   implementing the `BrokerAdapter` contract (`core/adapter.ts`).
2. Wire it in `index.ts` `adapterFor()` + `validateCreds()`.
3. One row in `src/lib/brokers/registry.ts` (UI metadata only).
4. Redeploy the function. Nothing else changes — no journal/table/UI edits.

## API route map (serverless convention)

One edge function, action dispatch (this project's routing convention —
deliberately not Next-style paths, same surface):

| Concept                          | Call                                              |
|----------------------------------|---------------------------------------------------|
| cTrader connect (OAuth start)    | POST `{action:'oauth-start', provider:'ctrader'}` |
| cTrader callback                 | GET `…/broker-sync/oauth/callback?code&state`     |
| List connections                 | POST `{action:'list'}`                            |
| Get connection + accounts + log  | POST `{action:'get', connectionId}`               |
| Sync                             | POST `{action:'sync', connectionId?}`             |
| Disconnect                       | POST `{action:'disconnect', connectionId}`        |
| MT5 pairing code                 | POST `{action:'connect', provider:'mt5'}`         |
| MT5 pair (EA)                    | POST `{action:'mt5-pair', code}`                  |
| MT5 push (EA)                    | POST `{action:'mt5-push', bridgeToken, …}`        |
| OANDA connect / sync             | POST `{action:'connect'}` / `{action:'sync'}`     |
| Rename                           | POST `{action:'rename', connectionId, label}`     |
| Health                           | POST `{action:'health', connectionId}`            |
| Cron sweep                       | POST `{action:'sync-due'}` + `x-cron-secret`      |

## Security posture

- HTTPS only (Supabase edge); `allowMixedContent: false` in the app shell.
- JWT on every user route; bridge-token bearer for EA; cron secret for sweeps.
- OAuth state: random, single-use, 15-min, user-bound (CSRF-proof).
- Secrets: AES-GCM envelopes, key in function secrets; refresh tokens never
  leave the server; nothing secret in logs (scrubber), toasts, or rows.
- Throttle: 60s per connection per sync/push; distributed locks stop overlaps.
- Sync logs audit every run; connect/disconnect audited too.
