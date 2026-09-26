// OandaAdapter — official OANDA REST v20, READ-ONLY endpoints only.
// Verified against developer.oanda.com/rest-live-v20:
//  - auth:    Authorization: Bearer <personal token> (Manage API Access)
//  - hosts:   api-fxpractice.oanda.com / api-fxtrade.oanda.com
//  - list:    GET /v3/accounts -> { accounts: [{ id }] }
//  - summary: GET /v3/accounts/{id}/summary
//  - open:    GET /v3/accounts/{id}/openPositions | /pendingOrders
//  - history: GET /v3/accounts/{id}/transactions?from&to (returns PAGES to
//             follow) and /transactions/sinceid?id= (returns rows directly).
//  - fills:   ORDER_FILL { tradeOpened{tradeID,units}, price, time },
//             closings via tradesClosed[] / tradeReduced {tradeID,units,realizedPL},
//             financing via DAILY_FINANCING (+ per-fill financing fields).
// Only GET requests exist in this file — execution is impossible by construction.
import type {
  BrokerAdapter, BrokerConnection, BrokerCredentials, HealthStatus,
  NormalizedAccount, NormalizedFill, NormalizedOrder, NormalizedPosition,
  NormalizedSummary, SyncResult,
} from '../core/adapter.ts';
import {
  normalizeCost, normalizeDirection, normalizeLots, normalizeMoney,
  normalizeSymbol, normalizeTimestamp, toNormalizedFill,
} from '../core/normalize.ts';

export interface OandaCreds {
  environment: 'practice' | 'live';
  accountId: string;
  token: string;
}

const HOST = {
  practice: 'https://api-fxpractice.oanda.com',
  live: 'https://api-fxtrade.oanda.com',
} as const;

const MAX_PAGES = 100; // 100 × 1000 transactions per sync is plenty for a journal

async function api(c: OandaCreds, path: string): Promise<any> {
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${HOST[c.environment]}/v3${path}`, {
      headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw new Error('OANDA unreachable — check internet (api-fxpractice/api-fxtrade.oanda.com).');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('OANDA rejected the token (401) — it may be revoked. Reconnect with a fresh token from Manage API Access.');
    if (res.status === 404) throw new Error('OANDA account not found (404) — check the Account ID and practice vs live.');
    if (res.status === 429) throw new Error('OANDA rate limit (429) — wait a minute and Sync now.');
    throw new Error(`OANDA ${res.status}: ${body.slice(0, 160) || res.statusText}`);
  }
  return { json: await res.json(), latencyMs: Date.now() - t0 };
}

interface Leg { units: number; price: number; time: string; pl: number; fin: number }

export class OandaAdapter implements BrokerAdapter {
  readonly id = 'oanda' as const;
  constructor(private creds: OandaCreds) {}

  async connect(_c: BrokerCredentials): Promise<BrokerConnection> {
    throw new Error('connect() is handled by the router (credentials persist after healthCheck).');
  }
  async disconnect(_id: string): Promise<void> {
    throw new Error('disconnect() is handled by the router.');
  }

  async healthCheck(_id: string): Promise<HealthStatus> {
    const t0 = Date.now();
    try {
      await api(this.creds, `/accounts/${encodeURIComponent(this.creds.accountId)}/summary`);
      return { ok: true, latencyMs: Date.now() - t0, message: 'OK', serverTime: new Date().toISOString() };
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - t0, message: String((e as Error)?.message ?? e) };
    }
  }

  async getAccounts(_id: string): Promise<NormalizedAccount[]> {
    // Official discovery endpoint (kept INSIDE the contract method so the
    // adapter surface stays exactly the 10 read-only methods).
    const { json: listed } = await api(this.creds, '/accounts');
    const ids = ((listed.accounts ?? []) as any[]).map(a => String(a.id));
    if (!ids.includes(this.creds.accountId)) {
      throw new Error(`Account ${this.creds.accountId} is not visible to this token (token sees: ${ids.join(', ') || 'none'}).`);
    }
    const { json } = await api(this.creds, `/accounts/${encodeURIComponent(this.creds.accountId)}/summary`);
    const a = json.account;
    return [{
      externalId: a.id,
      label: `OANDA ${a.alias ?? a.id}`,
      currency: a.currency,
      balance: Number(a.balance),
      equity: Number(a.NAV),
      marginUsed: Number(a.marginUsed),
    }];
  }

  async getAccountSummary(_id: string): Promise<NormalizedSummary> {
    const [acct] = await this.getAccounts(_id);
    const { positions, orders } = await this.getTrades(_id);
    return { ...acct, openPositions: positions.length, pendingOrders: orders.length };
  }

  async getOpenPositions(_id: string): Promise<NormalizedPosition[]> {
    const { json } = await api(this.creds, `/accounts/${encodeURIComponent(this.creds.accountId)}/openPositions`);
    const out: NormalizedPosition[] = [];
    for (const p of json.positions ?? []) {
      for (const side of [p.long, p.short].filter(Boolean)) {
        const units = Number(side.units);
        if (!units) continue;
        out.push({
          externalId: `oanda:pos:${p.instrument}:${units > 0 ? 'long' : 'short'}`,
          pair: normalizeSymbol(p.instrument),
          direction: normalizeDirection(units),
          lot: normalizeLots(units),
          entry: Number(side.averagePrice),
          stopLoss: null,
          takeProfit: null,
          unrealizedPL: normalizeMoney(side.unrealizedPL),
          openedAt: new Date().toISOString(),
        });
      }
    }
    return out;
  }

  async getOrders(_id: string): Promise<NormalizedOrder[]> {
    const { json } = await api(this.creds, `/accounts/${encodeURIComponent(this.creds.accountId)}/pendingOrders`);
    return (json.orders ?? []).map((o: any) => ({
      externalId: `oanda:order:${o.id}`,
      pair: normalizeSymbol(o.instrument),
      direction: normalizeDirection(Number(o.units)),
      lot: normalizeLots(o.units),
      price: o.price ? Number(o.price) : null,
      kind: String(o.type ?? '').replace(/_/g, ' '),
      placedAt: normalizeTimestamp(o.createTime),
    }));
  }

  async getTrades(_id: string) {
    const [positions, orders] = await Promise.all([this.getOpenPositions(_id), this.getOrders(_id)]);
    return { positions, orders };
  }

  /**
   * History via the OFFICIAL pagination flow:
   * time-range query -> follow `pages[]` (idrange URLs) -> rows.
   * No `type` filter is sent (unknown filters 400; the normalizer ignores
   * non-fill rows defensively instead).
   */
  async getTradeHistory(_id: string, opts?: { sinceISO?: string }): Promise<NormalizedFill[]> {
    // 7-day overlap absorbs late-arriving fills; dedup makes repeats harmless.
    const base = opts?.sinceISO ? new Date(opts.sinceISO).getTime() : Date.now() - 90 * 864e5;
    const since = new Date(base - 7 * 864e5).toISOString();
    const params = new URLSearchParams({
      from: since, to: new Date().toISOString(), pageSize: '1000',
    });
    const { json: head } = await api(
      this.creds,
      `/accounts/${encodeURIComponent(this.creds.accountId)}/transactions?${params}`,
    );
    const txs: any[] = [];
    const pages: string[] = head.pages ?? [];
    for (const url of pages.slice(0, MAX_PAGES)) {
      // Pages are absolute OANDA URLs on the same host — never follow off-host.
      const u = new URL(url);
      const host = new URL(HOST[this.creds.environment]);
      if (u.host !== host.host) continue;
      const { json } = await api(this.creds, u.pathname + u.search);
      txs.push(...(json.transactions ?? []));
    }
    return fillsFromTransactions(txs);
  }

  async sync(_id: string): Promise<SyncResult> {
    throw new Error('sync() is orchestrated by the router (history → merge).');
  }
}

/** Pure normalizer — exported for unit testing without credentials. */
export function fillsFromTransactions(txs: any[]): NormalizedFill[] {
  interface Bucket {
    instrument: string;
    open: Leg | null;
    closes: Leg[];
    financing: number;
    rawOpen?: any;
    rawCloses?: any[];
  }
  const byTrade = new Map<string, Bucket>();
  const bucket = (id: string, instrument: string): Bucket => {
    let b = byTrade.get(id);
    if (!b) {
      b = { instrument, open: null, closes: [], financing: 0 };
      byTrade.set(id, b);
    }
    return b;
  };

  for (const t of txs) {
    if ((t.type === 'DAILY_FINANCING' || t.type === 'INTEREST') && t.tradeID) {
      const b = bucket(String(t.tradeID), '');
      b.financing += Math.abs(Number(t.financing ?? 0));
      continue;
    }
    const opened = t.tradeOpened;
    if (opened) {
      const b = bucket(String(opened.tradeID), t.instrument);
      if (!b.open) {
        b.open = {
          units: Number(opened.units), price: Number(t.price ?? 0),
          time: t.time, pl: 0, fin: 0,
        };
        b.rawOpen = t;
      }
      continue;
    }
    const closedList = t.tradesClosed ?? (t.tradeReduced ? [t.tradeReduced] : []);
    for (const c of closedList) {
      const b = bucket(String(c.tradeID), t.instrument);
      b.closes.push({
        units: Number(c.units), price: Number(t.price ?? 0), time: t.time,
        pl: Number(c.realizedPL ?? 0), fin: Math.abs(Number(c.financing ?? 0)),
      });
      (b.rawCloses ??= []).push(t);
    }
  }

  const fills: NormalizedFill[] = [];
  for (const [tradeID, b] of byTrade) {
    try {
      if (!b.open || !b.instrument || !b.open.price) continue;
      const net = b.open.units + b.closes.reduce((a, c) => a + c.units, 0);
      if (Math.abs(net) > 1e-9) continue; // still open / partial — journal takes fully closed only
      const last = b.closes[b.closes.length - 1];
      if (!last?.price) continue;
      fills.push(toNormalizedFill({
        externalId: `oanda:${tradeID}`,
        pair: normalizeSymbol(b.instrument),
        direction: normalizeDirection(b.open.units),
        lot: normalizeLots(b.open.units),
        entry: b.open.price,
        exit: last.price,
        stopLoss: b.open.price, // fills don't report SL/TP — journal math stays null-safe
        takeProfit: b.open.price,
        openedAt: normalizeTimestamp(b.open.time),
        closedAt: normalizeTimestamp(last.time),
        grossPL: normalizeMoney(b.closes.reduce((a, c) => a + c.pl, 0)),
        commission: normalizeCost(...b.closes.map(c => c.fin), b.financing),
        strategy: 'OANDA import',
        raw: { open: b.rawOpen, closes: b.rawCloses },
      }));
    } catch { /* one bad fill never sinks the sync */ }
  }
  return fills.sort((a, b) => a.closedAt.localeCompare(b.closedAt));
}
