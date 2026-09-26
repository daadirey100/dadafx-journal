import { uid } from './types';

// ---------------------------------------------------------------------------
// Market news data layer — mirrors calendar.ts pattern:
// /api/news (Vercel proxy) -> direct RSS via allOrigins -> cache -> mock
// UI only calls fetchMarketNews() — swap feed without touching pages.
// ---------------------------------------------------------------------------

export type Sentiment = 'Bullish' | 'Bearish' | 'Neutral';
export type NewsItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string; // ISO
  currency: string; // USD, EUR, GBP...
  sentiment: Sentiment;
  impact: 'High' | 'Medium' | 'Low';
  summary: string;
  image?: string;
  bookmarked?: boolean;
};

const CACHE_KEY = 'dadafx.newsCache';
export type NewsSource = 'live' | 'proxy' | 'saved' | 'mock';
let source: NewsSource = 'mock';
export const newsSource = () => source;
export const wasLiveNews = () => source === 'live' || source === 'proxy';

function setCache(out: NewsItem[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), items: out })); } catch { /* ignore */ }
}

function cached(): NewsItem[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, items } = JSON.parse(raw);
    if (Date.now() - at > 30 * 60e3 || !Array.isArray(items) || !items.length) return null;
    return items as NewsItem[];
  } catch { return null; }
}

const FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', AUD: '🇦🇺',
  CAD: '🇨🇦', CHF: '🇨🇭', NZD: '🇳🇿', CNY: '🇨🇳', XAU: '🥇', BTC: '₿',
};

export function flagFor(ccy: string) { return FLAGS[ccy] ?? '🌐'; }

// heuristic: title -> currency + sentiment
function inferMeta(title: string): { currency: string; sentiment: Sentiment; impact: NewsItem['impact'] } {
  const t = title.toLowerCase();
  let ccy = 'USD';
  if (t.includes('eur') || t.includes('euro')) ccy = 'EUR';
  else if (t.includes('gbp') || t.includes('pound') || t.includes('boe')) ccy = 'GBP';
  else if (t.includes('jpy') || t.includes('yen') || t.includes('boj')) ccy = 'JPY';
  else if (t.includes('aud')) ccy = 'AUD';
  else if (t.includes('cad')) ccy = 'CAD';
  else if (t.includes('chf')) ccy = 'CHF';
  else if (t.includes('gold') || t.includes('xau')) ccy = 'XAU';
  else if (t.includes('btc') || t.includes('bitcoin')) ccy = 'BTC';
  let sentiment: Sentiment = 'Neutral';
  if (/beat|hawkish|surge|rally|higher than|stronger|bull/.test(t)) sentiment = 'Bullish';
  else if (/miss|dovish|slump|fall|weaker|bear|cut/.test(t)) sentiment = 'Bearish';
  let impact: NewsItem['impact'] = 'Medium';
  if (/fed|fomc|nfp|payrolls|cpi|rate decision|ecb|boe/.test(t)) impact = 'High';
  else if (/pmi|retail|gdp|claims/.test(t)) impact = 'Medium';
  else impact = 'Low';
  return { currency: ccy, sentiment, impact };
}

export function mockMarketNews(): NewsItem[] {
  const now = Date.now();
  const hrs = (h: number) => new Date(now - h * 3600e3).toISOString();
  return [
    { id: uid(), title: 'Fed Minutes: Officials divided on timing of next cut — USD whipsaws', url: 'https://www.forexlive.com', source: 'ForexLive', publishedAt: hrs(0.5), currency: 'USD', sentiment: 'Neutral', impact: 'High', summary: 'Minutes show 2 dissents pushing for earlier cuts; dot plot still favors 1 cut in 2025. EUR/USD +45 pips on release.' },
    { id: uid(), title: 'EUR/USD breaks 1.0850 as German IFO beats — buyers eye 1.0880', url: 'https://www.forexlive.com', source: 'Investing.com', publishedAt: hrs(1.2), currency: 'EUR', sentiment: 'Bullish', impact: 'Medium', summary: 'IFO 90.1 vs 89.9 expected. London session sees steady dip-buying, stops above 1.0830.' },
    { id: uid(), title: 'GBP soft after UK retail miss — cable slides to 1.268', url: 'https://www.forexlive.com', source: 'ForexLive', publishedAt: hrs(2), currency: 'GBP', sentiment: 'Bearish', impact: 'Medium', summary: 'Retail -0.4% m/m vs +0.1% forecast. BOE pricing unchanged.' },
    { id: uid(), title: 'Gold eyes $2,410 as real yields slip — XAU/USD momentum intact', url: 'https://www.forexlive.com', source: 'Kitco', publishedAt: hrs(4), currency: 'XAU', sentiment: 'Bullish', impact: 'Low', summary: '10y TIPS down 4bp. Support at 2,395 holds, next liquidity at 2,425.' },
    { id: uid(), title: 'USD/JPY intervention chatter returns near 151.50 — watch MOF warnings', url: 'https://www.forexlive.com', source: 'Reuters FX', publishedAt: hrs(6), currency: 'JPY', sentiment: 'Bearish', impact: 'High', summary: 'MOF official: "watching moves with urgency". Spot pinned under 151.50.' },
    { id: uid(), title: 'BTC holds $67k — ETF inflows back positive for 3rd day', url: 'https://www.forexlive.com', source: 'CoinDesk', publishedAt: hrs(8), currency: 'BTC', sentiment: 'Bullish', impact: 'Low', summary: '$220M net inflow yesterday. Resistance at 68.5k.' },
  ];
}

// parse RSS xml text -> NewsItem[]
function parseRss(xmlText: string, fallbackSource: string): NewsItem[] {
  const xml = new DOMParser().parseFromString(xmlText, 'text/xml');
  const items = xml.querySelectorAll('item, entry');
  const out: NewsItem[] = [];
  const txt = (el: Element, tag: string) => el.querySelector(tag)?.textContent?.trim() ?? '';
  const attr = (el: Element, tag: string, a: string) => el.querySelector(tag)?.getAttribute(a)?.trim() ?? '';
  items.forEach(el => {
    const title = txt(el, 'title');
    if (!title) return;
    const link = txt(el, 'link') || attr(el, 'link', 'href') || 'https://www.forexlive.com';
    const pub = txt(el, 'pubDate') || txt(el, 'published') || txt(el, 'updated') || new Date().toISOString();
    const desc = (txt(el, 'description') || txt(el, 'summary') || txt(el, 'content')).replace(/<[^>]+>/g, '').slice(0, 180);
    const meta = inferMeta(title);
    const d = new Date(pub);
    out.push({
      id: `rss-${uid()}`,
      title,
      url: link,
      source: fallbackSource,
      publishedAt: isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(),
      currency: meta.currency,
      sentiment: meta.sentiment,
      impact: meta.impact,
      summary: desc || title.slice(0, 120),
    });
  });
  if (!out.length) throw new Error('empty rss');
  return out.slice(0, 40);
}

async function fetchViaProxy(): Promise<NewsItem[]> {
  const r = await fetch('/api/news', { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('proxy failed');
  const j = await r.json();
  if (!j.ok || !j.xml) throw new Error('proxy empty');
  const items = parseRss(j.xml, j.source ?? 'ForexLive');
  setCache(items);
  return items;
}

async function fetchDirect(): Promise<NewsItem[]> {
  const feed = 'https://www.forexlive.com/feed/';
  const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(feed)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error('direct failed');
  const xml = await r.text();
  const items = parseRss(xml, 'ForexLive');
  setCache(items);
  return items;
}

export async function fetchMarketNews(): Promise<NewsItem[]> {
  try {
    try { source = 'proxy'; return await fetchViaProxy(); } catch { /* next */ }
    try { source = 'live'; return await fetchDirect(); } catch { /* next */ }
    const saved = cached();
    if (saved) { source = 'saved'; return saved; }
  } catch { /* fallback */ }
  source = 'mock';
  await new Promise(r => setTimeout(r, 300));
  const m = mockMarketNews();
  setCache(m);
  return m;
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return '—';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
