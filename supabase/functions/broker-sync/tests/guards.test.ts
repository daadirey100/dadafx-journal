// Guard unit tests: OAuth state, pairing codes, token rollover.
// Run: deno test --allow-net supabase/functions/broker-sync/tests/
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isStateFresh, needsTokenRefresh, pairingVerdict } from '../core/guards.ts';

const MIN = 60e3;

Deno.test('oauth state: fresh within window, stale after', () => {
  const now = Date.now();
  assertEquals(isStateFresh(new Date(now - 5 * MIN).toISOString(), now), true);
  assertEquals(isStateFresh(new Date(now - 16 * MIN).toISOString(), now), false);
  assertEquals(isStateFresh(new Date(now + MIN).toISOString(), now), false); // future = forged
  assertEquals(isStateFresh('garbage', now), false);
});

Deno.test('pairing codes: one-time, expiring, brute-force capped', () => {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  assertEquals(pairingVerdict({ used: false, expires_at: iso(now + 5 * MIN), attempts: 0 }, now).ok, true);
  assertEquals(pairingVerdict({ used: true, expires_at: iso(now + 5 * MIN), attempts: 0 }, now).ok, false);
  assertEquals(pairingVerdict({ used: false, expires_at: iso(now - MIN), attempts: 0 }, now).reason.includes('expired'), true);
  assertEquals(pairingVerdict({ used: false, expires_at: iso(now + 5 * MIN), attempts: 5 }, now).reason.includes('Too many'), true);
  assertEquals(pairingVerdict(null as any, now).ok, false);
});

Deno.test('token refresh triggers inside the margin only', () => {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  assertEquals(needsTokenRefresh(iso(now + 60 * MIN), now), false);
  assertEquals(needsTokenRefresh(iso(now + 5 * MIN), now), true);
  assertEquals(needsTokenRefresh(iso(now - MIN), now), true);
  assertEquals(needsTokenRefresh(null, now), true);
  assertEquals(needsTokenRefresh('nope', now), true);
});
