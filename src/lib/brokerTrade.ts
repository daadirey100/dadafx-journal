import type { Trade } from './types';

/**
 * BrokerTrade + JournalMetadata split.
 *
 * A broker-imported row has TWO owners:
 *  - BROKER FACTS (entry, exit, quantity, profit, commission, timestamps…):
 *    authoritative, read-only, overwritten by nothing but a re-sync that
 *    carries the same externalId.
 *  - JOURNAL METADATA (notes, psychology, setup, tags, screenshots, rating,
 *    strategy, session, risk %, SL/TP placeholders the feed never sent):
 *    owned by the trader, freely editable.
 *
 * Manual trades have no facts — everything is journal.
 */

export const BROKER_FACTS = [
  'pair',
  'direction',
  'lot',
  'entry',
  'exit',
  'commission',
  'date',
  'exitAt',
] as const;

export type BrokerFact = (typeof BROKER_FACTS)[number];

export interface JournalMetadata {
  strategy: string;
  session: string;
  timeframe: string;
  setup: string;
  emotions: string;
  mistakes: string;
  notes: string;
  rating: number;
  riskPct: number;
  stopLoss: number;
  takeProfit: number;
  screenshot?: string;
  beforeShot?: string;
  afterShot?: string;
  accountId?: string;
}

export const isBrokerTrade = (t: Pick<Trade, 'source'>): boolean =>
  !!t.source && t.source !== 'manual';

/** Split a row into its two ownership halves (facts frozen for broker rows). */
export function splitTrade(t: Trade): { facts: Partial<Trade>; journal: JournalMetadata } {
  const {
    strategy, session, timeframe, setup, emotions, mistakes, notes, rating,
    riskPct, stopLoss, takeProfit, screenshot, beforeShot, afterShot, accountId,
  } = t;
  const journal: JournalMetadata = {
    strategy, session, timeframe, setup, emotions, mistakes, notes, rating,
    riskPct, stopLoss, takeProfit, screenshot, beforeShot, afterShot, accountId,
  };
  if (!isBrokerTrade(t)) return { facts: { ...t }, journal };
  const facts: Partial<Trade> = {};
  for (const k of BROKER_FACTS) (facts as any)[k] = (t as any)[k];
  facts.source = t.source;
  facts.externalId = t.externalId;
  return { facts, journal };
}

/** Merge an edited journal half back onto untouched broker facts. */
export function mergeTrade(original: Trade, journal: JournalMetadata): Trade {
  if (!isBrokerTrade(original)) return { ...original, ...journal };
  const merged = { ...original };
  for (const k of Object.keys(journal) as (keyof JournalMetadata)[]) {
    (merged as any)[k] = journal[k];
  }
  // Facts below are NEVER taken from the form — belt and suspenders.
  for (const k of BROKER_FACTS) (merged as any)[k] = (original as any)[k];
  merged.source = original.source;
  merged.externalId = original.externalId;
  return merged;
}

const numEq = (a: number | null | undefined, b: number | null | undefined): boolean => {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) < 1e-9;
};

/**
 * Accidental-duplicate guard: a NEW manual ticket matching an existing
 * BROKER row on pair + side + entry + exit is almost certainly the same
 * fill typed by hand. Returns the matches so the UI can ask first.
 */
export function findDuplicateImports(
  trades: Trade[],
  candidate: Pick<Trade, 'pair' | 'direction' | 'entry' | 'exit' | 'id'>,
): Trade[] {
  if (candidate.exit == null) return [];
  return trades.filter(
    t =>
      t.id !== candidate.id &&
      isBrokerTrade(t) &&
      t.pair === candidate.pair &&
      t.direction === candidate.direction &&
      numEq(t.entry, candidate.entry) &&
      numEq(t.exit, candidate.exit),
  );
}
