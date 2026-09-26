// Trading sessions (forex market hours) in UTC.
// 24h wrap handled — e.g. Sydney 21:00 → 06:00 next day.

export interface SessionDef {
  id: string;
  name: string;
  tz: string; // home timezone label
  start: number; // UTC hour
  end: number; // UTC hour
  color: string; // accent hex
  mood: string;
  pairs: string;
  center: string; // bank holiday center: Australia/Japan/UK/US
}

export const SESSION_DEFS: SessionDef[] = [
  { id: 'sydney', name: 'Sydney Session', tz: 'AEST · UTC+10', start: 21, end: 6, color: '#3b82f6', mood: 'Quiet · spread-widening risk', pairs: 'AUD/USD · NZD/USD', center: 'Australia' },
  { id: 'tokyo', name: 'Tokyo (Asian) Session', tz: 'JST · UTC+9', start: 0, end: 9, color: '#8b5cf6', mood: 'Slow range · JPY moves', pairs: 'USD/JPY · AUD/JPY · EUR/JPY', center: 'Japan' },
  { id: 'london', name: 'London (European) Session', tz: 'GMT · UTC+0', start: 7, end: 16, color: '#4f46e5', mood: 'Breakout window · high volume', pairs: 'EUR/USD · GBP/USD · EUR/GBP', center: 'UK' },
  { id: 'newyork', name: 'New York (North American) Session', tz: 'EST · UTC−5', start: 12, end: 21, color: '#059669', mood: 'Trend + reversals · USD news', pairs: 'XAU/USD · US30 · NAS100 · USD/*', center: 'US' },
];

const DAY = 24 * 60;

// IANA zone per center — ensures Tokyo 2026-09-23 is detected as JST 09-23, not UTC 09-22
const CENTER_TZ: Record<string, string> = {
  Japan: 'Asia/Tokyo',
  US: 'America/New_York',
  UK: 'Europe/London',
  Australia: 'Australia/Sydney',
};
function isoInTZ(d: Date, tz: string): string {
  // en-CA gives YYYY-MM-DD directly
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export interface SessionStatus {
  open: boolean;
  progress: number; // 0..1 elapsed (if open)
  msToChange: number; // until close (if open) or open (if closed)
  holiday?: boolean;
  holidayName?: string;
}

export function sessionStatus(def: SessionDef, now = new Date()): SessionStatus {
  // Real bank holiday for this session's center closes the session independently — compare in center's local date
  const tz = CENTER_TZ[def.center] ?? 'UTC';
  const iso = isoInTZ(now, tz);
  const holiday = BANK_HOLIDAYS.find(h => h.date === iso && h.center === def.center);
  if (holiday) {
    // Closed all day for this center — next open is tomorrow 00:00 UTC start
    const next = new Date(now);
    next.setUTCDate(now.getUTCDate() + 1);
    next.setUTCHours(def.start, 0, 0, 0);
    const ms = next.getTime() - now.getTime();
    return { open: false, progress: 0, msToChange: ms > 0 ? ms : 24*60*60000, holiday: true, holidayName: holiday.name };
  }
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
  const s = def.start * 60;
  const e = def.end * 60;
  const inRange = s < e ? mins >= s && mins < e : mins >= s || mins < e;
  if (inRange) {
    const elapsed = (mins - s + DAY) % DAY;
    const total = (e - s + DAY) % DAY;
    return { open: true, progress: Math.min(1, elapsed / total), msToChange: (total - elapsed) * 60000 };
  }
  const untilOpen = (s - mins + DAY) % DAY;
  return { open: false, progress: 0, msToChange: untilOpen * 60000 };
}

export function fmtCountdown(ms: number): string {
  if (ms < 0) return '—';
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h >= 24) return `in ${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function utcToLocalLabel(h: number): string {
  const off = -new Date().getTimezoneOffset() / 60;
  const l = ((h + off) % 24 + 24) % 24;
  const hh = Math.floor(l);
  const mm = Math.round((l - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}


// ---- Market holidays & weekend close ----
export const FOREX_HOLIDAYS: { date: string; name: string }[] = [
  // Global forex thin/closed days
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-06', name: 'Easter Monday' },
  { date: '2026-05-01', name: 'Labor Day' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-26', name: 'Boxing Day' },
  { date: '2025-12-25', name: 'Christmas Day' },
  { date: '2025-12-26', name: 'Boxing Day' },
];

// Real bank holidays per major forex center — source: officeholidays.com / exchange calendars
export const BANK_HOLIDAYS: { date: string; name: string; center: string }[] = [
  // Japan 2026 — verified officeholidays.com/countries/japan/2026
  { date: '2026-01-01', name: "New Year's Day", center: 'Japan' },
  { date: '2026-01-12', name: 'Coming-of-Age Day', center: 'Japan' },
  { date: '2026-02-11', name: 'National Foundation Day', center: 'Japan' },
  { date: '2026-02-23', name: "Emperor's Birthday", center: 'Japan' },
  { date: '2026-03-20', name: 'Vernal Equinox Day', center: 'Japan' },
  { date: '2026-04-29', name: 'Showa Day', center: 'Japan' },
  { date: '2026-05-04', name: 'Greenery Day', center: 'Japan' },
  { date: '2026-05-05', name: "Children's Day", center: 'Japan' },
  { date: '2026-05-06', name: 'Constitution Memorial Day (in lieu)', center: 'Japan' },
  { date: '2026-07-20', name: 'Marine Day', center: 'Japan' },
  { date: '2026-08-11', name: 'Mountain Day', center: 'Japan' },
  { date: '2026-09-21', name: 'Respect for the Aged Day', center: 'Japan' },
  { date: '2026-09-22', name: 'Autumnal Equinox (Silver Week bridge)', center: 'Japan' },
  { date: '2026-09-23', name: 'Autumnal Equinox Day', center: 'Japan' },
  { date: '2026-10-12', name: 'Health-Sports Day', center: 'Japan' },
  { date: '2026-11-03', name: 'Culture Day', center: 'Japan' },
  { date: '2026-11-23', name: 'Labour Thanksgiving Day', center: 'Japan' },
  // US 2026 major
  { date: '2026-01-01', name: "New Year's Day", center: 'US' },
  { date: '2026-01-19', name: 'Martin Luther King Jr. Day', center: 'US' },
  { date: '2026-02-16', name: "Presidents' Day", center: 'US' },
  { date: '2026-07-03', name: 'Independence Day (observed)', center: 'US' },
  { date: '2026-09-07', name: 'Labor Day', center: 'US' },
  { date: '2026-11-26', name: 'Thanksgiving Day', center: 'US' },
  { date: '2026-12-25', name: 'Christmas Day', center: 'US' },
  // UK 2026 — gov.uk/bank-holidays
  { date: '2026-01-01', name: "New Year's Day", center: 'UK' },
  { date: '2026-04-03', name: 'Good Friday', center: 'UK' },
  { date: '2026-04-06', name: 'Easter Monday', center: 'UK' },
  { date: '2026-05-04', name: 'Early May Bank Holiday', center: 'UK' },
  { date: '2026-05-25', name: 'Spring Bank Holiday', center: 'UK' },
  { date: '2026-08-31', name: 'Summer Bank Holiday', center: 'UK' },
  { date: '2026-12-25', name: 'Christmas Day', center: 'UK' },
  { date: '2026-12-28', name: 'Boxing Day (substitute)', center: 'UK' },
  // Australia 2026 — australia.gov.au
  { date: '2026-01-01', name: "New Year's Day", center: 'Australia' },
  { date: '2026-01-26', name: 'Australia Day', center: 'Australia' },
  { date: '2026-04-03', name: 'Good Friday', center: 'Australia' },
  { date: '2026-04-06', name: 'Easter Monday', center: 'Australia' },
  { date: '2026-04-25', name: 'Anzac Day', center: 'Australia' },
  { date: '2026-12-25', name: 'Christmas Day', center: 'Australia' },
  { date: '2026-12-28', name: 'Boxing Day (observed)', center: 'Australia' },
];

export function bankHolidaysToday(now = new Date()): { date: string; name: string; center: string }[] {
  return BANK_HOLIDAYS.filter(h => {
    const tz = CENTER_TZ[h.center] ?? 'UTC';
    return isoInTZ(now, tz) === h.date;
  });
}

export function isWeekendClosed(now = new Date()): { closed: boolean; reason: string; nextOpen: Date | null } {
  const day = now.getUTCDay(); // 0 Sun, 6 Sat
  const hour = now.getUTCHours();
  // Forex closed: Sat all day, Sun until 21:00 UTC (Sydney open)
  if (day === 6) {
    const next = new Date(now);
    next.setUTCDate(now.getUTCDate() + (7 - day) % 7); // next Sunday
    next.setUTCHours(21, 0, 0, 0);
    if (day === 6) { // Sat -> Sun 21:00
      next.setUTCDate(now.getUTCDate() + 1);
    }
    return { closed: true, reason: 'Weekend — market closed', nextOpen: next };
  }
  if (day === 0 && hour < 21) {
    const next = new Date(now);
    next.setUTCHours(21, 0, 0, 0);
    return { closed: true, reason: 'Weekend — opens at Sydney 21:00 UTC', nextOpen: next };
  }
  return { closed: false, reason: '', nextOpen: null };
}

export function isHoliday(now = new Date()): { holiday: boolean; name: string } {
  const iso = now.toISOString().slice(0,10);
  const hit = FOREX_HOLIDAYS.find(h => h.date === iso);
  return hit ? { holiday: true, name: hit.name } : { holiday: false, name: '' };
}

export function marketStatus(now = new Date()): { closed: boolean; reason: string; nextOpen: Date | null; isHoliday: boolean; holidayName: string; bankHolidays: { date: string; name: string; center: string }[] } {
  const wk = isWeekendClosed(now);
  const banks = bankHolidaysToday(now);
  if (wk.closed) return { closed: true, reason: wk.reason, nextOpen: wk.nextOpen, isHoliday: false, holidayName: '', bankHolidays: banks };
  const hol = isHoliday(now);
  if (hol.holiday) {
    const next = new Date(now);
    next.setUTCDate(now.getUTCDate() + 1);
    next.setUTCHours(0,0,0,0);
    return { closed: true, reason: `Holiday — ${hol.name}`, nextOpen: next, isHoliday: true, holidayName: hol.name, bankHolidays: banks };
  }
  return { closed: false, reason: '', nextOpen: null, isHoliday: false, holidayName: '', bankHolidays: banks };
}

export const overlapOpen = (now = new Date()) => {
  const h = now.getUTCHours() + now.getUTCMinutes() / 60;
  return h >= 12 && h < 16; // London × New York golden window
};
