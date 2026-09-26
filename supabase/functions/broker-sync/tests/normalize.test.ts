// Normalizer unit tests: every broker dialect in, one DadaFX dialect out.
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  normalizeCost, normalizeDirection, normalizeLotAmount, normalizeLots,
  normalizeMoney, normalizeMoneyMinor, normalizePrice, normalizeSymbol,
  normalizeTimestamp, plannedRR, toNormalizedFill,
} from '../core/normalize.ts';

Deno.test('symbols converge to slash form', () => {
  assertEquals(normalizeSymbol('EUR_USD'), 'EUR/USD');
  assertEquals(normalizeSymbol('EURUSD'), 'EUR/USD');
  assertEquals(normalizeSymbol('EURUSD.pro'), 'EUR/USD');
  assertEquals(normalizeSymbol('XAUUSD'), 'XAU/USD');
  assertEquals(normalizeSymbol('US30'), 'US30');
});

Deno.test('directions converge, numeric codes rejected centrally', () => {
  assertEquals(normalizeDirection('BUY'), 'Buy');
  assertEquals(normalizeDirection('sell'), 'Sell');
  assertEquals(normalizeDirection('long'), 'Buy');
  assertEquals(normalizeDirection(-500), 'Sell');
  assertEquals(normalizeDirection(250), 'Buy');
  assertThrows(() => normalizeDirection('sideways'));
});

Deno.test('timestamps converge to ISO UTC', () => {
  assertEquals(normalizeTimestamp(1700000000).startsWith('2023-11-14'), true);
  assertEquals(normalizeTimestamp(1700000000000).startsWith('2023-11-14'), true);
  assertEquals(normalizeTimestamp('20260101-123000'), '2026-01-01T12:30:00.000Z');
  assertThrows(() => normalizeTimestamp('yesterday-ish'));
});

Deno.test('quantities, prices, money stay exact', () => {
  assertEquals(normalizeLots(50000), 0.5);
  assertEquals(normalizeLotAmount(0.22), 0.22);
  assertEquals(normalizePrice(108500, 5), 1.085);
  assertEquals(normalizeMoneyMinor(1999), 19.99);
  assertEquals(normalizeMoney(10.105), 10.11);
  assertEquals(normalizeCost(-7.5, 2), 9.5);
  assertThrows(() => normalizeLots(0));
  assertThrows(() => normalizePrice(-3, 5));
});

Deno.test('planned RR is null when unknowable, never faked', () => {
  assertEquals(plannedRR(1.085, 1.083, 1.089), 2);
  assertEquals(plannedRR(1.085, 1.085, 1.089), null);
});

Deno.test('fill gate demands external id + sane prices', () => {
  const base: any = {
    externalId: 'oanda:1', pair: 'EUR/USD', direction: 'Buy', lot: 0.5,
    entry: 1.085, exit: 1.087, stopLoss: 1.083, takeProfit: 1.089,
    openedAt: '2026-01-01T10:00:00.000Z', closedAt: '2026-01-01T12:00:00.000Z',
    grossPL: 10, commission: 0,
  };
  assertEquals(toNormalizedFill(base).pair, 'EUR/USD');
  assertThrows(() => toNormalizedFill({ ...base, externalId: '' }));
  assertThrows(() => toNormalizedFill({ ...base, exit: 0 }));
});
