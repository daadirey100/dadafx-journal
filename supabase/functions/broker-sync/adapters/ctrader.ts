// CTraderAdapter — official cTrader Open API v2, OAuth token auth ONLY.
// No passwords are ever collected (OAuth consent page belongs to Spotware).
// Verified against official docs (help.ctrader.com/open-api):
//  - consent:  https://id.ctrader.com/my/settings/openapi/grantingaccess/
//              ?client_id=&redirect_uri=&scope=accounts&product=web
//  - token:    GET https://openapi.ctrader.com/apps/token
//              (grant_type=authorization_code|refresh_token)
//  - protobuf: wss://{demo|live}.ctraderapi.com:5035  (5035=protobuf, 5036=JSON)
//  - proto:    github.com/spotware/openapi-proto-messages (MIT), parsed at runtime
//  - account auth: ProtoOAAccountAuthReq.accessToken
//  - discovery:    ProtoOAGetAccountListByAccessTokenReq
import protobuf from 'npm:protobufjs@7.4.0';
import {
  normalizeDirection, normalizeLotAmount, normalizeMoneyMinor,
  normalizePrice, normalizeSymbol, normalizeTimestamp, toNormalizedFill,
} from '../core/normalize.ts';
import type {
  BrokerAdapter, BrokerConnection, BrokerCredentials, HealthStatus,
  NormalizedAccount, NormalizedFill, NormalizedOrder, NormalizedPosition,
  NormalizedSummary, SyncResult,
} from '../core/adapter.ts';

export interface CTraderTokenCreds {
  environment: 'demo' | 'live';
  accessToken: string;
}

const HOSTS = {
  demo: 'wss://demo.ctraderapi.com:5035',
  live: 'wss://live.ctraderapi.com:5035',
} as const;

const TOKEN_URL = 'https://openapi.ctrader.com/apps/token';
const CONSENT_URL = 'https://id.ctrader.com/my/settings/openapi/grantingaccess/';

const PROTO_BASE = 'https://raw.githubusercontent.com/spotware/openapi-proto-messages/main/';
const PROTO_FILES = [
  'OpenApiCommonMessages.proto',
  'OpenApiCommonModelMessages.proto',
  'OpenApiModelMessages.proto',
  'OpenApiMessages.proto',
];

/** Build the Spotware consent URL (user leaves DadaFX, approves at cTrader). */
export function consentUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: 'accounts', product: 'web', state });
  return `${CONSENT_URL}?${q}`;
}

/** Exchange authorisation code → { access_token, refresh_token, expires_in }. */
export async function exchangeCode(opts: { code: string; redirectUri: string; clientId: string; clientSecret: string }) {
  const q = new URLSearchParams({
    grant_type: 'authorization_code', code: opts.code, redirect_uri: opts.redirectUri,
    client_id: opts.clientId, client_secret: opts.clientSecret,
  });
  const r = await fetch(`${TOKEN_URL}?${q}`, { signal: AbortSignal.timeout(20000) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.accessToken) {
    throw new Error(`cTrader token exchange failed: ${body.errorCode ?? body.description ?? r.status}`);
  }
  return body as { accessToken: string; refreshToken: string; expiresIn: number; tokenType: string };
}

/** Refresh an expired access token. */
export async function refreshTokens(opts: { refreshToken: string; clientId: string; clientSecret: string }) {
  const q = new URLSearchParams({
    grant_type: 'refresh_token', refresh_token: opts.refreshToken,
    client_id: opts.clientId, client_secret: opts.clientSecret,
  });
  const r = await fetch(`${TOKEN_URL}?${q}`, { signal: AbortSignal.timeout(20000) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.accessToken) {
    throw new Error(`cTrader refresh failed: ${body.errorCode ?? body.description ?? r.status} — reconnect cTrader.`);
  }
  return body as { accessToken: string; refreshToken: string; expiresIn: number };
}

let rootPromise: Promise<any> | null = null;
async function loadRoot(): Promise<any> {
  if (!rootPromise) {
    rootPromise = (async () => {
      const texts = await Promise.all(
        PROTO_FILES.map(async f => {
          const r = await fetch(PROTO_BASE + f, { signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error(`Spotware proto fetch failed (${f}: ${r.status})`);
          return r.text();
        }),
      );
      const body = texts
        .map(t => t.split('\n').filter(l => !/^\s*import\s+/.test(l) && !/^\s*syntax\s*=/.test(l)).join('\n'))
        .join('\n');
      const parsed = protobuf.parse('syntax = "proto2";\n' + body, { keepCase: true });
      parsed.root.resolveAll();
      return parsed.root;
    })().catch(e => { rootPromise = null; throw e; });
  }
  return rootPromise;
}

interface Session {
  ws: WebSocket;
  root: any;
  byId: Map<number, string>;
  waiters: Map<string, { res: (v: any) => void; rej: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>;
  send: (reqType: string, obj: Record<string, unknown>, resType: string, timeoutMs?: number) => Promise<any>;
  close: () => void;
}

function payloadId(root: any, name: string): number {
  const en = root.lookupEnum('ProtoOAPayloadType');
  const id = en.values[name];
  if (id == null) throw new Error(`Spotware protocol changed: unknown payload ${name}`);
  return id;
}

function reqTypeToPayload(reqType: string, root: any): string {
  const guessed = reqType.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
  try {
    const en = root.lookupEnum('ProtoOAPayloadType');
    if (en.values[guessed] != null) return guessed;
  } catch { /* fall through */ }
  throw new Error(`Spotware protocol changed: no payload id for ${reqType}`);
}

async function connect(url: string, root: any): Promise<Session> {
  const ws = new WebSocket(url);
  await new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error('cTrader connection timed out (25s)')), 25000);
    ws.onopen = () => { clearTimeout(t); res(); };
    ws.onerror = () => { clearTimeout(t); rej(new Error('cTrader socket error — check environment (demo/live)')); };
  });
  const byId: Session['byId'] = new Map();
  try {
    const en = root.lookupEnum('ProtoOAPayloadType');
    for (const [name, id] of Object.entries(en.values)) byId.set(id as number, name);
  } catch { /* best-effort */ }

  const waiters: Session['waiters'] = new Map();
  ws.onmessage = (ev: MessageEvent) => {
    try {
      const data = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : new Uint8Array(ev.data);
      const outer = root.lookupType('ProtoMessage').decode(data) as any;
      const name = byId.get(outer.payloadType) ?? '';
      if (/ERROR/i.test(name)) {
        let desc = 'cTrader error';
        try {
          const e = root.lookupType(name).decode(outer.payload) as any;
          desc = `cTrader ${e.errorCode ?? 'error'}: ${e.description ?? ''}`;
        } catch { /* ignore */ }
        for (const w of waiters.values()) { clearTimeout(w.timer); w.rej(new Error(desc)); }
        waiters.clear();
        return;
      }
      const w = waiters.get(name);
      if (w) {
        clearTimeout(w.timer);
        waiters.delete(name);
        w.res(root.lookupType(name).decode(outer.payload));
      }
    } catch { /* malformed frame — ignore */ }
  };

  const send: Session['send'] = (reqType, obj, resType, timeoutMs = 25000) =>
    new Promise((res, rej) => {
      const timer = setTimeout(() => { waiters.delete(resType); rej(new Error(`cTrader timed out waiting for ${resType}`)); }, timeoutMs);
      waiters.set(resType, { res, rej, timer });
      try {
        const payload = root.lookupType(reqType).encode(root.lookupType(reqType).fromObject(obj)).finish();
        const frame = root.lookupType('ProtoMessage').encode({ payloadType: payloadId(root, reqTypeToPayload(reqType, root)), payload }).finish();
        ws.send(frame);
      } catch (e) {
        clearTimeout(timer);
        waiters.delete(resType);
        rej(e as Error);
      }
    });

  return { ws, root, byId, waiters, send, close: () => { try { ws.close(); } catch { /* ignore */ } } };
}



export class CTraderAdapter implements BrokerAdapter {
  readonly id = 'ctrader' as const;
  constructor(private creds: CTraderTokenCreds, private clientId: string, private clientSecret: string) {}

  async connect(_c: BrokerCredentials): Promise<BrokerConnection> {
    throw new Error('connect() is handled by the router (OAuth only — passwords are never collected).');
  }
  async disconnect(_id: string): Promise<void> {
    throw new Error('disconnect() is handled by the router.');
  }

  async healthCheck(_id: string): Promise<HealthStatus> {
    const t0 = Date.now();
    const ids = await grantedAccountIds(this.creds, this.clientId, this.clientSecret);
    return {
      ok: true, latencyMs: Date.now() - t0,
      message: `Authenticated via OAuth — ${ids.length} account(s) granted`,
      serverTime: new Date().toISOString(),
    };
  }

  async getAccounts(_id: string): Promise<NormalizedAccount[]> {
    const ids = await grantedAccountIds(this.creds, this.clientId, this.clientSecret);
    const out: NormalizedAccount[] = [];
    for (const id of ids) {
      const s = await authedSession(this.creds, this.clientId, this.clientSecret);
      try {
        const tr = await s.send('ProtoOATraderReq', { ctidTraderAccountId: id }, 'ProtoOATraderRes') as any;
        const t = tr.trader ?? tr;
        out.push({
          externalId: String(id),
          label: `cTrader ${t.accountNumber ?? id}`,
          currency: String(t.depositCurrency ?? t.currency ?? 'USD'),
          balance: Number(t.balance ?? 0) / 100,
          equity: t.equity != null ? Number(t.equity) / 100 : undefined,
        });
      } finally {
        s.close();
      }
    }
    return out;
  }

  async getAccountSummary(_id: string, accountExternalId?: string): Promise<NormalizedSummary> {
    const accts = await this.getAccounts(_id);
    const a = accts.find(x => x.externalId === accountExternalId) ?? accts[0];
    if (!a) throw new Error('No cTrader accounts granted to this token.');
    const positions = await this.getOpenPositions(_id, a.externalId).catch(() => []);
    return { ...a, openPositions: positions.length, pendingOrders: 0 };
  }

  async getOpenPositions(_id: string, accountExternalId?: string): Promise<NormalizedPosition[]> {
    const s = await authedSession(this.creds, this.clientId, this.clientSecret);
    try {
      let res: any;
      try {
        res = await s.send('ProtoOAPositionListReq',
          { ctidTraderAccountId: Number(accountExternalId) }, 'ProtoOAPositionListRes');
      } catch {
        return [];
      }
      const syms = await ctSymbolMap(s, accountExternalId);
      return (res.position ?? []).map((p: any) => {
        const sym = syms.get(Number(p.symbolId));
        const digits = sym?.digits ?? 5;
        const vol = Number(p.volume ?? 0);
        return {
          externalId: `ctrader:pos:${p.positionId ?? p.id ?? vol}`,
          pair: normalizeSymbol(sym?.name ?? String(p.symbolId)),
          direction: normalizeDirection(tradeSide(s.root, p.tradeSide)),
          lot: normalizeLotAmount(Math.abs(vol) / 100),
          entry: normalizePrice(p.entryPrice ?? p.price ?? 0, digits),
          stopLoss: p.stopLoss != null ? normalizePrice(p.stopLoss, digits) : null,
          takeProfit: p.takeProfit != null ? normalizePrice(p.takeProfit, digits) : null,
          unrealizedPL: p.grossProfit != null ? normalizeMoneyMinor(p.grossProfit) : null,
          openedAt: new Date().toISOString(),
        };
      });
    } finally {
      s.close();
    }
  }

  async getOrders(_id: string): Promise<NormalizedOrder[]> {
    return [];
  }

  async getTrades(_id: string, accountExternalId?: string) {
    const [positions, orders] = await Promise.all([
      this.getOpenPositions(_id, accountExternalId), this.getOrders(_id),
    ]);
    return { positions, orders };
  }

  async getTradeHistory(_id: string, opts?: { sinceISO?: string; accountExternalId?: string }): Promise<NormalizedFill[]> {
    const accountId = opts?.accountExternalId;
    if (!accountId) throw new Error('cTrader sync needs a discovered account id.');
    const s = await authedSession(this.creds, this.clientId, this.clientSecret);
    try {
      const syms = await ctSymbolMap(s, accountId);
      const from = opts?.sinceISO ? new Date(opts.sinceISO).getTime() - 7 * 864e5 : Date.now() - 90 * 864e5;
      const to = Date.now();
      const fills: NormalizedFill[] = [];
      let cursor = from;
      for (let page = 0; page < 20; page++) {
        const res = await s.send('ProtoOADealListReq', {
          ctidTraderAccountId: Number(accountId),
          fromTimestamp: Math.floor(cursor),
          toTimestamp: Math.floor(to),
          maxRows: 1000,
        }, 'ProtoOADealListRes') as any;
        const deals: any[] = res.deal ?? [];
        for (const d of deals) {
          const f = ctMapDeal(s.root, syms, d);
          if (f) fills.push(f);
          if (d.closeTimestamp) cursor = Math.max(cursor, Number(d.closeTimestamp) + 1);
        }
        if (!res.hasMore || !deals.length) break;
      }
      return fills.sort((a, b) => a.closedAt.localeCompare(b.closedAt));
    } finally {
      s.close();
    }
  }

  async sync(_id: string): Promise<SyncResult> {
    throw new Error('sync() is orchestrated by the router.');
  }
}

// Module-level helpers (kept OFF the class so the adapter surface stays
// exactly the 10 read-only contract methods — enforced by test).

async function authedSession(creds: CTraderTokenCreds, clientId: string, clientSecret: string): Promise<Session> {
  const root = await loadRoot();
  const s = await connect(HOSTS[creds.environment], root);
  try {
    await s.send('ProtoOAApplicationAuthReq',
      { clientId, clientSecret },
      'ProtoOAApplicationAuthRes');
    await s.send('ProtoOAAccountAuthReq',
      { accessToken: creds.accessToken },
      'ProtoOAAccountAuthRes');
    return s;
  } catch (e) {
    s.close();
    throw e;
  }
}

async function grantedAccountIds(creds: CTraderTokenCreds, clientId: string, clientSecret: string): Promise<number[]> {
  const s = await authedSession(creds, clientId, clientSecret);
  try {
    const res = await s.send('ProtoOAGetAccountListByAccessTokenReq',
      { accessToken: creds.accessToken },
      'ProtoOAGetAccountListByAccessTokenRes') as any;
    const ids: number[] = res.ctidTraderAccountId ?? res.ctidTraderAccountIds ?? [];
    return ids.map(Number).filter(Boolean);
  } finally {
    s.close();
  }
}

async function ctSymbolMap(s: Session, accountId?: string): Promise<Map<number, { name: string; digits: number }>> {
  const res = await s.send('ProtoOASymbolsListReq',
    { ctidTraderAccountId: Number(accountId ?? 0) }, 'ProtoOASymbolsListRes') as any;
  const m = new Map<number, { name: string; digits: number }>();
  for (const sym of res.symbol ?? []) {
    m.set(Number(sym.symbolId), {
      name: String(sym.symbolName ?? sym.symbolId),
      digits: Number((sym as any).digits ?? (sym as any).pipPosition ?? 5),
    });
  }
  return m;
}

function ctMapDeal(root: any, syms: Map<number, { name: string; digits: number }>, d: any): NormalizedFill | null {
  try {
    if (!d.closeTimestamp || d.closePrice == null) return null;
    const sym = syms.get(Number(d.symbolId));
    const digits = sym?.digits ?? 5;
    const cpd = d.closePositionDetail ?? {};
    return toNormalizedFill({
      externalId: `ctrader:${d.dealId}`,
      pair: normalizeSymbol(sym?.name ?? String(d.symbolId)),
      direction: normalizeDirection(tradeSide(root, d.tradeSide)),
      lot: normalizeLotAmount(Math.abs(Number(d.volume ?? 0)) / 100),
      entry: normalizePrice(d.openPrice ?? d.entryPrice ?? 0, digits),
      exit: normalizePrice(d.closePrice ?? d.executionPrice ?? 0, digits),
      stopLoss: normalizePrice(d.openPrice ?? d.entryPrice ?? 0, digits),
      takeProfit: normalizePrice(d.openPrice ?? d.entryPrice ?? 0, digits),
      openedAt: normalizeTimestamp(Number(d.openTimestamp)),
      closedAt: normalizeTimestamp(Number(d.closeTimestamp)),
      grossPL: normalizeMoneyMinor(cpd.grossProfit ?? cpd.profit ?? 0),
      commission: Math.abs(normalizeMoneyMinor(cpd.commission ?? 0)) + Math.abs(normalizeMoneyMinor(cpd.swap ?? d.swap ?? 0)),
      strategy: 'cTrader import',
      raw: d,
    });
  } catch {
    return null; // one bad deal never sinks the sync (externalId preserved on good rows)
  }
}

function tradeSide(root: any, v: unknown): string {
  try {
    const en = root.lookupEnum('ProtoTradeSide');
    for (const [name, id] of Object.entries(en.values)) {
      if (id === Number(v)) return name;
    }
  } catch { /* ignore */ }
  return Number(v) === 2 ? 'SELL' : 'BUY';
}
