// Idempotency proof for the sync engine (run: deno test --allow-net tests/).
// Scenario from spec: 100 imported → re-run 0 duplicates → +2 new → 102 total.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { dedupeFills } from '../lib/journal.ts';
import type { NormalizedFill } from '../core/adapter.ts';

const mk = (i: number): NormalizedFill => ({
  externalId: `oanda:${1000 + i}`,
  pair: 'EUR/USD',
  direction: i % 2 ? 'Buy' : 'Sell',
  lot: 0.5,
  entry: 1.085,
  exit: 1.087,
  stopLoss: 1.083,
  takeProfit: 1.089,
  openedAt: '2026-01-01T10:00:00.000Z',
  closedAt: '2026-01-01T12:00:00.000Z',
  grossPL: 10,
  commission: 0,
});

Deno.test('sync is idempotent: 100, then 0, then +2 = 102', () => {
  const journal = new Set<string>();
  const first = Array.from({ length: 100 }, (_, i) => mk(i));
  const r1 = dedupeFills(journal, first);
  assertEquals(r1.fresh.length, 100);
  assertEquals(r1.skipped, 0);
  for (const f of r1.fresh) journal.add(f.externalId);

  const r2 = dedupeFills(journal, first);
  assertEquals(r2.fresh.length, 0);
  assertEquals(r2.skipped, 100);

  const third = [...first, mk(100), mk(101)];
  const r3 = dedupeFills(journal, third);
  assertEquals(r3.fresh.length, 2);
  assertEquals(r3.skipped, 100);
  for (const f of r3.fresh) journal.add(f.externalId);
  assertEquals(journal.size, 102);
});

Deno.test('fills without external ids never enter the journal', () => {
  const bad = { ...mk(1), externalId: '' };
  const r = dedupeFills(new Set(), [bad]);
  assertEquals(r.fresh.length, 0);
  assertEquals(r.skipped, 1);
});
