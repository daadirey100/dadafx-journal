import { useEffect, useMemo, useState } from 'react';
import { calendarSource, countdownTo, fetchEconomicEvents, type FeedSource } from '../lib/calendar';
import { CURRENCIES } from '../lib/types';
import type { EconEvent, Trade } from '../lib/types';
import { toast } from '../lib/store';
import { Badge, btnGhost, Card, Empty, Glyph, PageHeader } from '../components/ui';
import EconomicCalendarWidget from '../components/EconomicCalendarWidget';

const tone: Record<string, 'red' | 'amber' | 'blue'> = { High: 'red', Medium: 'amber', Low: 'blue' };

export default function EconomicCalendar({ events, setEvents, trades }: { events: EconEvent[]; setEvents: (e: EconEvent[]) => void; trades: Trade[] }) {
  const tradedDays = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of trades) {
      const d = t.date.slice(0, 10);
      m.set(d, (m.get(d) ?? 0) + 1);
    }
    return m;
  }, [trades]);
  const [loading, setLoading] = useState(events.length === 0);
  const [cur, setCur] = useState('All');
  const [imp, setImp] = useState('All');
  const [q, setQ] = useState('');
  const [when, setWhen] = useState<'All' | 'Today' | 'Tomorrow' | 'Week'>('All');
  const [feed, setFeed] = useState<FeedSource>('mock');
  const [real, setReal] = useState(false);

  const refresh = () => {
    setLoading(true);
    fetchEconomicEvents()
      .then(d => { setEvents(d); setFeed(calendarSource()); })
      .catch(() => { setFeed(calendarSource()); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // Always refresh on mount — persisted mock/saved from old versions must be replaced by live FF/Meta feed
    refresh();
    const iv = setInterval(refresh, 30 * 60e3); // auto-refresh every 30 min while page open
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const tom = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    const weekEnd = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    let r = [...events];
    if (cur !== 'All') r = r.filter(e => e.currency === cur);
    if (imp !== 'All') r = r.filter(e => e.impact === imp);
    if (q) r = r.filter(e => e.title.toLowerCase().includes(q.toLowerCase()));
    if (when === 'Today') r = r.filter(e => e.date === today);
    if (when === 'Tomorrow') r = r.filter(e => e.date === tom);
    if (when === 'Week') r = r.filter(e => e.date >= today && e.date <= weekEnd);
    r.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const m = new Map<string, EconEvent[]>();
    for (const e of r) {
      const k = e.date;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return [...m.entries()];
  }, [events, cur, imp, q, when]);

  const toggleNotify = (id: string) => setEvents(events.map(e => (e.id === id ? { ...e, notify: !e.notify } : e)));

  const dayLabel = (iso: string) => {
    const d = new Date(iso + 'T12:00:00');
    const today = new Date().toISOString().slice(0, 10);
    const tom = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    const tag = iso === today ? ' · Today' : iso === tom ? ' · Tomorrow' : '';
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) + tag;
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Market intelligence" title="Economic Calendar"
        sub={feed === 'meta'
          ? <>🔴 <b>Live MetaTrader feed</b> (Tradays/MetaQuotes) — real bank-grade data in your design · tap 🔔 for phone alerts.</>
          : feed === 'ff'
            ? <>🔴 <b>Live feed</b> (ForexFactory) — tap 🔔 on any event for phone alerts.</>
            : <>No live data right now (offline / feeds unreachable) — hit refresh to retry. Real data only, never fake.</>}
        right={<>
          <span className={`inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-xs font-extrabold border ${(feed === 'meta' || feed === 'ff') ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}>
            <span className={`w-2 h-2 rounded-full ${(feed === 'meta' || feed === 'ff') ? 'bg-emerald-500 live-dot text-emerald-500' : 'bg-slate-400'}`} />{feed === 'meta' ? 'LIVE · META' : feed === 'ff' ? 'LIVE · FF' : feed === 'saved' ? 'SAVED' : 'OFFLINE'}</span>
          <button className={btnGhost} onClick={refresh}><Glyph name="refresh" className="w-4 h-4" />Refresh</button>
          <button className={btnGhost} onClick={async () => {
            if (!('Notification' in window)) { toast.err('This browser cannot show alerts.'); return; }
            const p = await Notification.requestPermission();
            if (p === 'granted') toast.ok('Alerts on — you’ll be pinged 15 min before 🔔 events.');
            else toast.err('Alerts blocked — allow them in browser settings.');
          }}><Glyph name="bell" className="w-4 h-4" />Enable alerts</button>
        </>} />

      <Card>
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
          <button onClick={() => setReal(true)} className={`h-8 px-3 rounded-md text-xs font-extrabold transition ${real ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-slate-500'}`}>MetaTrader widget</button>
          <button onClick={() => setReal(false)} className={`h-8 px-3 rounded-md text-xs font-extrabold transition ${!real ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-slate-500'}`}>ForexFactory table</button>
        </div>
      </Card>

      {real ? (
        <Card pad={false} className="overflow-hidden">
          <div className="p-2">
            <EconomicCalendarWidget />
          </div>
        </Card>
      ) : (
      <>
      <Card>
        <div className="flex flex-wrap gap-2">
          <input className="h-[38px] px-3 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm w-52" placeholder="Search events…" value={q} onChange={e => setQ(e.target.value)} />
          <select className="h-[38px] px-3 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" value={cur} onChange={e => setCur(e.target.value)}>
            <option>All</option>{CURRENCIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select className="h-[38px] px-3 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" value={imp} onChange={e => setImp(e.target.value)}>
            {['All', 'High', 'Medium', 'Low'].map(i => <option key={i}>{i}</option>)}
          </select>
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            {(['All', 'Today', 'Tomorrow', 'Week'] as const).map(w => (
              <button key={w} onClick={() => setWhen(w)} className={`h-7 px-3 rounded-md text-xs font-extrabold transition ${when === w ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-slate-500'}`}>{w === 'Week' ? 'This week' : w}</button>
            ))}
          </div>
          {(cur !== 'All' || imp !== 'All' || q || when !== 'All') && <button onClick={() => { setCur('All'); setImp('All'); setQ(''); setWhen('All'); }} className="text-xs font-semibold text-indigo-600 hover:underline px-2">Clear filters</button>}
        </div>
      </Card>

      {loading ? (
        <Card><div className="py-10 text-center text-sm text-slate-400 animate-pulse">Loading economic events…</div></Card>
      ) : groups.length === 0 ? (
        <Card><Empty icon="🗓️" title="No events match" hint="Try clearing the currency, impact or search filters." /></Card>
      ) : (
        groups.map(([date, list]) => (
          <Card key={date} pad={false}>
            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 rounded-t-lg">
              <p className="font-display font-bold text-sm text-slate-900 dark:text-white">📅 {dayLabel(date)} <span className="ml-1 text-xs font-body font-normal text-slate-500">{list.length} events</span></p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-2 font-semibold">Time</th><th className="px-4 py-2 font-semibold">Cur.</th>
                    <th className="px-4 py-2 font-semibold">Event</th><th className="px-4 py-2 font-semibold">Impact</th>
                    <th className="px-4 py-2 font-semibold text-right">Prev</th><th className="px-4 py-2 font-semibold text-right">Forecast</th>
                    <th className="px-4 py-2 font-semibold text-right">Actual</th><th className="px-4 py-2 font-semibold">Countdown</th><th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(e => (
                    <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2 num text-slate-600 dark:text-slate-300 whitespace-nowrap">{e.time}</td>
                      <td className="px-4 py-2 whitespace-nowrap"><span className="text-base mr-1">{e.flag}</span><span className="num text-xs font-semibold">{e.currency}</span></td>
                      <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100">{e.title}
                        {(tradedDays.get(e.date) ?? 0) > 0 && <span className="ml-2 inline-flex items-center h-5 px-1.5 rounded-md bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 text-[10px] font-extrabold" title="You traded this day">📊 {tradedDays.get(e.date)} traded</span>}
                      </td>
                      <td className="px-4 py-2"><Badge tone={tone[e.impact]}><span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />{e.impact.toUpperCase()}</Badge></td>
                      <td className="px-4 py-2 num text-right text-slate-500">{e.previous || '—'}</td>
                      <td className="px-4 py-2 num text-right text-slate-500">{e.forecast || '—'}</td>
                      <td className="px-4 py-2 num text-right font-semibold text-slate-800 dark:text-slate-100">{e.actual || '—'}</td>
                      <td className="px-4 py-2"><Badge tone="gray">⏱ {countdownTo(e.date, e.time)}</Badge></td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => toggleNotify(e.id)} title="Notify me" className={`w-8 h-8 rounded-md ${e.notify ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{e.notify ? '🔔' : '🔕'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}
      </>
      )}
    </div>
  );
}
