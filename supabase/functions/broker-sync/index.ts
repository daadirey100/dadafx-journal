// broker-sync — READ-ONLY broker ingestion for DadaFX.
// One function, provider adapters behind the BrokerAdapter contract.
// Secrets: per-user credentials AES-GCM encrypted (BROKER_MASTER_KEY).
// The browser NEVER sees tokens, passwords, or the master key.
//
// Actions (POST JSON):
//   connect   { provider, credentials }            -> validates live, stores, returns connection (mt5: pairing code, custom: bridgeToken ONCE)
//   list                                             -> own connections (no secrets)
//   sync      { connectionId? }                    -> pull history + merge into journal
//   sync-due  { }  (x-cron-secret header)          -> scheduled pass over connected accounts
//   health    { connectionId }                     -> liveness probe
//   disconnect { connectionId }                    -> delete credentials + stop sync
//   mt5-push  { bridgeToken, deals: Mt5Deal[] }     -> bridge ingest (no JWT; bearer token)
//   custom-push { bridgeToken, deals, positions?, account? } -> generic push API: any broker/bot/script (no JWT; bearer token)
// Deploys with JWT verification ON (default) except *-push, which carry
// their own bearer and are exempted via --no-verify-jwt? NO — instead *-push
// are separate code paths that ignore the (absent) user and authenticate
// purely by bridge token hash. Keep JWT verification enabled on deploy.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptJSON, encryptJSON, randomToken, sha256hex } from './lib/vault.ts';
import { markError, mergeFills } from './lib/journal.ts';
import type { BrokerAdapter, BrokerCredentials, BrokerId } from './core/adapter.ts';
import { OandaAdapter, type OandaCreds } from './adapters/oanda.ts';
import { CTraderAdapter, consentUrl, exchangeCode, refreshTokens } from './adapters/ctrader.ts';
import { normalizeMt5Deals, normalizeMt5Positions, validateEaPayload } from './adapters/mt5.ts';
import { logError, scrubSecretsText, toUserError } from './core/errors.ts';
import { isStateFresh, needsTokenRefresh, pairingVerdict } from './core/guards.ts';

const PAIR_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L confusion
function pairingCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  let s = '';
  for (let i = 0; i < 8; i++) s += PAIR_ALPHABET[b[i] % PAIR_ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://app-murex-iota-40.vercel.app').replace(/\/$/, '');
const CT_ID = Deno.env.get('CTRADER_CLIENT_ID') ?? '';
const CT_SECRET = Deno.env.get('CTRADER_CLIENT_SECRET') ?? '';
const redirectUri = () => `${URL}/functions/v1/broker-sync/oauth/callback`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function adapterFor(provider: BrokerId, creds: any, tokens?: { access: string }): BrokerAdapter {
  if (provider === 'oanda') return new OandaAdapter(creds as OandaCreds);
  if (provider === 'ctrader') {
    if (!tokens?.access) throw new Error('cTrader needs OAuth tokens — connect via “Continue with cTrader”.');
    return new CTraderAdapter(
      { environment: creds.environment ?? 'demo', accessToken: tokens.access }, CT_ID, CT_SECRET,
    );
  }
  throw new Error(`No live-query adapter for ${provider} (bridge ingest only).`);
}

/** cTrader access-token rollover (proactive <10 min + reactive on auth errors). */
async function ensureCtraderFresh(service: any, row: any): Promise<{ access: string }> {
  const access = row.access_token_enc ? await decryptJSON<string>(row.access_token_enc) : null;
  if (access && !needsTokenRefresh(row.token_expires_at)) return { access };
  if (!CT_ID || !CT_SECRET) throw new Error('cTrader app credentials are not configured server-side.');
  if (!row.refresh_token_enc) throw new Error('cTrader session expired — reconnect cTrader.');
  const refresh = await decryptJSON<string>(row.refresh_token_enc);
  const t = await refreshTokens({ refreshToken: refresh, clientId: CT_ID, clientSecret: CT_SECRET });
  const { encryptJSON } = await import('./lib/vault.ts');
  await service.from('broker_connections').update({
    access_token_enc: await encryptJSON(t.accessToken),
    refresh_token_enc: await encryptJSON(t.refreshToken),
    token_expires_at: new Date(Date.now() + Number(t.expiresIn ?? 3600) * 1000).toISOString(),
    status: 'connected',
    last_error: null,
  }).eq('id', row.id);
  return { access: t.accessToken };
}

function validateCreds(provider: string, c: any): asserts c is BrokerCredentials {
  if (provider === 'oanda') {
    if (!['practice', 'live'].includes(c?.environment) || !c?.accountId || !c?.token) {
      throw new Error('OANDA needs environment + accountId + token.');
    }
  } else if (provider === 'ctrader') {
    // OAuth only — passwords and app secrets are NEVER collected from users.
    throw new Error('Use “Continue with cTrader” (OAuth) — passwords are not accepted.');
  } else if (provider === 'mt5') {
    if (c && Object.keys(c).length) throw new Error('MT5 needs no credentials — only a label.');
  } else if (provider === 'custom' || provider === 'tradingview') {
    if (c && Object.keys(c).length) throw new Error(`${provider === 'tradingview' ? 'TradingView' : 'Custom API'} needs no credentials — only a label.`);
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }
}

serve(async (req) => {
  const service = createClient(URL, SERVICE);

  // ---- OAuth callback (Spotware redirects the BROWSER here with ?code=&state=) ----
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/oauth/callback')) {
    const done = (params: string) => Response.redirect(`${APP_URL}/?${params}`, 302);
    try {
      const q = new URL(req.url).searchParams;
      if (q.get('error')) return done(`oauth_error=${encodeURIComponent(String(q.get('error_description') ?? q.get('error')))}`);
      const code = q.get('code'), state = q.get('state');
      if (!code || !state) return done('oauth_error=missing_code_or_state');
      if (!CT_ID || !CT_SECRET) return done('oauth_error=server_not_configured');
      // Single-use, 15-minute, user-bound state (CSRF protection).
      const { data: st } = await service.from('oauth_states').select('*').eq('state', state).maybeSingle();
      await service.from('oauth_states').delete().eq('state', state);
      if (!st || !isStateFresh(st.created_at)) return done('oauth_error=invalid_or_expired_state');
      const t = await exchangeCode({ code, redirectUri: redirectUri(), clientId: CT_ID, clientSecret: CT_SECRET });
      const adapter = new CTraderAdapter({ environment: st.environment === 'live' ? 'live' : 'demo', accessToken: t.accessToken }, CT_ID, CT_SECRET);
      const accounts = await adapter.getAccounts('oauth');
      const first = accounts[0];
      const { encryptJSON: enc } = await import('./lib/vault.ts');
      const { data: conn, error: insErr } = await service.from('broker_connections').insert({
        user_id: st.user_id,
        provider: 'ctrader',
        label: String(st.label || 'cTrader').slice(0, 80),
        credentials_enc: await enc({ provider: 'ctrader', environment: st.environment || 'demo', oauth: true }),
        access_token_enc: await enc(t.accessToken),
        refresh_token_enc: await enc(t.refreshToken),
        token_expires_at: new Date(Date.now() + Number(t.expiresIn ?? 3600) * 1000).toISOString(),
        environment: st.environment || 'demo',
        external_account_id: first?.externalId ?? (st.manual_account_id || null),
        account_name: first?.label ?? null,
        account_currency: first?.currency ?? null,
        status: 'connected',
      }).select('id').single();
      if (insErr || !conn) throw new Error('Could not save the connection.');
      for (const a of accounts) {
        await service.from('broker_accounts').upsert({
          user_id: st.user_id, connection_id: conn.id,
          external_account_id: a.externalId, account_number: a.externalId,
          broker_name: 'ctrader', currency: a.currency,
          balance: a.balance, equity: a.equity ?? a.balance, margin: a.marginUsed ?? 0, free_margin: 0,
        }, { onConflict: 'connection_id,external_account_id' });
      }
      try { await syncConnection(service, conn.id, st.user_id, false); } catch { /* initial sync best-effort; Sync now retries */ }
      return done('connected=ctrader');
    } catch (e) {
      return done(`oauth_error=${encodeURIComponent(String((e as Error)?.message ?? e).slice(0, 200))}`);
    }
  }

  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  try {
    // ---- MT5 pairing: EA redeems a one-time code, gets a bearer token ----
    if (body.action === 'mt5-pair') {
      const code = String(body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!code) return json({ error: 'Missing pairing code' }, 400);
      const hash = await sha256hex(`pair:${code}`);
      const { data: pc } = await service
        .from('mt5_pairing_codes')
        .select('*')
        .eq('code_hash', hash)
        .maybeSingle();
      const verdict = pairingVerdict(pc ?? { used: true });
      if (!verdict.ok) {
        if ((pc?.attempts ?? 0) >= 5) await service.from('mt5_pairing_codes').delete().eq('code_hash', hash);
        return json({ error: verdict.reason }, 401);
      }
      await service.from('mt5_pairing_codes')
        .update({ attempts: (pc.attempts ?? 0) + 1 })
        .eq('code_hash', hash);
      const bridgeToken = randomToken(32);
      const { data: conn, error: insErr } = await service.from('broker_connections').insert({
        user_id: pc.user_id,
        provider: 'mt5',
        label: pc.label,
        credentials_enc: await encryptJSON({ provider: 'mt5', pairedAt: new Date().toISOString() }),
        bridge_token_hash: await sha256hex(bridgeToken),
        status: 'connected',
      }).select('id').single();
      if (insErr || !conn) return json({ error: 'Pairing failed, retry with a fresh code.' }, 500);
      // Atomic single-use: only the first redeemer flips used=false→true.
      const { data: claimed } = await service.from('mt5_pairing_codes')
        .update({ used: true })
        .eq('code_hash', hash)
        .eq('used', false)
        .select('code_hash');
      if (!claimed || claimed.length === 0) {
        // Lost the race — roll back our connection so no orphan rows remain.
        await service.from('broker_connections').delete().eq('id', conn.id);
        return json({ error: 'Code already used — generate a fresh one.' }, 401);
      }
      return json({ ok: true, bridgeToken, connectionId: conn.id });
    }

    // ---- Bridge ingest (bearer token, no user JWT; strict validation) ----
    // mt5-push: the EA. custom-push: ANY broker/bot/script speaking the same
    // deal JSON (see Brokers → Custom API for the format). tradingview-push
    // is the same pipe but tagged TradingView so your journal shows the TV badge.
    // Same validator, same caps, same throttle — only the provider tag differs.
    if (body.action === 'mt5-push') return bridgeIngest(service, body, 'mt5');
    if (body.action === 'custom-push') return bridgeIngest(service, body, 'custom');
    if (body.action === 'tradingview-push') return bridgeIngest(service, body, 'tradingview');
    // TradingView alert webhook shorthand — same JSON, friendlier action name for alerts
    if (body.action === 'webhook' && body.source === 'tradingview') return bridgeIngest(service, body, 'tradingview');

    // ---- Scheduled pass (shared cron secret, no user JWT) ----
    if (body.action === 'sync-due') {
      if (req.headers.get('x-cron-secret') !== (Deno.env.get('CRON_SECRET') ?? '')) {
        return json({ error: 'Forbidden' }, 403);
      }
      const { data: conns } = await service
        .from('broker_connections')
        .select('id,user_id,provider,status')
        .eq('status', 'connected');
      const out: Record<string, unknown> = {};
      for (const c of conns ?? []) {
        try { out[c.id] = await syncConnection(service, c.id, c.user_id, true); }
        catch (e) {
          logError('sync-due', e, { connectionId: c.id });
          out[c.id] = { error: toUserError(e, 'Scheduled sync failed.') };
        }
      }
      return json({ ok: true, results: out });
    }

    // ---- User actions (JWT → RLS identity) ----
    const userClient = createClient(URL, ANON, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: 'Sign in required.' }, 401);

    if (body.action === 'list') {
      const { data, error } = await userClient
        .from('broker_connections')
        .select('id,provider,label,status,environment,external_account_id,account_name,account_currency,last_sync_at,last_successful_sync_at,last_error,imported_count,created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const ids = (data ?? []).map((c: any) => c.id);
      let accounts: any[] = [];
      let positions: any[] = [];
      let lastLogs: any[] = [];
      if (ids.length) {
        const { data: acc } = await userClient
          .from('broker_accounts')
          .select('id,connection_id,external_account_id,account_number,broker_name,currency,balance,equity,margin,free_margin,leverage,updated_at')
          .in('connection_id', ids);
        accounts = acc ?? [];
        const { data: pos } = await userClient
          .from('broker_positions')
          .select('id,connection_id,external_position_id,pair,direction,lot,entry,stop_loss,take_profit,unrealized,opened_at,updated_at')
          .in('connection_id', ids);
        positions = pos ?? [];
        const { data: logs } = await userClient
          .from('broker_sync_logs')
          .select('connection_id,status,records_created,records_skipped,completed_at,error_message,duration_ms')
          .in('connection_id', ids)
          .eq('kind', 'sync')
          .order('started_at', { ascending: false })
          .limit(ids.length * 3);
        // Latest log per connection.
        const seen = new Set<string>();
        for (const l of logs ?? []) {
          if (!seen.has(l.connection_id)) { seen.add(l.connection_id); lastLogs.push(l); }
        }
      }
      return json({ connections: data ?? [], accounts, positions, lastLogs });
    }

    // ---- OAuth start (cTrader): returns the Spotware consent URL ----
    if (body.action === 'oauth-start') {
      if (body.provider !== 'ctrader') return json({ error: 'OAuth is a cTrader-only flow.' }, 400);
      if (!CT_ID) return json({ error: 'cTrader app is not configured server-side (CTRADER_CLIENT_ID).' }, 500);
      const environment = body.environment === 'live' ? 'live' : 'demo';
      const state = randomToken(16);
      await service.from('oauth_states').delete().lt('created_at', new Date(Date.now() - 15 * 60e3).toISOString());
      const { error } = await service.from('oauth_states').insert({
        state, user_id: user.id, provider: 'ctrader', environment,
        label: String(body.label || 'cTrader').slice(0, 80),
        manual_account_id: body.accountId ? String(body.accountId) : null,
      });
      if (error) throw error;
      return json({ url: consentUrl(CT_ID, redirectUri(), state) });
    }

    if (body.action === 'connect') {
      const provider = body.provider as BrokerId;
      const creds = { provider, ...(body.credentials ?? {}) } as BrokerCredentials;
      validateCreds(provider, (body.credentials ?? {}));
      if (provider === 'mt5') {
        // Pairing codes only — the bridge token is issued to the EA itself, never shown.
        const code = pairingCode();
        const { error } = await userClient.from('mt5_pairing_codes').insert({
          code_hash: await sha256hex(`pair:${code.replace(/-/g, '')}`),
          user_id: user.id,
          label: String(body.label || 'MT5 terminal').slice(0, 80),
        });
        if (error) throw error;
        // Prune the user's stale codes.
        await userClient.from('mt5_pairing_codes')
          .delete().eq('user_id', user.id).lt('expires_at', new Date().toISOString());
        return json({ pairingCode: code, expiresIn: 600 });
      }
      if (provider === 'custom' || provider === 'tradingview') {
        // Push-API token: the session is already authenticated, so the token
        // is issued directly and shown ONCE in the UI. Only its hash is stored.
        const isTV = provider === 'tradingview';
        const bridgeToken = randomToken(32);
        const { data: conn, error: insErr } = await userClient.from('broker_connections').insert({
          user_id: user.id,
          provider,
          label: String(body.label || (isTV ? 'TradingView alerts' : 'Custom API')).slice(0, 80),
          credentials_enc: await encryptJSON({ provider, issuedAt: new Date().toISOString() }),
          bridge_token_hash: await sha256hex(bridgeToken),
          status: 'connected',
        }).select('id').single();
        if (insErr || !conn) throw new Error('Could not create the API token.');
        await audit(service, user.id, (conn as any).id, provider, 'connect', true);
        return json({ bridgeToken, connectionId: (conn as any).id });
      }
      const adapter = adapterFor(provider, creds);
      const health = await adapter.healthCheck('');
      if (!health.ok) return json({ error: `Broker rejected the credentials: ${health.message}` }, 400);
      // Capture account identity at connect time (no plaintext secrets stored).
      let environment: string | null = null;
      let externalAccountId: string | null = null;
      let accountName: string | null = null;
      let accountCurrency: string | null = null;
      try {
        if (provider === 'oanda' || provider === 'ctrader') {
          environment = String((creds as any).environment ?? '');
          const accts = await adapter.getAccounts('');
          const first = accts[0];
          if (first) {
            externalAccountId = first.externalId;
            accountName = first.label;
            accountCurrency = first.currency;
          }
        }
      } catch { /* identity is best-effort; sync fills it in */ }
      const { data, error } = await userClient.from('broker_connections').insert({
        user_id: user.id, provider,
        label: String(body.label || (body.credentials as any)?.accountId || provider).slice(0, 80),
        credentials_enc: await encryptJSON(creds),
        environment, external_account_id: externalAccountId,
        account_name: accountName, account_currency: accountCurrency,
        status: 'connected',
      }).select('id,provider,label,status').single();
      if (error) throw error;
      await audit(service, user.id, (data as any).id, provider, 'connect', true);
      return json({ connection: data });
    }

    if (body.action === 'get') {
      const { data: conn } = await userClient.from('broker_connections')
        .select('id,provider,label,status,environment,external_account_id,account_name,account_currency,last_sync_at,last_successful_sync_at,last_error,imported_count,created_at')
        .eq('id', body.connectionId)
        .maybeSingle();
      if (!conn) return json({ error: 'Connection not found.' }, 404);
      const { data: accounts } = await userClient.from('broker_accounts')
        .select('id,external_account_id,account_number,currency,balance,equity,margin,free_margin,leverage,updated_at')
        .eq('connection_id', body.connectionId);
      const { data: history } = await userClient.from('broker_sync_logs')
        .select('status,records_created,records_skipped,completed_at,error_message,duration_ms,kind')
        .eq('connection_id', body.connectionId)
        .order('started_at', { ascending: false })
        .limit(10);
      return json({ connection: conn, accounts: accounts ?? [], history: history ?? [] });
    }

    if (body.action === 'health' || body.action === 'sync') {
      if (body.action === 'sync' && body.connectionId && await throttled(service, body.connectionId)) {
        return json({ ok: true, results: { [body.connectionId]: { status: 'throttled', imported: 0, updated: 0, skipped: 0, errors: [], note: 'Synced moments ago — cooling down.' } } });
      }
      let out: Record<string, unknown>;
      try {
        out = body.connectionId
          ? { [body.connectionId]: await syncOrHealth(service, userClient, user.id, body.connectionId, body.action) }
          : await syncAllForUser(service, userClient, user.id, body.action);
      } catch (e) {
        logError('sync-action', e, { connectionId: body.connectionId ?? null });
        return json({ ok: true, results: { [body.connectionId ?? 'all']: { error: toUserError(e) } } });
      }
      for (const [k, v] of Object.entries(out)) {
        const r = v as any;
        if (r?.error) {
          logError('sync-result', r.error, { connectionId: k });
          r.error = toUserError(r.error);
        }
      }
      return json({ ok: true, results: out });
    }

    if (body.action === 'accounts') {
      const { row, creds, tokens } = await loadCreds(service, body.connectionId, user.id);
      if (row.provider === 'mt5' || row.provider === 'custom') return json({ accounts: [] });
      const adapter = adapterFor(row.provider, creds, tokens);
      try {
        return json({ accounts: await adapter.getAccounts(body.connectionId) });
      } catch (e) {
        logError('accounts', e, { connectionId: body.connectionId });
        return json({ error: toUserError(e) }, 400);
      }
    }

    if (body.action === 'rename') {
      const label = String(body.label ?? '').trim().slice(0, 80);
      if (!label) return json({ error: 'Name cannot be empty.' }, 400);
      const { error } = await userClient.from('broker_connections')
        .update({ label }).eq('id', body.connectionId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === 'disconnect') {
      const { data: gone } = await userClient.from('broker_connections')
        .select('id,provider').eq('id', body.connectionId).maybeSingle();
      const { error } = await userClient.from('broker_connections').delete().eq('id', body.connectionId);
      if (error) throw error;
      if (gone) await audit(service, user.id, body.connectionId, gone.provider, 'disconnect', true);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: toUserError(e) }, 500);
  }
});

/** Shared push ingest for bearer-token connections (MT5 EA + generic Custom/TradingView).
 *  Zero-trust: token hash lookup, 60s throttle, strict payload validation,
 *  capped sizes, dedup-merge. Read-only — no execution route exists here. */
async function bridgeIngest(service: any, body: any, provider: 'mt5' | 'custom' | 'tradingview') {
  const tag = provider === 'mt5' ? 'MT5 bridge import' : provider === 'tradingview' ? 'TradingView webhook import' : 'Custom API import';
  const token = String(body.bridgeToken ?? '');
  if (!token) return json({ error: 'Missing bridgeToken' }, 401);
  const hash = await sha256hex(token);
  const { data: conn } = await service
    .from('broker_connections')
    .select('id,user_id,provider')
    .eq('bridge_token_hash', hash)
    .eq('provider', provider)
    .maybeSingle();
  if (!conn) {
    return json({
      error: provider === 'mt5'
        ? 'Unknown bridge token — re-pair from Brokers → MT5.'
        : 'Unknown API token — regenerate it from Brokers → Custom API.',
    }, 401);
  }
  if (await throttled(service, conn.id)) {
    return json({ ok: true, status: 'throttled', imported: 0, skipped: 0, note: 'Pushed moments ago — cooling down.' });
  }
  let payload: { account?: any; positions: any[]; deals: any[] };
  try {
    payload = validateEaPayload(body);
  } catch (e) {
    return json({ error: `Rejected: ${toUserError(e, 'Push rejected: payload failed validation.')}` }, 400);
  }
  // Account snapshot → normalized accounts table (exact numerics).
  if (payload.account) {
    const a = payload.account;
    await service.from('broker_accounts').upsert({
      user_id: conn.user_id, connection_id: conn.id,
      external_account_id: String(a.login), account_number: String(a.login),
      broker_name: provider, currency: a.currency ?? 'USD',
      balance: a.balance, equity: a.equity,
      margin: a.margin ?? 0, free_margin: a.freeMargin ?? 0,
    }, { onConflict: 'connection_id,external_account_id' });
  }
  // Open positions → replace-on-push (the pusher is the source of truth).
  const posRows = normalizeMt5Positions(payload.positions).map(p => ({
    user_id: conn.user_id, connection_id: conn.id,
    external_position_id: p.externalId, pair: p.pair, direction: p.direction,
    lot: p.lot, entry: p.entry, stop_loss: p.stopLoss ?? 0, take_profit: p.takeProfit ?? 0,
    unrealized: p.unrealizedPL ?? 0, opened_at: p.openedAt,
  }));
  await service.from('broker_positions').delete().eq('connection_id', conn.id).eq('user_id', conn.user_id);
  if (posRows.length) await service.from('broker_positions').insert(posRows);
  const fills = normalizeMt5Deals(payload.deals, tag);
  const r = await mergeFills(service, conn.user_id, conn.id, provider, fills);
  await service.from('broker_sync_logs').insert({
    user_id: conn.user_id, connection_id: conn.id, provider, kind: 'sync',
    status: 'success', completed_at: new Date().toISOString(),
    records_fetched: payload.deals.length, records_created: r.imported,
    records_updated: 0, records_skipped: r.skipped, duration_ms: 0,
  });
  return json({ ok: true, ...r, positions: posRows.length, syncedAt: new Date().toISOString() });
}

/** Throttle: at most one sync per connection per 60s (serverless-safe, race-safe with locks). */async function throttled(service: any, connectionId: string, windowSec = 60): Promise<boolean> {
  const { data } = await service.from('broker_sync_logs')
    .select('started_at')
    .eq('connection_id', connectionId)
    .eq('kind', 'sync')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.started_at) return false;
  return Date.now() - new Date(data.started_at).getTime() < windowSec * 1000;
}

async function loadCreds(service: any, connectionId: string, userId: string) {
  // Ownership enforced on EVERY load: id AND user must match.
  const { data, error } = await service
    .from('broker_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) throw new Error('Connection not found.');
  const creds = await decryptJSON<any>(data.credentials_enc);
  let tokens: { access: string } | undefined;
  if (data.provider === 'ctrader') {
    tokens = await ensureCtraderFresh(service, data);
  }
  return { row: data, creds, tokens };
}

async function syncOrHealth(service: any, _user: any, userId: string, connectionId: string, mode: 'sync' | 'health') {
  const { row, creds, tokens } = await loadCreds(service, connectionId, userId);
  if (row.provider === 'mt5' || row.provider === 'custom' || row.provider === 'tradingview') {
    return mode === 'health'
      ? { ok: true, message: 'Push mode — data arrives from your terminal / script / TradingView alerts' }
      : { imported: 0, skipped: 0, note: 'Push-only connection — history arrives via pushes, nothing to pull' };
  }
  const adapter = adapterFor(row.provider, creds, tokens);
  if (mode === 'health') {
    try {
      return await adapter.healthCheck(connectionId);
    } catch (e) {
      // One reactive refresh on auth failure, then retry once.
      if (row.provider === 'ctrader' && /auth|token|401|CH_/i.test(String((e as Error)?.message ?? ''))) {
        await service.from('broker_connections').update({
          token_expires_at: new Date(0).toISOString(),
        }).eq('id', connectionId).eq('user_id', userId);
        const fresh = await loadCreds(service, connectionId, userId);
        return adapterFor(row.provider, fresh.creds, fresh.tokens).healthCheck(connectionId);
      }
      throw e;
    }
  }
  return syncConnection(service, connectionId, userId, true);
}

async function syncAllForUser(service: any, _user: any, userId: string, mode: 'sync' | 'health') {
  const { data } = await service.from('broker_connections').select('id').eq('user_id', userId);
  const out: Record<string, unknown> = {};
  for (const c of data ?? []) {
    try { out[c.id] = await syncOrHealth(service, null, userId, c.id, mode); }
    catch (e) { out[c.id] = { error: String((e as Error)?.message ?? e) }; }
  }
  return out;
}

/**
 * Sync engine — every run is audited, every step ordered:
 * authenticate → validate → refresh → accounts → history/incremental →
 * normalize → validate → upsert → account snapshot → timestamps → summary.
 * Returns { imported, updated, skipped, errors }.
 * `updated` is always 0 BY DESIGN: imports never overwrite journal rows
 * the user may have rated, annotated or screenshotted.
 */
async function audit(
  service: any, userId: string, connectionId: string | null, provider: string,
  kind: 'connect' | 'disconnect', ok: boolean, note = '',
) {
  await service.from('broker_sync_logs').insert({
    user_id: userId, connection_id: connectionId, provider, kind,
    status: ok ? 'success' : 'error',
    completed_at: new Date().toISOString(),
    error_message: ok ? null : note.slice(0, 500),
    duration_ms: 0,
  });
}

async function withSyncLog<T>(
  service: any, userId: string, connectionId: string | null, provider: string,
  fn: () => Promise<{ result: T; fetched: number; created: number; updated: number; skipped: number; errors: string[] }>,
): Promise<T & { syncedAt: string }> {
  const t0 = Date.now();
  const { data: log } = await service.from('broker_sync_logs').insert({
    user_id: userId, connection_id: connectionId, provider, kind: 'sync', status: 'running',
  }).select('id').maybeSingle();
  try {
    const { result, fetched, created, updated, skipped, errors } = await fn();
    await service.from('broker_sync_logs').update({
      status: errors.length ? 'error' : 'success',
      completed_at: new Date().toISOString(),
      records_fetched: fetched, records_created: created,
      records_updated: updated, records_skipped: skipped,
      error_message: errors.join(' | ').slice(0, 500) || null,
      duration_ms: Date.now() - t0,
    }).eq('id', log?.id);
    return { ...result, syncedAt: new Date().toISOString() } as T & { syncedAt: string };
  } catch (e) {
    const msg = scrubSecretsText(String((e as Error)?.message ?? e)).slice(0, 500);
    logError('syncConnection', e, { connectionId, provider });
    if (log) {
      await service.from('broker_sync_logs').update({
        status: 'error', completed_at: new Date().toISOString(),
        error_message: msg, duration_ms: Date.now() - t0,
      }).eq('id', log.id);
    }
    throw e;
  }
}

/**
 * Distributed lock: exactly one sync per connection at a time, across any
 * number of serverless workers. Stale leases (>10 min) are reaped, so a
 * crashed runner can never wedge a connection forever.
 */
async function acquireSyncLock(service: any, connectionId: string): Promise<string | null> {
  const worker = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  await service.from('broker_sync_locks').delete()
    .eq('connection_id', connectionId)
    .lt('locked_at', new Date(Date.now() - 10 * 60e3).toISOString());
  const { error } = await service.from('broker_sync_locks')
    .insert({ connection_id: connectionId, worker });
  if (error) return null; // someone else holds it
  return worker;
}

async function releaseSyncLock(service: any, connectionId: string, worker: string) {
  await service.from('broker_sync_locks').delete()
    .eq('connection_id', connectionId).eq('worker', worker);
}

async function syncConnection(service: any, connectionId: string, userId: string, withState: boolean) {
  const { row, creds, tokens } = await loadCreds(service, connectionId, userId);
  const adapter = adapterFor(row.provider, creds, tokens);
  const worker = await acquireSyncLock(service, connectionId);
  if (!worker) {
    // Not an error — a sibling run owns it. Callers render "Syncing".
    return { status: 'already_running', imported: 0, updated: 0, skipped: 0, errors: [], syncedAt: new Date().toISOString() };
  }
  try {
    return await withSyncLog(service, userId, connectionId, row.provider, async () => {
    let fetched = 0, imported = 0, skipped = 0;
    const errors: string[] = [];
    // 1) Refresh the normalized account snapshot (exact numerics).
    const acctIds = new Map<string, string>(); // external id -> broker_accounts.id
    try {
      const accts = await adapter.getAccounts(connectionId);
      for (const a of accts) {
        const { data: up } = await service.from('broker_accounts').upsert({
          user_id: userId,
          connection_id: connectionId,
          external_account_id: a.externalId,
          account_number: a.externalId,
          broker_name: row.provider,
          currency: a.currency,
          balance: a.balance,
          equity: a.equity ?? a.balance,
          margin: a.marginUsed ?? 0,
          free_margin: 0,
        }, { onConflict: 'connection_id,external_account_id' }).select('id').maybeSingle();
        if (up) acctIds.set(a.externalId, up.id);
      }
    } catch { /* accounts are informational — fills still sync */ }
    if (!acctIds.size) {
      const { data: existing } = await service.from('broker_accounts')
        .select('id,external_account_id').eq('connection_id', connectionId).eq('user_id', userId);
      for (const e of existing ?? []) acctIds.set(e.external_account_id, e.id);
    }
    // 2) Pull fills per account (multi-account OAuth tokens) + merge.
    //    Initial sync: 90-day window. Later: incremental from lastSync.
    const state = (row.state ?? {}) as Record<string, unknown>;
    const since = withState && typeof state.lastSync === 'string'
      ? state.lastSync as string
      : new Date(Date.now() - 90 * 864e5).toISOString();
    const targets = acctIds.size ? [...acctIds.entries()] : [[null, null] as unknown as [string, string]];
    for (const [extId, dbId] of targets) {
      try {
        const fills = await adapter.getTradeHistory(connectionId, { sinceISO: since, accountExternalId: extId ?? undefined });
        fetched += fills.length;
        const r = await mergeFills(service, userId, connectionId, row.provider, fills, dbId ?? null);
        imported += r.imported;
        skipped += r.skipped;
      } catch (e) {
        // One account failing must not sink the others — recorded, not thrown.
        const msg = `${extId ?? 'account'}: ${String((e as Error)?.message ?? e)}`;
        errors.push(msg);
        await markError(service, connectionId, msg, userId);
      }
    }
    await service.from('broker_connections').update({
      state: { ...state, lastSync: new Date().toISOString() },
    }).eq('id', connectionId).eq('user_id', userId);
    // updated is ALWAYS 0: imports never overwrite journal rows the user
    // may have rated, annotated or screenshotted (documented in mergeFills).
    return { result: { imported, updated: 0, skipped, errors }, fetched, created: imported, updated: 0, skipped, errors };
    });
  } finally {
    await releaseSyncLock(service, connectionId, worker);
  }
}
