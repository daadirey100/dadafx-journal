// Pure, side-effect-free guards — unit-tested, no network, no DB.
// The route handlers below delegate every yes/no decision to these.

export const STATE_TTL_MS = 15 * 60e3;
export const CODE_TTL_MS = 10 * 60e3;
export const TOKEN_REFRESH_MARGIN_MS = 10 * 60e3;
export const MAX_PAIR_ATTEMPTS = 5;

/** OAuth state freshness (CSRF window). */
export function isStateFresh(createdAt: string | number | Date, now = Date.now(), ttlMs = STATE_TTL_MS): boolean {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t >= 0 && now - t <= ttlMs;
}

/** Pairing-code usability verdict (expiry, reuse, brute-force). */
export function pairingVerdict(
  code: { used?: boolean | null; expires_at?: string | null; attempts?: number | null },
  now = Date.now(),
): { ok: boolean; reason: string } {
  if (!code || code.used) return { ok: false, reason: 'Invalid pairing code.' };
  if ((code.attempts ?? 0) >= MAX_PAIR_ATTEMPTS) return { ok: false, reason: 'Too many attempts — generate a fresh code.' };
  const exp = code.expires_at ? new Date(code.expires_at).getTime() : NaN;
  if (!Number.isFinite(exp) || now > exp) return { ok: false, reason: 'Pairing code expired — generate a fresh one.' };
  return { ok: true, reason: '' };
}

/** Proactive token rollover decision. */
export function needsTokenRefresh(tokenExpiresAt: string | null | undefined, now = Date.now(), marginMs = TOKEN_REFRESH_MARGIN_MS): boolean {
  if (!tokenExpiresAt) return true;
  const exp = new Date(tokenExpiresAt).getTime();
  if (!Number.isFinite(exp)) return true;
  return exp - now <= marginMs;
}
