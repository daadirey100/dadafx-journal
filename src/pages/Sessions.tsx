import { useEffect, useMemo, useState } from 'react';
import { calcStats, fmtMoney, tradePL } from '../lib/calc';
import { fmtCountdown, marketStatus, overlapOpen, sessionStatus, SESSION_DEFS } from '../lib/sessions';
import { APP_TZ_LABEL, appTzLabel, fmtAppClock } from '../lib/time';
import type { Trade } from '../lib/types';
import { PageHeader } from '../components/ui';

const VOL: Record<string, number> = { sydney: 1, tokyo: 2, london: 4, newyork: 5 };

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function VolDots({ level, color }: { level: number; color: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={`Volatility ${level}/5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className="w-1.5 rounded-full" style={{ height: 6 + i * 3, background: i <= level ? color : 'rgba(148,163,184,.35)' }} />
      ))}
    </span>
  );
}

/** 24h session map — one track per session, glowing now-marker. */
function DayMap({ now }: { now: Date }) {
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const left = `${(mins / 1440) * 100}%`;
  const seg = (s: number, e: number) => {
    const parts: { l: number; w: number }[] = [];
    if (s < e) parts.push({ l: s / 24, w: (e - s) / 24 });
    else { parts.push({ l: s / 24, w: (24 - s) / 24 }); parts.push({ l: 0, w: e / 24 }); }
    return parts;
  };
  const short = (n: string) => n.replace(' Session', '').replace(' (European)', '').replace(' (North American)', '').replace(' (Asian)', '');
  return (
    <div className="relative">
      <div className="space-y-1.5">
        {SESSION_DEFS.map(def => (
          <div key={def.id} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">{short(def.name)}</span>
            <div className="relative flex-1 h-5 rounded-md bg-slate-900/10 dark:bg-white/10 overflow-hidden">
              {seg(def.start, def.end).map((p, i) => (
                <span key={i} className="absolute top-0 bottom-0 rounded-sm" style={{ left: `${p.l * 100}%`, width: `${p.w * 100}%`, background: `linear-gradient(90deg, ${def.color}99, ${def.color})`, boxShadow: `0 0 12px ${def.color}66` }} />
              ))}
              <span className="absolute top-0 bottom-0 w-[2px] bg-white dark:bg-white shadow-[0_0_8px_#fff]" style={{ left }} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex ml-[5.5rem] mt-1">
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => (
          <span key={h} className="flex-1 text-[9px] num text-slate-500 dark:text-slate-400 first:text-left -ml-2 first:ml-0">{String(h).padStart(2, '0')}:00</span>
        ))}
      </div>
    </div>
  );
}

export default function Sessions({ trades, onGo }: { trades: Trade[]; onGo: (p: string) => void }) {
  const now = useNow();
  const clock = fmtAppClock(now);

  const statuses = useMemo(() => SESSION_DEFS.map(def => ({ def, st: sessionStatus(def, now) })), [now]);
  const openNow = statuses.filter(s => s.st.open);
  const overlap = overlapOpen(now);

  const plan = overlap
    ? { title: 'Peak window — trade momentum', detail: 'London × New York overlap. Breakouts, USD news and gold/index trends. Tighten stops, size normal.' }
    : openNow.some(s => s.def.id === 'london')
      ? { title: 'Breakout window — London is open', detail: 'Trade EUR/USD & GBP/USD breaks of the Asian range. Best 07:00–10:00 UTC.' }
      : openNow.some(s => s.def.id === 'newyork')
        ? { title: 'Trend window — New York is open', detail: 'Follow the London-established trend or fade the first NY reversal. Watch 12:30–15:00 UTC news.' }
        : openNow.some(s => s.def.id === 'tokyo')
          ? { title: 'Range window — Tokyo is open', detail: 'Fade JPY-range edges, small size. Save ammo for London.' }
          : { title: 'Stand by — Sydney only', detail: 'Thin liquidity. Journal, backtest, or rest. No hero trades at 3am spreads.' };

  const perSession = useMemo(() => {
    const groups = new Map<string, Trade[]>();
    for (const t of trades.filter(t => t.exit != null)) {
      const k = t.session || '—';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(t);
    }
    return [...groups.entries()].map(([name, list]) => {
      const s = calcStats(list);
      const pl = list.reduce((a, t) => a + (tradePL(t) ?? 0), 0);
      return { name, trades: list.length, winRate: s.winRate, pl };
    }).sort((a, b) => b.pl - a.pl);
  }, [trades]);

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Market hours · live" title="Trading Sessions" sub="Know what's open, when volatility arrives, and which session pays you." />
      {(()=>{ const ms=marketStatus(now); if(ms.closed){ const msToOpen = ms.nextOpen ? ms.nextOpen.getTime() - now.getTime() : 0; return (
        <div className="rounded-2xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-red-600 text-white text-xs font-extrabold"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />MARKET CLOSED</span>
          <span className="text-sm font-bold text-red-800 dark:text-red-200">{ms.reason} {ms.isHoliday && `— ${ms.holidayName}`}</span>
          {ms.nextOpen && <span className="ml-auto text-xs font-bold text-slate-600 dark:text-slate-300">Opens in <b className="num text-slate-900 dark:text-white">{fmtCountdown(msToOpen)}</b> · {ms.nextOpen.toUTCString().slice(0,22)} UTC</span>}
        </div>
      );}
      if(ms.bankHolidays.length>0){ return (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-amber-500 text-white text-xs font-extrabold">BANK HOLIDAY</span>
          <span className="text-sm font-bold text-amber-800 dark:text-amber-200">{ms.bankHolidays.map(b=> `${b.name} (${b.center})`).join(' · ')} — {ms.bankHolidays.some(b=>b.center==='Japan') ? 'Tokyo banks closed, JPY liquidity thin — London/NY still open' : 'Liquidity thin'}</span>
          <span className="ml-auto text-xs font-bold text-amber-700 dark:text-amber-300">Today {new Date().toISOString().slice(0,10)}</span>
        </div>
      );}
      return null;
      })()}

      {/* glass canvas */}
      <div className="sessions-canvas relative overflow-hidden rounded-3xl border border-white/50 dark:border-white/10 p-3 sm:p-5 space-y-3">
        <span className="orb w-72 h-72 -top-20 -left-20" style={{ background: '#818cf8' }} />
        <span className="orb w-80 h-80 top-10 right-[-60px]" style={{ background: '#e879f9', animationDelay: '-4s' }} />
        <span className="orb w-64 h-64 bottom-[-80px] left-1/3" style={{ background: '#34d399', animationDelay: '-8s' }} />

        {/* live clock panel */}
        <div className="glass rise relative rounded-2xl p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${marketStatus(now).closed ? 'bg-red-500' : 'bg-emerald-500 live-dot text-emerald-500'}`} />Live · Forex clock {marketStatus(now).closed && '· CLOSED'}
            </p>
            {marketStatus(now).bankHolidays.length>0 && !marketStatus(now).closed && <p className="text-xs font-bold text-amber-600 dark:text-amber-400 mt-1">Today: {marketStatus(now).bankHolidays.map(b=>`${b.name} (${b.center})`).join(' · ')} — expect thin liquidity</p>}
            {marketStatus(now).closed && <p className="text-xs font-bold text-red-600 dark:text-red-400 mt-1">{marketStatus(now).reason} — {marketStatus(now).isHoliday ? marketStatus(now).holidayName : 'Weekend'}</p>}
            <p className="font-display font-extrabold text-4xl sm:text-5xl num tracking-tight mt-2 text-slate-900 dark:text-white">{clock}<span className="text-sm sm:text-base font-bold text-slate-500 ml-2">{APP_TZ_LABEL}</span></p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {openNow.length === 0 && <span className="text-xs font-bold text-slate-500">All major sessions closed</span>}
              {openNow.map(s => (
                <span key={s.def.id} className="glass inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-extrabold text-slate-800 dark:text-white">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.def.color }} />{s.def.name}
                </span>
              ))}
            </div>
            <div className="glass mt-4 rounded-xl p-3.5">
              <p className="font-display font-extrabold text-slate-900 dark:text-white">{plan.title}</p>
              <p className="text-[13px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{plan.detail}</p>
            </div>
          </div>
          <div className="lg:col-span-3 glass rounded-2xl p-4">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 mb-3">24-hour session map <span className="normal-case font-semibold">· white line = now</span></p>
            <DayMap now={now} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
              {SESSION_DEFS.map(d => (
                <span key={d.id} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />{d.name} · {String(d.start).padStart(2, '0')}–{String(d.end).padStart(2, '0')} UTC
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* glass session cards */}
        <div className="relative grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {statuses.map(({ def, st }, i) => (
            <div key={def.id} className={`glass rise rise-${i + 1} relative overflow-hidden rounded-2xl`}>
              <span className="absolute top-0 left-0 right-0 h-1" style={{ background: `linear-gradient(90deg, transparent, ${def.color}, transparent)` }} />
              <div className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{def.tz}</p>
                    <h2 className="font-display font-extrabold tracking-tight text-[15px] leading-snug text-slate-900 dark:text-white">{def.name}</h2>
                  </div>
                  {st.holiday
                    ? <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-amber-500 text-white text-[11px] font-extrabold shadow shrink-0">HOLIDAY</span>
                    : st.open
                    ? <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-white text-[11px] font-extrabold shadow shrink-0" style={{ background: def.color }}><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />OPEN</span>
                    : <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-slate-500/15 text-slate-500 text-[11px] font-extrabold shrink-0">CLOSED</span>}
                </div>
                {st.holiday ? (
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mt-2">{st.holidayName}</p>
                ) : (
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-2">{st.open ? 'Closes in' : 'Opens in'}</p>
                )}
                <p className="font-display font-extrabold text-[34px] leading-none num tracking-tight text-slate-900 dark:text-white">{fmtCountdown(st.msToChange)}</p>
                {st.open && (
                  <div className="h-1.5 rounded-full bg-slate-500/15 mt-2.5 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${st.progress * 100}%`, background: def.color, boxShadow: `0 0 10px ${def.color}` }} />
                  </div>
                )}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Volatility</span>
                  <VolDots level={VOL[def.id]} color={def.color} />
                </div>
                <p className="num text-[11px] text-slate-500 dark:text-slate-400 mt-2">{String(def.start).padStart(2, '0')}:00–{String(def.end).padStart(2, '0')}:00 UTC · {appTzLabel(def.start)}–{appTzLabel(def.end)} {APP_TZ_LABEL}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {def.pairs.split('·').map(p => (
                    <span key={p} className="glass text-[10px] font-extrabold num px-1.5 py-0.5 rounded-md text-slate-700 dark:text-slate-200">{p.trim()}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* glass edge table */}
        <div className="glass rise rise-2 relative rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-5 py-4">
            <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white">My edge per session</h2>
            <button onClick={() => onGo('journal')} className="text-xs font-extrabold text-indigo-600 dark:text-indigo-300 hover:underline">FILTER IN JOURNAL →</button>
          </div>
          {perSession.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-slate-500 dark:text-slate-400">Log trades with a session tag and your per-session record appears here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="ledger w-full text-sm min-w-[560px]">
                <thead><tr><th className="!pl-4 sm:!pl-5">Session</th><th className="text-right">Trades</th><th className="text-right">Win rate</th><th className="text-right !pr-4 sm:!pr-5">Net P/L</th></tr></thead>
                <tbody>
                  {perSession.map(r => (
                    <tr key={r.name}>
                      <td className="!pl-4 sm:!pl-5 font-extrabold text-slate-800 dark:text-slate-100">{r.name}</td>
                      <td className="text-right num text-slate-600 dark:text-slate-300">{r.trades}</td>
                      <td className="text-right num font-bold text-slate-800 dark:text-slate-100">{r.winRate.toFixed(1)}%</td>
                      <td className={`text-right num font-extrabold !pr-4 sm:!pr-5 ${r.pl > 0 ? 'text-emerald-600 dark:text-emerald-300' : r.pl < 0 ? 'text-red-600 dark:text-red-300' : 'text-slate-400'}`}>{r.pl >= 0 ? '+' : ''}{fmtMoney(r.pl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {/* Upcoming holidays — only shown on actual holiday/weekend, not every day */}
        {(() => { const ms = marketStatus(now); const showHolidays = ms.closed || ms.bankHolidays.length > 0; if (!showHolidays) return null; return (
        <div className="glass rise relative rounded-2xl overflow-hidden p-4">
          <h3 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-500" />Market holidays & weekends</h3>
          <p className="text-xs text-slate-500 mt-1">Forex closed Sat–Sun until Sydney 21:00 UTC. Plan around holidays — spreads widen.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
            {[
              { date: '2026-01-01', name: "New Year's Day", status: new Date().toISOString().slice(0,10) === '2026-01-01' ? 'Today — closed' : 'Closed' },
              { date: '2026-04-03', name: 'Good Friday', status: 'Closed' },
              { date: '2026-12-25', name: 'Christmas', status: 'Closed' },
              { date: 'Every Sat–Sun', name: 'Weekend', status: 'Sat 00:00 → Sun 21:00 UTC closed' },
            ].map(h=>(
              <div key={h.date} className="flex items-center justify-between rounded-xl border border-amber-200/60 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30 px-3 py-2">
                <div><p className="text-xs font-extrabold text-slate-800 dark:text-slate-100">{h.name}</p><p className="text-[11px] text-slate-500 num">{h.date}</p></div>
                <span className="text-[10px] font-extrabold px-2 py-1 rounded-full bg-amber-500 text-white">{h.status}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Your clock: <b className="num">{APP_TZ_LABEL}</b> · Forex hours shown in UTC</p>
        </div>
        ); })()}
      </div>
    </div>
  );
}
