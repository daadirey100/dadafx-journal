import { tradePL, tradeR } from './calc';
import type { Trade } from './types';

// Shared mistake analytics — used by the Mistake Tracker page and the
// journal's save-time warning.

export interface MistakeStat {
  name: string;
  n: number;
  pl: number;
  r: number;
  wr: number;
}

export function mistakeStats(trades: Trade[]): MistakeStat[] {
  const m = new Map<string, { n: number; pl: number; r: number; wins: number }>();
  for (const t of trades) {
    if (t.exit == null) continue;
    const name = (t.mistakes || '').split(',')[0].trim() || 'No mistake noted';
    const e = m.get(name) ?? { n: 0, pl: 0, r: 0, wins: 0 };
    const pl = tradePL(t) ?? 0;
    e.n++;
    e.pl += pl;
    e.r += tradeR(t) ?? 0;
    if (pl > 0) e.wins++;
    m.set(name, e);
  }
  return [...m.entries()]
    .map(([name, v]) => ({ name, n: v.n, pl: v.pl, r: v.r, wr: v.n ? (v.wins / v.n) * 100 : 0 }))
    .sort((a, b) => a.pl - b.pl);
}

// First mistake tag in a ticket that has historically COST money.
// Returns the tag name, or null when the ticket is clean (or warnings off).
export function costlyMistakeHit(trades: Trade[], mistakesStr: string, warnOn: boolean): string | null {
  if (!warnOn || !mistakesStr) return null;
  const stats = mistakeStats(trades);
  for (const tag of mistakesStr.split(',').map(s => s.trim()).filter(Boolean)) {
    const hit = stats.find(s => s.name.toLowerCase() === tag.toLowerCase());
    if (hit && hit.pl < 0) return tag;
  }
  return null;
}

// Longest comma-tag currently flagged in the journal inputs and seeds.
export const MISTAKE_COST_THRESHOLD = 1; // dollars — any net loss counts