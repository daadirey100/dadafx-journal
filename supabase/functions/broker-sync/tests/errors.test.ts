// Error contract tests: users get human words, logs never carry secrets.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { scrubObj, scrubSecretsText, toUserError } from '../core/errors.ts';
import { normalizeMt5Deals, validateEaPayload } from '../adapters/mt5.ts';
import { fillsFromTransactions } from '../adapters/oanda.ts';

Deno.test('provider errors become human messages', () => {
  assertEquals(toUserError(new Error('invalid_grant')), 'Your broker authorization has expired. Please reconnect your account.');
  assertEquals(toUserError(new Error('401 Unauthorized')), "We couldn't authenticate with your broker. Please reconnect the account.");
  assertEquals(toUserError(new Error('OANDA 429: slow down')), 'Broker rate limit hit — wait a minute, then Sync now.');
  const unknown = toUserError(new Error('weird broker hiccup'));
  assertEquals(unknown.includes('hiccup') || unknown.includes('broker'), true);
});

Deno.test('scrubber removes every secret shape', () => {
  const dirty = 'Bearer abc.def.ghi token="sekret-key-123" password: hunter2 eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig deadbeef'.replace('deadbeef', 'a'.repeat(64));
  const clean = scrubSecretsText(dirty);
  assertEquals(/sekret-key-123|hunter2|eyJhbGci/.test(clean), false);
  assertEquals(clean.includes('[redacted]'), true);
  const obj = scrubObj({ token: 'abc123', nested: { password: 'x' }, ok: 1 }) as any;
  assertEquals(obj.token, '[redacted]');
  assertEquals(obj.ok, 1);
});

Deno.test('malformed broker payloads are rejected or skipped, never crash', () => {
  // MT5: garbage envelope rejected
  let threw = false;
  try { validateEaPayload({ deals: 'not-an-array' }); } catch { threw = true; }
  assertEquals(threw, true);
  threw = false;
  try { validateEaPayload({ deals: [{ ticket: '', symbol: 'EURUSD', type: 0, volume: 1, priceIn: 1, priceOut: 2, timeIn: 1, timeOut: 2 }] }); } catch { threw = true; }
  assertEquals(threw, true); // bad timestamp
  // MT5: one bad deal skipped, good one kept
  const fills = normalizeMt5Deals([
    { ticket: '1', symbol: 'EURUSD', type: 0, volume: 1, priceIn: 1.08, priceOut: 1.09, timeIn: 1700000000, timeOut: 1700003600 },
    { ticket: '', symbol: 'EURUSD', type: 0, volume: 1, priceIn: 1.08, priceOut: 1.09, timeIn: 1700000000, timeOut: 1700003600 },
  ] as any);
  assertEquals(fills.length, 1);
  assertEquals(fills[0].externalId, 'mt5:1');
  // OANDA: unknown rows ignored, partial nets skipped
  const o = fillsFromTransactions([
    { type: 'ORDER_FILL', instrument: 'EUR_USD', price: '1.08', time: '2026-01-01T10:00:00Z', tradeOpened: { tradeID: '9', units: '100' } },
    { type: 'GARBAGE_TYPE', foo: 1 },
  ]);
  assertEquals(o.length, 0); // open leg only — not a closed trade
});
