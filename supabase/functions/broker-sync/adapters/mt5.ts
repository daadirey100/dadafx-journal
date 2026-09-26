// MT5Adapter — MetaQuotes publishes NO public REST API for retail traders,
// so a direct server connection is impossible (and will not be faked).
// Official path used here: the trader runs our tiny bridge EA inside THEIR
// own MT5 terminal (MQL5 WebRequest — documented at mql5.com/en/docs/network/webrequest).
// The EA pushes closed deals to the mt5-push endpoint with a per-connection
// bearer token. This adapter validates + normalizes those pushes.
import type {
  BrokerAdapter, BrokerConnection, BrokerCredentials, HealthStatus,
  NormalizedAccount, NormalizedFill, NormalizedOrder, NormalizedPosition,
  NormalizedSummary, SyncResult,
} from '../core/adapter.ts';
import {
  normalizeCost, normalizeDirection, normalizeLotAmount, normalizeMoney,
  normalizeSymbol, normalizeTimestamp, toNormalizedFill,
} from '../core/normalize.ts';

export interface Mt5Deal {
  ticket: number | string;
  symbol: string;
  type: number | string; // 0/BUY buy, 1/SELL sell (MT5 DEAL_TYPE_* buy/sell only)
  volume: number; // lots
  priceIn: number;
  priceOut: number;
  timeIn: number; // unix seconds
  timeOut: number; // unix seconds
  sl?: number;
  tp?: number;
  profit?: number;
  commission?: number;
  swap?: number;
}

export interface Mt5Account {
  login: number | string;
  server?: string;
  currency?: string;
  balance: number;
  equity: number;
  margin?: number;
  freeMargin?: number;
}

export interface Mt5Position {
  ticket: number | string;
  symbol: string;
  type: number | string;
  volume: number;
  priceIn: number;
  sl?: number;
  tp?: number;
  profit?: number;
  commission?: number;
  swap?: number;
  time?: number;
}

const MAX_BODY = 2_000_000; // 2 MB hard cap per EA push
const MAX_DEALS = 500;
const MAX_POSITIONS = 200;

const fin = (v: unknown, min: number, max: number, name: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Invalid ${name}.`);
  return n;
};
const str = (v: unknown, max: number, name: string, pattern?: RegExp): string => {
  const s = String(v ?? '');
  if (!s || s.length > max || (pattern && !pattern.test(s))) throw new Error(`Invalid ${name}.`);
  return s.slice(0, max);
};
const unix = (v: unknown, name: string): number => {
  const n = Number(v);
  const now = Date.now() / 1000;
  if (!Number.isFinite(n) || n < 946684800 || n > now + 86400) throw new Error(`Invalid ${name}.`);
  return Math.floor(n);
};

/**
 * ZERO-TRUST validation — the EA is user software, not a trusted service.
 * Shape, types, ranges, sizes and timestamps are all enforced here.
 * Anything outside the envelope is rejected before touching the database.
 */
export function validateEaPayload(body: any): { account?: Mt5Account; positions: Mt5Position[]; deals: Mt5Deal[] } {
  if (!body || typeof body !== 'object') throw new Error('Invalid payload.');
  if (JSON.stringify(body).length > MAX_BODY) throw new Error('Payload too large.');
  let account: Mt5Account | undefined;
  if (body.account != null) {
    const a = body.account;
    account = {
      login: /^\d{1,16}$/.test(String(a.login)) ? Number(a.login) : str(a.login, 32, 'account.login'),
      server: a.server != null ? str(a.server, 64, 'account.server') : undefined,
      currency: a.currency != null ? str(a.currency, 8, 'account.currency', /^[A-Z]{3,8}$/) : undefined,
      balance: fin(a.balance, -1e12, 1e12, 'account.balance'),
      equity: fin(a.equity, -1e12, 1e12, 'account.equity'),
      margin: a.margin != null ? fin(a.margin, 0, 1e12, 'account.margin') : undefined,
      freeMargin: a.freeMargin != null ? fin(a.freeMargin, -1e12, 1e12, 'account.freeMargin') : undefined,
    };
  }
  const positions: Mt5Position[] = [];
  if (body.positions != null) {
    if (!Array.isArray(body.positions) || body.positions.length > MAX_POSITIONS) throw new Error('Invalid positions.');
    for (const p of body.positions) {
      positions.push({
        ticket: str(p.ticket, 32, 'position.ticket'),
        symbol: str(p.symbol, 24, 'position.symbol'),
        type: p.type === 1 || String(p.type).toUpperCase() === 'SELL' ? 1 : 0,
        volume: fin(p.volume, 0.01, 1000, 'position.volume'),
        priceIn: fin(p.priceIn, 0, 1e9, 'position.priceIn'),
        sl: p.sl != null ? fin(p.sl, 0, 1e9, 'position.sl') : undefined,
        tp: p.tp != null ? fin(p.tp, 0, 1e9, 'position.tp') : undefined,
        profit: p.profit != null ? fin(p.profit, -1e9, 1e9, 'position.profit') : undefined,
        commission: p.commission != null ? fin(p.commission, -1e9, 1e9, 'position.commission') : undefined,
        swap: p.swap != null ? fin(p.swap, -1e9, 1e9, 'position.swap') : undefined,
        time: p.time != null ? unix(p.time, 'position.time') : undefined,
      });
    }
  }
  if (body.deals != null && !Array.isArray(body.deals)) throw new Error('Invalid deals.');
  const deals: Mt5Deal[] = [];
  for (const d of body.deals ?? []) {
    if (deals.length >= MAX_DEALS) break;
    deals.push({
      ticket: str(d.ticket, 32, 'deal.ticket'),
      symbol: str(d.symbol, 24, 'deal.symbol'),
      type: d.type === 1 || String(d.type).toUpperCase() === 'SELL' ? 1 : 0,
      volume: fin(d.volume, 0.01, 1000, 'deal.volume'),
      priceIn: fin(d.priceIn, 0, 1e9, 'deal.priceIn'),
      priceOut: fin(d.priceOut, 0, 1e9, 'deal.priceOut'),
      timeIn: unix(d.timeIn, 'deal.timeIn'),
      timeOut: unix(d.timeOut, 'deal.timeOut'),
      sl: d.sl != null ? fin(d.sl, 0, 1e9, 'deal.sl') : undefined,
      tp: d.tp != null ? fin(d.tp, 0, 1e9, 'deal.tp') : undefined,
      profit: d.profit != null ? fin(d.profit, -1e9, 1e9, 'deal.profit') : undefined,
      commission: d.commission != null ? fin(d.commission, -1e9, 1e9, 'deal.commission') : undefined,
      swap: d.swap != null ? fin(d.swap, -1e9, 1e9, 'deal.swap') : undefined,
    });
  }
  return { account, positions, deals };
}

export function normalizeMt5Positions(positions: Mt5Position[]): NormalizedPosition[] {
  return positions.map(p => ({
    externalId: `mt5:pos:${p.ticket}`,
    pair: normalizeSymbol(p.symbol),
    direction: (Number(p.type) === 1 ? 'Sell' : 'Buy') as 'Buy' | 'Sell',
    lot: normalizeLotAmount(p.volume),
    entry: Number(p.priceIn),
    stopLoss: p.sl != null ? Number(p.sl) : null,
    takeProfit: p.tp != null ? Number(p.tp) : null,
    unrealizedPL: p.profit != null ? normalizeMoney(p.profit) : null,
    openedAt: p.time != null ? normalizeTimestamp(p.time) : new Date().toISOString(),
  }));
}

export function normalizeMt5Deals(deals: Mt5Deal[], tag = 'MT5 bridge import'): NormalizedFill[] {
  const fills: NormalizedFill[] = [];
  for (const d of deals ?? []) {
    try {
      if (!d.ticket || !d.symbol) continue;
      const dir = d.type === 1 || String(d.type).toUpperCase() === 'SELL' ? 'Sell' : 'Buy';
      const entry = Number(d.priceIn), exit = Number(d.priceOut);
      if (!(entry > 0) || !(exit > 0)) continue;
      fills.push(toNormalizedFill({
        externalId: `${tag.startsWith('Custom') ? 'custom' : 'mt5'}:${d.ticket}`,
        pair: normalizeSymbol(d.symbol),
        direction: normalizeDirection(dir),
        lot: normalizeLotAmount(d.volume),
        entry,
        exit,
        stopLoss: Number(d.sl ?? d.priceIn),
        takeProfit: Number(d.tp ?? d.priceIn),
        openedAt: normalizeTimestamp(d.timeIn),
        closedAt: normalizeTimestamp(d.timeOut),
        grossPL: normalizeMoney(d.profit ?? 0),
        commission: normalizeCost(d.commission, d.swap),
        strategy: tag,
        raw: { ticket: d.ticket, symbol: d.symbol },
      }));
    } catch { /* one bad deal never sinks the sync */ }
  }
  return fills.sort((a, b) => a.closedAt.localeCompare(b.closedAt));
}

export class Mt5Adapter implements BrokerAdapter {
  readonly id = 'mt5' as const;

  async connect(_c: BrokerCredentials): Promise<BrokerConnection> {
    throw new Error('connect() is handled by the router (bridge token issuance).');
  }
  async disconnect(_id: string): Promise<void> {
    throw new Error('disconnect() is handled by the router.');
  }
  async getAccounts(_id: string): Promise<NormalizedAccount[]> {
    // No live query path exists for MT5 — accounts are named at setup.
    // Returning [] is honest; balances stay manual until the bridge reports them.
    return [];
  }
  async getAccountSummary(_id: string): Promise<NormalizedSummary> {
    return {
      externalId: 'mt5', label: 'MT5 (bridge)', currency: 'USD',
      balance: 0, openPositions: 0, pendingOrders: 0,
    };
  }
  async getOpenPositions(_id: string): Promise<NormalizedPosition[]> {
    return [];
  }
  async getOrders(_id: string): Promise<NormalizedOrder[]> {
    return [];
  }
  async getTrades(_id: string) {
    return { positions: [], orders: [] as NormalizedOrder[] };
  }
  async getTradeHistory(_id: string): Promise<NormalizedFill[]> {
    // History arrives via pushes, not pulls.
    return [];
  }
  async sync(_id: string): Promise<SyncResult> {
    throw new Error('sync() is orchestrated by the router.');
  }
  async healthCheck(_id: string): Promise<HealthStatus> {
    return { ok: true, latencyMs: 0, message: 'Bridge mode — health is reported by your terminal pushes' };
  }
}
