import { createClient } from '@supabase/supabase-js';

// Local overrides via .env.local (see .env.example). The publishable key is
// public by design — RLS enforces everything. Service-role / master keys
// MUST NEVER appear here (server function secrets only).
const URL = import.meta.env.VITE_SUPABASE_URL || 'https://ypayyghgwbmsejehndwj.supabase.co';
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_BssKdOP0eT7gt5xBbOs4Gw_KOSsPayy';

export const SUPABASE_URL = URL;
export const SUPABASE_KEY = KEY;

// Fail fast (20s) instead of hanging forever on a dead network —
// the sync engine turns aborts into a friendly "retrying" note.
function timedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), 20000);
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => window.clearTimeout(t));
}

export const supabase = createClient(URL, KEY, { global: { fetch: timedFetch } });
