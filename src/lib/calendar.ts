import type { EconEvent } from './types';
import { uid } from './types';

// ---------------------------------------------------------------------------
// Economic calendar data layer.
// Mock data ships by default. To connect a real API later, replace
// fetchEconomicEvents() with a fetch() call — the UI already consumes
// this single function, so nothing else needs to change.
// Example:
//   export async function fetchEconomicEvents(from, to) {
//     const res = await fetch(`https://your-api/economic-calendar?from=${from}&to=${to}`);
//     return (await res.json()) as EconEvent[];
//   }
// ---------------------------------------------------------------------------

const FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', AUD: '🇦🇺',
  CAD: '🇨🇦', CHF: '🇨🇭', NZD: '🇳🇿', CNY: '🇨🇳',
};

function ev(date: string, time: string, currency: string, title: string, impact: EconEvent['impact'], previous: string, forecast: string, actual = ''): EconEvent {
  return { id: uid(), date, time, currency, flag: FLAGS[currency] ?? '🏳️', title, impact, previous, forecast, actual, notify: false };
}

export function mockEconomicEvents(): EconEvent[] {
  const d = new Date();
  const iso = (offset: number) => {
    const t = new Date(d); t.setDate(d.getDate() + offset);
    return t.toISOString().slice(0, 10);
  };
  return [
    ev(iso(0), '08:30', 'USD', 'CPI m/m — Inflation data', 'High', '0.3%', '0.2%'),
    ev(iso(0), '10:00', 'USD', 'FOMC Member Speech', 'Medium', '', ''),
    ev(iso(0), '07:00', 'GBP', 'GDP m/m', 'High', '0.1%', '0.2%'),
    ev(iso(0), '12:00', 'EUR', 'ECB Press Conference', 'High', '', ''),
    ev(iso(1), '02:00', 'CNY', 'Trade Balance', 'Medium', '582B', '590B'),
    ev(iso(1), '08:30', 'USD', 'Initial Jobless Claims', 'Medium', '212K', '215K'),
    ev(iso(1), '13:00', 'USD', '30-y Bond Auction', 'Low', '', ''),
    ev(iso(1), '23:50', 'JPY', 'Monetary Policy Statement', 'High', '', ''),
    ev(iso(2), '08:30', 'USD', 'Non-Farm Payrolls (NFP)', 'High', '175K', '180K'),
    ev(iso(2), '08:30', 'USD', 'Unemployment Rate', 'High', '3.9%', '3.9%'),
    ev(iso(2), '09:00', 'CAD', 'Employment Change', 'Medium', '22K', '18K'),
    ev(iso(3), '06:00', 'EUR', 'German IFO Business Climate', 'Low', '89.4', '89.9'),
    ev(iso(-1), '08:30', 'USD', 'Retail Sales m/m', 'High', '0.6%', '0.4%', '0.7%'),
    ev(iso(-1), '03:30', 'AUD', 'RBA Rate Decision', 'High', '4.35%', '4.35%', '4.35%'),
  ];
}

// ---------------- LIVE FEEDS ----------------
// 1) Meta/Tradays institutional feed (same data as MetaTrader) — no key needed.
// 2) ForexFactory weekly XML fallback. 3) Last saved copy. 4) Built-in mock.
const FF_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.xml';
const CACHE_KEY = 'dadafx.econCache';
export type FeedSource = 'meta' | 'ff' | 'saved' | 'mock';
let source: FeedSource = 'mock';
export const calendarSource = () => source;
export const wasLiveCalendar = () => source === 'meta' || source === 'ff';

function setCache(out: EconEvent[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), events: out })); } catch { /* ignore */ }
}

const META_ALL_CCY = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072].reduce((a, b) => a | b, 0);

async function fetchMetaEvents(): Promise<EconEvent[]> {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
  const iso = (d: Date) => d.toISOString().slice(0, 19);
  const url = `https://www.tradays.com/en/economic-calendar/widget/content?date_mode=4&from=${iso(from)}&to=${iso(to)}&importance=15&currencies=${META_ALL_CCY}`;
  let data: any[];
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error('meta blocked');
    data = await r.json();
  } catch {
    // CORS fallback via public relay
    const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('meta relay failed');
    data = await r.json();
  }
  if (!Array.isArray(data) || !data.length) throw new Error('empty meta feed');
  const p2 = (n: number) => String(n).padStart(2, '0');
  const out: EconEvent[] = data.map(e => {
    const d = new Date(e.ReleaseDate);
    const imp = String(e.Importance || '').toLowerCase();
    const timed = e.TimeMode !== 1 && e.TimeMode !== 2;
    const name = e.CountryName ? `${e.EventName} (${e.CountryName})` : e.EventName;
    return {
      id: `meta-${e.Id}`,
      date: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`,
      time: timed ? `${p2(d.getHours())}:${p2(d.getMinutes())}` : '—',
      currency: e.CurrencyCode || 'USD',
      flag: FLAGS[e.CurrencyCode] ?? '🏳️',
      title: imp === 'none' ? `🏖️ ${name}` : name,
      impact: (imp === 'high' ? 'High' : imp === 'medium' ? 'Medium' : 'Low') as EconEvent['impact'],
      previous: e.PreviousValue ?? '',
      forecast: e.ForecastValue ?? '',
      actual: e.ActualValue ?? '',
      notify: false,
    };
  });
  setCache(out);
  return out;
}

const CCY: Record<string, string> = {
  USD: 'USD', USA: 'USD', EUR: 'EUR', EUROZONE: 'EUR', GERMANY: 'EUR', FRANCE: 'EUR', ITALY: 'EUR', SPAIN: 'EUR',
  GBP: 'GBP', UK: 'GBP', JPY: 'JPY', JAPAN: 'JPY', AUD: 'AUD', AUSTRALIA: 'AUD',
  CAD: 'CAD', CANADA: 'CAD', CHF: 'CHF', SWITZERLAND: 'CHF', NZD: 'NZD', NZ: 'NZD',
  CNY: 'CNY', CHINA: 'CNY',
};

// Offset of America/New_York (feed timezone) at an instant, in minutes.
function etOffsetMinutes(at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map(x => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour % 24), +p.minute, +p.second);
  return (asUTC - at.getTime()) / 60000;
}

// "02-14-2025" + "8:30am" (ET) → local { date: YYYY-MM-DD, time: HH:MM }
function etToLocal(dateStr: string, timeStr: string): { date: string; time: string } | null {
  const dm = dateStr.match(/(\d+)-(\d+)-(\d+)/);
  const tm = timeStr.toLowerCase().match(/(\d+):(\d+)(am|pm)/);
  if (!dm) return null;
  const mo = +dm[1], d = +dm[2], y = +dm[3];
  let h = 0, mi = 0;
  if (tm) { h = +tm[1] % 12; if (tm[3] === 'pm') h += 12; mi = +tm[2]; }
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) guess = Date.UTC(y, mo - 1, d, h, mi) - etOffsetMinutes(new Date(guess)) * 60000;
  const l = new Date(guess);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${l.getFullYear()}-${p2(l.getMonth() + 1)}-${p2(l.getDate())}`,
    time: tm ? `${p2(l.getHours())}:${p2(l.getMinutes())}` : '',
  };
}

async function fetchLiveEvents(): Promise<EconEvent[]> {
  async function parse(xmlText: string) {
    const xml = new DOMParser().parseFromString(xmlText, 'text/xml');
    const nodes = xml.querySelectorAll('event');
    const out: EconEvent[] = [];
    const txt = (el: Element, tag: string) => el.querySelector(tag)?.textContent?.trim() ?? '';
    nodes.forEach(el => {
      const title = txt(el, 'title');
      if (!title) return;
      const rawCcy = txt(el, 'country').toUpperCase();
      const currency = CCY[rawCcy] ?? rawCcy.slice(0, 3);
      const conv = etToLocal(txt(el, 'date'), txt(el, 'time'));
      if (!conv) return;
      const impRaw = txt(el, 'impact');
      const impact: EconEvent['impact'] = impRaw === 'High' ? 'High' : impRaw === 'Medium' ? 'Medium' : 'Low';
      out.push({
        id: uid(), date: conv.date, time: conv.time || '—', currency,
        flag: FLAGS[currency] ?? '🏳️',
        title: impRaw === 'Holiday' ? `🏖️ ${title}` : title,
        impact, previous: txt(el, 'previous'), forecast: txt(el, 'forecast'),
        actual: txt(el, 'actual'), notify: false,
      });
    });
    if (!out.length) throw new Error('empty feed');
    setCache(out);
    return out;
  }
  // Server proxy first (Vercel), then the mirror directly as fallback.
  try {
    const res = await fetch('/api/calendar', { signal: AbortSignal.timeout(12000) });
    if (res.ok) {
      const { xml } = await res.json();
      if (xml) return await parse(xml);
    }
  } catch { /* try mirror */ }
  const res = await fetch(FF_URL, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`feed ${res.status}`);
  return await parse(await res.text());
}

function cachedEvents(): EconEvent[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, events } = JSON.parse(raw);
    if (Date.now() - at > 6 * 3600e3 || !Array.isArray(events) || !events.length) return null;
    return events as EconEvent[];
  } catch { return null; }
}

export async function fetchEconomicEvents(): Promise<EconEvent[]> {
  try {
    try {
      source = 'ff';
      return await fetchLiveEvents();
    } catch { /* try next source */ }
    try {
      source = 'meta';
      return await fetchMetaEvents();
    } catch { /* try next source */ }
    const saved = cachedEvents();
    if (saved) { source = 'saved'; return saved; }
  } catch { /* absolute safety net below */ }
  source = 'mock';
  // small wait so the loading shimmer doesn't flash for 0ms
  await new Promise(r => setTimeout(r, 400));
  return [];
}

export function countdownTo(date: string, time: string): string {
  const target = new Date(`${date}T${time}:00`);
  const ms = target.getTime() - Date.now();
  if (isNaN(target.getTime())) return '—';
  if (ms < 0) return 'Released';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 48) return `in ${Math.floor(h / 24)}d`;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}
