import { useEffect, useMemo, useState } from 'react';
import { fetchMarketNews, flagFor, newsSource, timeAgo, type NewsItem, type NewsSource } from '../lib/news';
import { CURRENCIES } from '../lib/types';
import { Badge, Card, Empty, Glyph, PageHeader, btnGhost } from '../components/ui';

const sentimentTone: Record<string, 'green' | 'red' | 'gray'> = { Bullish: 'green', Bearish: 'red', Neutral: 'gray' };
const impactTone: Record<string, 'red' | 'amber' | 'blue'> = { High: 'red', Medium: 'amber', Low: 'blue' };

export default function MarketNews() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState<NewsSource>('mock');
  const [q, setQ] = useState('');
  const [ccy, setCcy] = useState('All');
  const [sent, setSent] = useState<'All' | 'Bullish' | 'Bearish' | 'Neutral'>('All');
  const [imp, setImp] = useState<'All' | 'High' | 'Medium' | 'Low'>('All');
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('dadafx.newsBookmarks') ?? '[]')); } catch { return new Set(); }
  });

  const refresh = () => {
    setLoading(true);
    fetchMarketNews().then(d => { setItems(d); setFeed(newsSource()); }).catch(() => setFeed(newsSource())).finally(() => setLoading(false));
  };
  // oxlint-disable-next-line react(set-state-in-effect)
  useEffect(() => { refresh(); }, []);
  useEffect(() => { try { localStorage.setItem('dadafx.newsBookmarks', JSON.stringify([...bookmarks])); } catch { /* ignore */ } }, [bookmarks]);

  const toggleBm = (id: string) => setBookmarks(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const filtered = useMemo(() => {
    let r = [...items];
    if (q) r = r.filter(i => (i.title + i.summary + i.source).toLowerCase().includes(q.toLowerCase()));
    if (ccy !== 'All') r = r.filter(i => i.currency === ccy);
    if (sent !== 'All') r = r.filter(i => i.sentiment === sent);
    if (imp !== 'All') r = r.filter(i => i.impact === imp);
    if (bookmarkedOnly) r = r.filter(i => bookmarks.has(i.id));
    r.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    return r;
  }, [items, q, ccy, sent, imp, bookmarkedOnly, bookmarks]);

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Headlines that move price" title="Market News"
        sub={feed === 'live' || feed === 'proxy'
          ? <>🔴 <b>Live</b> from ForexLive (via {feed === 'proxy' ? 'edge proxy' : 'direct'}) — auto-fresh every 5 min.</>
          : feed === 'saved' ? <>From cache (feeds unreachable) — tap Refresh to retry live.</>
          : <>Live feeds unreachable — showing curated mock. Refresh when online.</>}
        right={<>
          <span className={`hidden sm:inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-xs font-extrabold border ${(feed === 'live' || feed === 'proxy') ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}>
            <span className={`w-2 h-2 rounded-full ${(feed === 'live' || feed === 'proxy') ? 'bg-emerald-500 live-dot text-emerald-500' : 'bg-slate-400'}`} />{feed === 'proxy' ? 'LIVE · PROXY' : feed === 'live' ? 'LIVE · DIRECT' : feed.toUpperCase()}</span>
          <button className={btnGhost} onClick={refresh}><Glyph name="refresh" className="w-4 h-4" />Refresh</button>
        </>} />

      <Card>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Glyph name="search" className="w-4 h-4" /></span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search headlines, e.g. Fed, CPI, Gold…" className="h-[38px] pl-9 pr-3 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm w-64" />
          </div>
          <select value={ccy} onChange={e => setCcy(e.target.value)} className="h-[38px] px-3 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
            <option>All</option>{CURRENCIES.map(c => <option key={c}>{c}</option>)}<option>XAU</option><option>BTC</option>
          </select>
          <select value={sent} onChange={e => setSent(e.target.value as any)} className="h-[38px] px-3 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
            {['All','Bullish','Bearish','Neutral'].map(s => <option key={s}>{s}</option>)}
          </select>
          <select value={imp} onChange={e => setImp(e.target.value as any)} className="h-[38px] px-3 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
            {['All','High','Medium','Low'].map(s => <option key={s}>{s}</option>)}
          </select>
          <button onClick={() => setBookmarkedOnly(!bookmarkedOnly)} className={`h-[38px] px-3 rounded-md border text-sm font-bold ${bookmarkedOnly ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600'}`}>
            {bookmarkedOnly ? '★ Bookmarked' : '☆ Bookmarked'}
          </button>
          {(q || ccy !== 'All' || sent !== 'All' || imp !== 'All' || bookmarkedOnly) && (
            <button onClick={() => { setQ(''); setCcy('All'); setSent('All'); setImp('All'); setBookmarkedOnly(false); }} className="text-xs font-semibold text-indigo-600 hover:underline px-2">Clear</button>
          )}
        </div>
        <p className="text-[11px] text-slate-400 mt-2">{filtered.length} headlines · {items.length} total · <span className="num">{timeAgo(items[0]?.publishedAt ?? new Date().toISOString())} latest</span></p>
      </Card>

      {loading ? (
        <div className="grid gap-3">{[0,1,2].map(i => (
          <Card key={i}><div className="h-5 w-3/4 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" /><div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800 animate-pulse mt-3" /></Card>
        ))}</div>
      ) : filtered.length === 0 ? (
        <Card><Empty icon="📰" title="No headlines match" hint="Clear filters or hit Refresh for fresh news." /></Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map(n => (
            <Card key={n.id} lift className="!p-0 overflow-hidden">
              <div className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-extrabold">
                      <span className="text-base leading-none">{flagFor(n.currency)}</span>{n.currency}
                    </span>
                    <Badge tone={impactTone[n.impact]}><span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />{n.impact.toUpperCase()}</Badge>
                    <Badge tone={sentimentTone[n.sentiment]}>{n.sentiment === 'Bullish' ? '▲' : n.sentiment === 'Bearish' ? '▼' : '●'} {n.sentiment}</Badge>
                    <span className="text-[11px] font-semibold text-slate-400 num">{timeAgo(n.publishedAt)} · {n.source}</span>
                  </div>
                  <button onClick={() => toggleBm(n.id)} className={`w-8 h-8 rounded-lg border flex items-center justify-center ${bookmarks.has(n.id) ? 'bg-amber-400 border-amber-400 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-amber-500'}`} title="Bookmark">
                    {bookmarks.has(n.id) ? '★' : '☆'}
                  </button>
                </div>
                <a href={n.url} target="_blank" rel="noreferrer" className="block mt-2 group">
                  <h3 className="font-display font-extrabold text-[15px] leading-snug text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition">{n.title}</h3>
                  <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed line-clamp-2">{n.summary}</p>
                </a>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <a href={n.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Read full →</a>
                  <span className="text-[11px] text-slate-400 num hidden sm:inline">{new Date(n.publishedAt).toLocaleString()}</span>
                  <span className="ml-auto flex gap-1">
                    <button onClick={() => { navigator.clipboard?.writeText(`${n.title} — ${n.url}`); }} className="text-[11px] font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1">Copy link</button>
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="!py-3 text-center text-xs text-slate-400">
        Aggregated from ForexLive & Investing.com RSS via edge proxy · auto-caches 30 min · respects each outlet’s terms. Not financial advice.
      </Card>
    </div>
  );
}
