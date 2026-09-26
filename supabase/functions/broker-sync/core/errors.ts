// Error handling contract:
//  - users get HUMAN messages (never "invalid_grant", never stack traces)
//  - server logs get TECHNICAL detail with secrets scrubbed out
//  - no token, password, key or secret ever reaches a log, a toast, or a row.

const FRIENDLY: [RegExp, string][] = [
  [/invalid_grant|invalid grant|expired.*token|token.*expired/i,
    'Your broker authorization has expired. Please reconnect your account.'],
  [/401|unauthorized|invalid token|bad credentials|authentication failed/i,
    "We couldn't authenticate with your broker. Please reconnect the account."],
  [/403|forbidden|permission|not permitted/i,
    'Your broker refused the request (permissions). Reconnect, or check API access at your broker.'],
  [/404|not found/i,
    'Broker account not found — check the account ID and practice vs live environment.'],
  [/429|rate.?limit|too many/i,
    'Broker rate limit hit — wait a minute, then Sync now.'],
  [/timed out|timeout|unreachable|network|failed to fetch|enotfound/i,
    'Broker is unreachable right now — your data is safe, retry in a bit.'],
  [/proto|payload|spotware.*protocol|unknown message/i,
    'cTrader updated their protocol — the app needs an update. Your journal is untouched.'],
  [/state_expired|invalid_or_expired_state/i,
    'Authorization window expired — start “Continue with cTrader” again.'],
  [/server_not_configured|not configured/i,
    'Broker integration is not finished on the server yet — contact support.'],
  [/quota|storage/i,
    'Cloud storage hiccup — retry, and keep a local Backup for safety.'],
];

export function toUserError(err: unknown, fallback = 'Something went wrong talking to your broker.'): string {
  const raw = String((err as Error)?.message ?? err ?? '');
  for (const [re, msg] of FRIENDLY) {
    if (re.test(raw)) return msg;
  }
  // Unknown: short, safe, no internals.
  const clean = raw.replace(/[\r\n]+/g, ' ').slice(0, 140);
  return clean && !/[A-Za-z0-9]{24,}/.test(clean) ? clean : fallback;
}

/** Redact anything shaped like a secret before logging or storing. */
export function scrubSecretsText(s: string): string {
  return s
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/=]+/gi, 'Bearer [redacted]')
    .replace(/"?(token|password|secret|apiKey|api_key|accessToken|refreshToken|bridgeToken|code)"?\s*[:=]\s*"[^"]*"/gi, '"$1":"[redacted]"')
    .replace(/\b(password|passwd|pwd|client_secret)\b(\s*[:=]\s*)(\S+)/gi, '$1$2[redacted]')
    .replace(/eyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{3,}\.[A-Za-z0-9\-_]{3,}/g, '[jwt-redacted]')
    .replace(/[0-9a-f]{64}/gi, '[hex-redacted]');
}

export function scrubObj(obj: unknown): unknown {
  try {
    return JSON.parse(scrubSecretsText(JSON.stringify(obj)));
  } catch {
    return '[unloggable]';
  }
}

/** Server-side technical log — scrubbed, timestamped, never user-facing. */
export function logError(scope: string, err: unknown, context?: unknown) {
  try {
    console.error(JSON.stringify({
      at: new Date().toISOString(), scope,
      error: scrubSecretsText(String((err as Error)?.message ?? err ?? '')),
      context: context === undefined ? undefined : scrubObj(context),
    }));
  } catch { /* logging must never throw */ }
}
