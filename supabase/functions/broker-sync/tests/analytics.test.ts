// Analytics math tests — run against the REAL journal calculator
// (src/lib/calc.ts), so broker-imported rows are covered by construction.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { calcStats, equityCurve, maxDrawdown, tradeDurationMs, tradePL, tradeR } from '../../../../src/lib/calc.ts';
import type { Trade } from '../../../../src/lib/types.ts';

const t = (over: Partial<Trade>): Trade & { commission: number; exitAt: string | undefined } => ({
  id: Math.random().toString(36).slice(2), date: '2026-01-01T10:00', pair: 'EUR/USD',
  direction: 'Buy', lot: 1, entry: 1, stopLoss: 0.99, takeProfit: 1.02,
  exit: null, exitAt: undefined, commission: 0, riskPct: 1, strategy: 's', session: 'London',
  timeframe: 'H1', setup: '', emotions: '', mistakes: '', notes: '', rating: 3, ...over,
});

Deno.test('journal analytics: wins, losses, PF, expectancy, R', () => {
  // EUR/USD 1 lot: +0.01 price move = +$1000. Two wins (+1000, +500), one loss (-1500).
  // Risk distance 0.01 ($1000) → R multiples +1, +0.5, −1.5.
  const trades = [
    t({ entry: 1.1, exit: 1.11, stopLoss: 1.09, takeProfit: 1.12 }), // +1000
    t({ entry: 1.1, exit: 1.105, stopLoss: 1.09, takeProfit: 1.12 }), // +500
    t({ entry: 1.1, exit: 1.085, stopLoss: 1.09, takeProfit: 1.12 }), // -1500
  ];
  assertEquals(tradePL(trades[0]), 1000);
  const s = calcStats(trades);
  assertEquals(s.total, 3);
  assertEquals(s.wins, 2);
  assertEquals(s.losses, 1);
  assertEquals(s.winRate, (2 / 3) * 100);
  assertEquals(s.totalPL, 0);
  assertEquals(s.grossProfit, 1500);
  assertEquals(s.grossLoss, 1500);
  assertEquals(s.profitFactor, 1);
  assertEquals(s.expectancy, 0);
  assertEquals(s.avgWin, 750);
  assertEquals(s.avgLoss, 1500);
  // R: risk dist 0.001 ($1000 risk) → +1R, +0.5R, −1.5R
  assertEquals(tradeR(trades[0]), 1);
  assertEquals(s.avgR, 0);
});

Deno.test('drawdown + durations behave', () => {
  const trades = [
    t({ entry: 1.1, exit: 1.11, date: '2026-01-01T10:00', exitAt: '2026-01-01T12:00' }),
    t({ entry: 1.1, exit: 1.09, date: '2026-01-02T10:00', exitAt: '2026-01-02T11:00' }),
  ];
  const curve = equityCurve(trades, 10000);
  assertEquals(curve[curve.length - 1].equity, 10000 + 1000 - 1000);
  assertEquals(maxDrawdown(trades, 10000), -1000);
  assertEquals(tradeDurationMs(trades[0]), 2 * 3600e3);
  assertEquals(tradeDurationMs({ ...trades[0], exitAt: undefined }), null);
});
