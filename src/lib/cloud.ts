import { supabase } from './supabase';

// Offline-first cloud sync: localStorage stays the boss, Supabase mirrors it.
// One row per journal section (key), last-write-wins per section.

const MT_KEY = 'dadafx.localmt'; // { key: ms of last LOCAL edit (or applied remote) }
const SKIP = new Set(['dadafx.dark', 'dadafx.syncmeta', 'dadafx.syncstat']); // device-only / diagnostics
export const shouldSync = (key: string) =>
  key.startsWith('dadafx.') && !SKIP.has(key) && key !== MT_KEY;

export const syncKeys = (): string[] => {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (shouldSync(k)) out.push(k);
  }
  return out;
};

const localMt = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(MT_KEY) ?? '{}'); }
  catch { return {}; }
};
const setLocalMt = (m: Record<string, number>) => {
  try { localStorage.setItem(MT_KEY, JSON.stringify(m)); } catch { /* ignore */ }
};

/** Stamp a key as locally edited (called by the store on real changes). */
export function bumpLocalMt(key: string) {
  if (!shouldSync(key)) return;
  const m = localMt();
  m[key] = Date.now();
  setLocalMt(m);
}

/** True while remote data is being written locally — push must pause. */
export let applyingRemote = false;

/** Last sync result, shown in the sidebar (proves push/pull health). */
export function noteSync(ok: boolean, msg = '') {
  try {
    // Keep the FIRST failure time so "Sync failing since HH:MM" is honest
    // instead of resetting on every retry.
    if (!ok) {
      const prev = localStorage.getItem('dadafx.syncstat');
      if (prev) {
        try {
          const p = JSON.parse(prev) as { at?: unknown; ok?: unknown };
          if (p && p.ok === false && typeof p.at === 'number') {
            localStorage.setItem('dadafx.syncstat', JSON.stringify({ at: p.at, ok, msg: String(msg).slice(0, 160) }));
            window.dispatchEvent(new CustomEvent('dadafx:syncstat'));
            return;
          }
        } catch { /* fall through and overwrite */ }
      }
    }
    localStorage.setItem('dadafx.syncstat', JSON.stringify({ at: Date.now(), ok, msg: String(msg).slice(0, 160) }));
    window.dispatchEvent(new CustomEvent('dadafx:syncstat'));
  } catch { /* ignore */ }
}

/** Turn raw network/Supabase errors into an actionable one-liner. */
export function friendlySyncError(e: unknown): string {
  const raw = e instanceof Error ? `${e.name}: ${e.message}` : String(e ?? '');
  const m = raw.toLowerCase();
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'you appear offline — reconnect and it will retry';
  if (m.includes('aborterror') || m.includes('aborted') || m.includes('timed out') || m.includes('timeout')) {
    return 'Supabase timed out — slow network or paused project, retrying';
  }
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed') || m.includes('network request failed') || m.includes('fetch failed')) {
    return "can't reach Supabase — check internet/adblock/VPN, or unpause the project at supabase.com";
  }
  if (m.includes('journal_store') || (m.includes('relation') && m.includes('does not exist'))) {
    return 'journal_store table missing — run SUPABASE.sql once in Supabase SQL Editor';
  }
  if (m.includes('jwt') || m.includes('expired') || m.includes('401') || m.includes('unauthorized')) {
    return 'session expired — sign out and back in';
  }
  return (e instanceof Error ? e.message : raw).slice(0, 160) || 'fetch failed';
}

function throwOffline(): never {
  const err = new Error('offline');
  noteSync(false, 'you appear offline — reconnect and it will retry');
  throw err;
}

async function uid(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function pushKey(key: string) {
  if (!shouldSync(key)) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) throwOffline();
  const raw = localStorage.getItem(key);
  if (raw == null) return;
  const id = await uid();
  if (!id) return;
  let data: any = null;
  try { data = JSON.parse(raw); } catch { return; }
  const { error } = await supabase
    .from('journal_store')
    .upsert({ user_id: id, key, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
  if (error) {
    noteSync(false, friendlySyncError(error));
    throw error;
  }
  bumpLocalMt(key); // pushed = cloud now matches local
  noteSync(true);
}

/** Push every section (used before sign-out so nothing is left behind). */
export async function pushAll() {
  for (const k of syncKeys()) {
    try { await pushKey(k); } catch { /* keep going */ }
  }
}

/**
 * Decide a remote row against the local copy.
 * Local edits ALWAYS win ties — an unpushed change is never clobbered.
 * Returns 'applied' | 'pushed' | 'same'.
 */
async function considerRemote(key: string, data: any, remoteMs: number): Promise<'applied' | 'pushed' | 'same'> {
  const lm = localMt();
  const localRaw = localStorage.getItem(key);
  const remoteJson = JSON.stringify(data);
  if (localRaw == null) {
    localStorage.setItem(key, remoteJson);
    lm[key] = remoteMs;
    setLocalMt(lm);
    return 'applied';
  }
  if (remoteMs > (lm[key] ?? -1) && localRaw !== remoteJson) {
    applyingRemote = true;
    try {
      localStorage.setItem(key, remoteJson);
      lm[key] = remoteMs;
      setLocalMt(lm);
    } finally {
      applyingRemote = false;
    }
    return 'applied';
  }
  if (localRaw !== remoteJson) {
    await pushKey(key); // local is newer (or tied) — upload it
    return 'pushed';
  }
  return 'same';
}

/** First contact: download newer sections, upload local-newer ones. Never deletes local work. */
export async function pullMerge(): Promise<{ pulled: number; pushed: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throwOffline();
  const id = await uid();
  if (!id) return { pulled: 0, pushed: 0 };
  const { data, error } = await supabase.from('journal_store').select('key,data,updated_at');
  if (error) throw error;
  let pulled = 0, pushed = 0;
  const seen = new Set<string>();
  for (const row of data ?? []) {
    if (!shouldSync(row.key)) continue;
    seen.add(row.key);
    try {
      const r = await considerRemote(row.key, (row as any).data, new Date(row.updated_at).getTime());
      if (r === 'applied') pulled++;
      if (r === 'pushed') pushed++;
    } catch { /* keep going */ }
  }
  for (const k of syncKeys()) {
    if (seen.has(k) || localStorage.getItem(k) == null) continue;
    try { await pushKey(k); pushed++; } catch { /* keep going */ }
  }
  return { pulled, pushed };
}

/** Live PC <-> laptop updates for this user. */
export function subscribeRemote(onChange: (key: string) => void) {
  let channel: { unsubscribe: () => void } | null = null;
  let alive = true;
  uid().then(id => {
    if (!id || !alive) return;
    const ch = supabase
      .channel('journal-store')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'journal_store', filter: `user_id=eq.${id}` },
        (payload: any) => {
          const row = payload.new as any;
          if (!row?.key || !shouldSync(row.key)) return;
          considerRemote(row.key, row.data, new Date(row.updated_at).getTime())
            .then(r => { if (r === 'applied') onChange(row.key); })
            .catch(() => { /* ignore */ });
        });
    ch.subscribe();
    channel = { unsubscribe: () => { supabase.removeChannel(ch); } };
  });
  return () => { alive = false; channel?.unsubscribe(); };
}
