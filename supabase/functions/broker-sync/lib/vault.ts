// AES-GCM envelope for per-user broker credentials.
// Key lives ONLY as the BROKER_MASTER_KEY function secret (server-side).
// The browser never sees plaintext credentials twice — collect once, encrypt, forget.

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function masterKey(): Promise<CryptoKey> {
  const hex = (Deno.env.get('BROKER_MASTER_KEY') ?? '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('BROKER_MASTER_KEY secret is not configured (generate: openssl rand -hex 32).');
  }
  const raw = new Uint8Array(hex.match(/../g)!.map(h => parseInt(h, 16)));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptJSON(obj: unknown): Promise<{ iv: string; ct: string }> {
  const key = await masterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

export async function decryptJSON<T>(env: { iv: string; ct: string }): Promise<T> {
  const key = await masterKey();
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.ct));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

export async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 32): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}
