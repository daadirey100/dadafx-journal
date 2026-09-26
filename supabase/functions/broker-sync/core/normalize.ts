// Central NORMALIZER — the single place broker dialects become DadaFX.
// Adapters fetch + shape; EVERYTHING semantic lands here, so a new broker
// can never smuggle its own conventions into the journal.
//
// DadaFX canonical forms:
//   symbol    "EUR/USD" (slash form — charts, filters and pip math depend on it)
//   side      "Buy" | "Sell"
//   timestamps ISO-8601 UTC strings
//   quantity  lots (float)
//   money     account-currency units, rounded to cents at the boundary
// Raw provider objects are NEVER dropped: they ride along in `raw` and land
// in broker_trades.raw_metadata. External IDs are set by adapters and
// preserved untouched through merge, CSV and dedup.
import type { NormalizedFill } from './adapter.ts';

const cents = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

/** "EUR_USD" | "EURUSD" | "EURUSD.pro" | "XAUUSD" -> "EUR/USD" | "XAU/USD" | raw */
export function normalizeSymbol(raw: unknown): string {
  let n = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(PRO|ECN|RAW|M|STP)$/, '');
  if (/^[A-Z]{6}$/.test(n)) return `${n.slice(0, 3)}/${n.slice(3)}`;
  if (n.startsWith('XAU')) return 'XAU/USD';
  if (n.startsWith('XAG')) return 'XAG/USD';
  if (n.startsWith('XPT')) return 'XPT/USD';
  if (n.startsWith('XPD')) return 'XPD/USD';
  if (n.startsWith('BTC')) return 'BTC/USD';
  if (n.startsWith('ETH')) return 'ETH/USD';
  return String(raw ?? '');
}

/**
 * Strings ("BUY", "sell", "long", ...) and SIGNED quantities -> "Buy" | "Sell".
 * Bare numeric codes (0/1/2) are provider-specific and intentionally NOT
 * handled here — adapters resolve their own enums (cTrader ProtoTradeSide,
 * MT5 DEAL_TYPE_*) before calling this.
 */
export function normalizeDirection(raw: unknown): 'Buy' | 'Sell' {
  if (typeof raw === 'number') return raw < 0 ? 'Sell' : 'Buy';
  const s = String(raw ?? '').trim().toUpperCase();
  if (['BUY', 'B', 'LONG', 'L'].includes(s)) return 'Buy';
  if (['SELL', 'S', 'SHORT'].includes(s)) return 'Sell';
  throw new Error(`Unrecognized direction: ${String(raw)}`);
}

/** unix seconds/ms, ISO strings, "YYYYMMDD-HHMMSS" -> ISO UTC. Throws on garbage. */
export function normalizeTimestamp(raw: unknown): string {
  if (typeof raw === 'number') {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    if (isNaN(d.getTime())) throw new Error(`Bad timestamp: ${raw}`);
    return d.toISOString();
  }
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})[- ]?(\d{2})(\d{2})(\d{2})$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])).toISOString();
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error(`Bad timestamp: ${s}`);
  return d.toISOString();
}

/** Base-currency units -> lots (default 100 000 units = 1.0 lot). */
export function normalizeLots(units: unknown, unitSize = 100000): number {
  const lots = Math.abs(Number(units)) / unitSize;
  if (!Number.isFinite(lots) || lots <= 0 || lots > 10000) throw new Error(`Absurd quantity: ${units}`);
  return Math.round(lots * 100) / 100;
}

/** Lots directly (MT5-style volume). */
export function normalizeLotAmount(lot: unknown): number {
  const n = Math.abs(Number(lot));
  if (!Number.isFinite(n) || n <= 0 || n > 10000) throw new Error(`Absurd lot size: ${lot}`);
  return Math.round(n * 100) / 100;
}

/** Raw integer price + tick digits -> decimal price. */
export function normalizePrice(raw: unknown, digits = 5): number {
  const p = Number(raw) / Math.pow(10, digits);
  if (!Number.isFinite(p) || p <= 0) throw new Error(`Bad price: ${raw}`);
  return p;
}

/** Money in minor units (cents) -> major units, rounded. */
export function normalizeMoneyMinor(minor: unknown): number {
  return cents(Number(minor ?? 0) / 100);
}

/** Money already in major units, rounded to cents. */
export function normalizeMoney(major: unknown): number {
  const n = Number(major ?? 0);
  if (!Number.isFinite(n) || Math.abs(n) > 1e12) throw new Error(`Absurd money value: ${major}`);
  return cents(n);
}

/** Costs are stored POSITIVE (commission + swap + financing combined downstream). */
export function normalizeCost(...parts: unknown[]): number {
  return cents(parts.reduce((a: number, p: unknown) => a + Math.abs(Number(p ?? 0)), 0));
}

/** Planned risk:reward from entry/SL/TP (null when unknowable — never fake it). */
export function plannedRR(entry: number, sl: number, tp: number): number | null {
  const risk = Math.abs(entry - sl);
  if (!(risk > 0)) return null;
  return Math.abs(tp - entry) / risk;
}

export interface FillInput {
  externalId: string;
  pair: string;
  direction: 'Buy' | 'Sell';
  lot: number;
  entry: number;
  exit: number;
  stopLoss: number;
  takeProfit: number;
  openedAt: string;
  closedAt: string;
  grossPL: number;
  commission: number;
  strategy?: string;
  session?: string;
  raw?: unknown;
}

/** Final gate: every fill normalized, complete and carrying its provenance. */
export function toNormalizedFill(input: FillInput): NormalizedFill {
  if (!input.externalId) throw new Error('Fill dropped: missing external id (provenance is mandatory).');
  if (!(input.entry > 0) || !(input.exit > 0)) throw new Error(`Fill ${input.externalId} dropped: bad prices.`);
  return {
    externalId: input.externalId,
    pair: input.pair,
    direction: input.direction,
    lot: input.lot,
    entry: input.entry,
    exit: input.exit,
    stopLoss: input.stopLoss,
    takeProfit: input.takeProfit,
    openedAt: input.openedAt,
    closedAt: input.closedAt,
    grossPL: input.grossPL,
    commission: input.commission,
    strategy: input.strategy,
    session: input.session,
    raw: input.raw ?? null,
  };
}
