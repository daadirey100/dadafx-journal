// App display timezone: UTC+3 (East Africa Time — Nairobi).
// Change APP_TZ_OFFSET to 0 for pure UTC, or another hour offset as needed.

export const APP_TZ_OFFSET = 3;
export const APP_TZ_LABEL = 'UTC+3';

/** Wall-clock Date shifted so getHours()/getMinutes() read as UTC+3. */
export function appNow(d = new Date()): Date {
  return new Date(d.getTime() + (APP_TZ_OFFSET * 60 + d.getTimezoneOffset()) * 60000);
}

export function fmtAppClock(d = new Date()): string {
  const a = appNow(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(a.getHours())}:${p(a.getMinutes())}:${p(a.getSeconds())}`;
}

/** Convert a UTC hour to an "HH:MM" label in the app timezone. */
export function appTzLabel(h: number): string {
  const l = ((h + APP_TZ_OFFSET) % 24 + 24) % 24;
  const hh = Math.floor(l);
  const mm = Math.round((l - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
