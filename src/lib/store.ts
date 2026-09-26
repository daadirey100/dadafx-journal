import { useEffect, useState } from 'react';
import { bumpLocalMt } from './cloud';

// Simple localStorage-backed store. Beginner friendly, persists after refresh.
// Every real change stamps a local timestamp so cloud merge never
// overwrites unpushed edits (mount-renders don't count as changes).

const lastWritten = new Map<string, string>();
const seenKeys = new Set<string>();

export function useLocal<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) return JSON.parse(raw) as T;
    } catch { /* ignore */ }
    return initial;
  });
  useEffect(() => {
    const json = JSON.stringify(value);
    if (seenKeys.has(key) && lastWritten.get(key) === json) return; // nothing changed
    try {
      localStorage.setItem(key, json);
    } catch (err: any) {
      // Quota exceeded (usually huge screenshots) — warn instead of failing silently
      if (err?.name === 'QuotaExceededError' || err?.code === 22) {
        pushToast({ msg: '⚠️ Browser storage full — remove some screenshots, then use Backup.', kind: 'err' });
      }
      return;
    }
    lastWritten.set(key, json);
    if (!seenKeys.has(key)) {
      seenKeys.add(key); // first mount: adopt existing data, don't claim it as new
    } else {
      bumpLocalMt(key); // real user edit — newer than any cloud copy until pushed
    }
  }, [key, value]);
  const setDirty: typeof setValue = ((v: any) => {
    setValue(prev => (typeof v === 'function' ? (v as any)(prev) : v));
    window.dispatchEvent(new CustomEvent('dadafx:dirty', { detail: key }));
  }) as typeof setValue;
  return [value, setDirty] as const;
}

// Toast system (tiny, no dependency)
export interface Toast { id: string; msg: string; kind: 'ok' | 'err' | 'info' }
let pushToast: (t: Omit<Toast, 'id'>) => void = () => {};

export function setToastPusher(fn: (t: Omit<Toast, 'id'>) => void) { pushToast = fn; }
export const toast = {
  ok: (msg: string) => pushToast({ msg, kind: 'ok' }),
  err: (msg: string) => pushToast({ msg, kind: 'err' }),
  info: (msg: string) => pushToast({ msg, kind: 'info' }),
};

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// Screenshots shrink to a small JPEG so they can't overflow browser storage.
// (A 3MB chart PNG becomes ~150KB — same look in the journal.)
export function compressImage(file: File, maxDim = 1000, quality = 0.72): Promise<string> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    img.src = url;
  });
}
