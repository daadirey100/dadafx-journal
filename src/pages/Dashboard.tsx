import { useEffect, useMemo, useRef, useState } from 'react';
import { calcStats, equityCurve, fmtMoney, maxDrawdown, pipSize, tradePL, tradeR, tradeReward, tradeRisk } from '../lib/calc';
import { fmtCountdown, marketStatus } from '../lib/sessions';
import { countdownTo, fetchEconomicEvents } from '../lib/calendar';
import { toast, useLocal } from '../lib/store';
import { weekStartISO, type EconEvent, type GuardSettings, type Trade } from '../lib/types';
import { Badge, btnPrimary, Card, DivBars, Donut, EquityChart, Glyph, KpiCard, PLPill, SetupPill, SidePill, Stars } from '../components/ui';

type Range = '1W' | '1M' | '3M' | 'ALL';

export default function Dashboard({ trades, startBalance, onGo, onQuickAdd }: { trades: Trade[]; startBalance: number; onGo: (p: string) => void; onQuickAdd: () => void }) {
  const [events, setEvents] = useState<EconEvent[]>([]);
  const [range, setRange] = useState<Range>('1M');
  const [guards] = useLocal<GuardSettings>('dadafx.guards', { enabled: false, dailyMax: 200, weeklyMax: 500 });
  const [hideStart, setHideStart] = useLocal('dadafx.hideStart', false);
  useEffect(() => { fetchEconomicEvents().then(setEvents).catch(() => {}); }, []);



  const stats = useMemo(() => calcStats(trades), [trades]);
  const fullCurve = useMemo(() => equityCurve(trades, startBalance), [trades, startBalance]);
  const curve = useMemo(() => {
    if (range === 'ALL') return fullCurve;
    const days = range === '1W' ? 7 : range === '1M' ? 30 : 90;
    const cut = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    const f = fullCurve.filter(p => p.date === 'Start' || p.date >= cut);
    return f.length >= 2 ? f : fullCurve;
  }, [fullCurve, range]);

  const equity = fullCurve[fullCurve.length - 1]?.equity ?? startBalance;
  const netGain = equity - startBalance;
  const celebrated = useRef(0);
  useEffect(() => {
    try {
      const key = 'dadafx.equityHigh';
      const prev = Number(localStorage.getItem(key) ?? 0);
      if (!prev) { localStorage.setItem(key, String(Math.max(equity, startBalance))); return; }
      if (equity > prev && equity > celebrated.current) {
        celebrated.current = equity;
        localStorage.setItem(key, String(equity));
        toast.ok(`New equity high — ${fmtMoney(equity)}! Protect it.`);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equity]);
  const dd = maxDrawdown(trades, startBalance);
  const m = new Date().toISOString().slice(0, 7);
  const monthPL = trades.filter(t => t.date.startsWith(m)).reduce((a, t) => a + (tradePL(t) ?? 0), 0);
  const prevM = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 7);
  const prevMonthPL = trades.filter(t => t.date.startsWith(prevM)).reduce((a, t) => a + (tradePL(t) ?? 0), 0);
  const dayStr = new Date().toISOString().slice(0, 10);
  const dayTrades = trades.filter(t => t.date.startsWith(dayStr) && t.exit != null);
  const dayPL = dayTrades.reduce((a, t) => a + (tradePL(t) ?? 0), 0);
  const weekPL = useMemo(() => {
    const ws = weekStartISO();
    return trades.filter(t => t.exit != null && t.date.slice(0, 10) >= ws).reduce((a, t) => a + (tradePL(t) ?? 0), 0);
  }, [trades]);
  const guard = guards.enabled ? (() => {
    const dHit = dayPL <= -guards.dailyMax, wHit = weekPL <= -guards.weeklyMax;
    const dHot = dayPL <= -guards.dailyMax * 0.8, wHot = weekPL <= -guards.weeklyMax * 0.8;
    if (dHit || wHit) return { tone: 'red', msg: `🛑 STOP — ${dHit ? 'daily' : 'weekly'} loss limit hit (${fmtMoney(dHit ? dayPL : weekPL)}). Close the charts. Tomorrow is another day.` };
    if (dHot || wHot) return { tone: 'amber', msg: `⚠️ Caution — you're at 80% of your ${dHot ? 'daily' : 'weekly'} loss limit. One more careful trade max.` };
    return { tone: 'green', msg: `🛡️ Within limits — today ${dayPL >= 0 ? '+' : ''}${fmtMoney(dayPL)} · week ${weekPL >= 0 ? '+' : ''}${fmtMoney(weekPL)}.` };
  })() : null;
  const dayW = dayTrades.filter(t => (tradePL(t) ?? 0) > 0).length;
  const recent = [...trades].filter(t => t.exit != null).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const mkt = marketStatus(new Date());
  const openTrades = useMemo(() => [...trades].filter(t => t.exit == null).sort((a, b) => b.date.localeCompare(a.date)), [trades]);
  const exposure = useMemo(() => openTrades.reduce((a, t) => a + tradeRisk(t), 0), [openTrades]);
  const rewardExposure = useMemo(() => openTrades.reduce((a, t) => a + tradeReward(t), 0), [openTrades]);
  const netRR = exposure > 0 ? rewardExposure / exposure : null;
  const pctAtRisk = equity > 0 ? (exposure / equity) * 100 : 0;
  const started = useMemo(() => {
    const count = (k: string) => {
      try { const v = JSON.parse(localStorage.getItem(k) ?? 'null'); return Array.isArray(v) ? v.length : 0; }
      catch { return 0; }
    };
    let guardOn = false;
    try { guardOn = !!JSON.parse(localStorage.getItem('dadafx.guards') ?? 'null')?.enabled; } catch { /* ignore */ }
    let coupon = false;
    try { coupon = (JSON.parse(localStorage.getItem('dadafx.coupons') ?? '[]') ?? []).some((c: any) => c.claimed); } catch { /* ignore */ }
    return [
      { label: 'Log your first trade', done: stats.total > 0, go: 'journal' },
      { label: "Write today's daily entry", done: count('dadafx.daily') > 0, go: 'daily' },
      { label: 'Turn on the loss-limit guard', done: guardOn, go: 'portfolio' },
      { label: 'Claim a coupon', done: coupon, go: 'coupons' },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.total, events.length]);
  const doneCount = started.filter(s => s.done).length;
  const insight = useMemo(() => {
    const closed = trades.filter(t => t.exit != null);
    if (closed.length < 5) return null;
    const mm = new Map<string, number>();
    for (const t of closed) {
      const k = (t.mistakes || '').split(',')[0].trim();
      if (k) mm.set(k, (mm.get(k) ?? 0) + (tradePL(t) ?? 0));
    }
    const worst = [...mm.entries()].sort((a, b) => a[1] - b[1])[0];
    if (worst && worst[1] < -50) return { icon: '🧠', text: `“${worst[0]}” has cost you ${fmtMoney(worst[1])} so far. Your mistake coach in Statistics Center has the fix.` };
    const fol = closed.filter(t => (t.planScore ?? 100) >= 80);
    const vio = closed.filter(t => (t.planScore ?? 100) < 80);
    if (fol.length >= 3 && vio.length >= 3) {
      const pf = fol.reduce((a, t) => a + (tradePL(t) ?? 0), 0);
      const pv = vio.reduce((a, t) => a + (tradePL(t) ?? 0), 0);
      if (pf > pv + 1) return { icon: '📋', text: `Plan-followers made ${fmtMoney(pf)} vs ${fmtMoney(pv)} for rule-breakers. Discipline pays — literally.` };
    }
    const sm = new Map<string, { pl: number; n: number }>();
    for (const t of closed) {
      const k = t.session || '—';
      const e = sm.get(k) ?? { pl: 0, n: 0 };
      e.pl += tradePL(t) ?? 0; e.n++;
      sm.set(k, e);
    }
    const best = [...sm.entries()].filter(([, v]) => v.n >= 3 && v.pl > 0).sort((a, b) => b[1].pl - a[1].pl)[0];
    if (best) return { icon: '🕐', text: `${best[0]} is your money session: +${fmtMoney(best[1].pl).slice(0)} over ${best[1].n} trades. Trade it more.` };
    return { icon: '📊', text: `${stats.winRate.toFixed(0)}% win rate across ${closed.length} trades. Keep logging — insights sharpen with data.` };
  }, [trades, stats.winRate]);
  const high = useMemo(() => [...events].filter(e => e.impact === 'High').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 3), [events]);
  const byPair = useMemo(() => {
    const mp = new Map<string, number>();
    for (const t of trades) {
      if (t.exit == null) continue;
      mp.set(t.pair, (mp.get(t.pair) ?? 0) + (tradePL(t) ?? 0));
    }
    return [...mp.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 3);
  }, [trades]);

  return (
    <div className="space-y-4">
      {/* Terminal hero */}
      <Card className="rise !p-4 sm:!p-5 flex flex-wrap items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center text-xl shadow-[var(--shadow-pop)]">◈</span>
        <div className="min-w-0 flex-1">
          <p className="font-display font-extrabold text-lg tracking-tight text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
            Institutional Terminal
            {mkt.closed ? (
              <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-[10px] font-extrabold tracking-widest text-red-600 dark:text-red-300">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />MARKET CLOSED
              </span>
            ) : mkt.bankHolidays.length>0 ? (
              <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-[10px] font-extrabold tracking-widest text-amber-700 dark:text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />BANK HOLIDAY
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 text-[10px] font-extrabold tracking-widest text-indigo-600 dark:text-indigo-300">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 live-dot" />LIVE FEED
              </span>
            )}
          </p>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-slate-400 uppercase mt-0.5">{mkt.closed ? `${mkt.reason} — opens in ${mkt.nextOpen ? fmtCountdown(mkt.nextOpen.getTime() - Date.now()) : '—'}` : mkt.bankHolidays.length>0 ? `${mkt.bankHolidays.map(b=>`${b.name} (${b.center})`).join(' · ')} — JPY liquidity thin` : 'Tier-1 ECN liquidity pool · sync active'}</p>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs font-bold text-slate-500">
          {['FX Majors', 'Indices', 'Metals'].map((t, i) => (
            <span key={t} className={`px-2.5 py-1.5 rounded-lg border ${i === 0 ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900' : 'border-slate-200 dark:border-slate-700'}`}>{t}</span>
          ))}
        </div>
        <button onClick={onQuickAdd} className={btnPrimary}><Glyph name="plus" className="w-4 h-4" />Quick Add Trade</button>
      </Card>

      {guard && (
        <div className={`rise rounded-2xl border px-4 py-3 text-sm font-bold ${guard.tone === 'red' ? 'bg-red-500 text-white border-red-600 shadow-lg' : guard.tone === 'amber' ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-800' : 'bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900'}`}>
          {guard.msg}
        </div>
      )}

      {!hideStart && doneCount < 4 && (
        <Card className="rise">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white">Getting started <span className="text-xs font-bold text-slate-400 ml-1">{doneCount}/4</span></h2>
            <button onClick={() => setHideStart(true)} className="text-[11px] font-bold text-slate-400 hover:underline">Dismiss</button>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200/70 dark:bg-slate-800 mt-2 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all" style={{ width: `${(doneCount / 4) * 100}%` }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 mt-3">
            {started.map(s => (
              <button key={s.label} onClick={() => onGo(s.go)} className={`flex items-center gap-2 text-left text-[13px] font-bold rounded-xl border px-3 py-2.5 transition ${s.done ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}>
                <span className={`w-5 h-5 rounded-full text-[11px] font-extrabold flex items-center justify-center shrink-0 ${s.done ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>{s.done ? '✓' : '→'}</span>
                {s.label}
              </button>
            ))}
          </div>
        </Card>
      )}

      {insight && (
        <button onClick={() => onGo('stats')} className="rise w-full text-left rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-gradient-to-r from-indigo-50/80 to-violet-50/80 dark:from-indigo-950/50 dark:to-violet-950/50 px-4 py-3 flex items-center gap-3 hover:shadow-md transition">
          <span className="text-2xl">{insight.icon}</span>
          <span className="text-sm"><b className="font-display">Insight of the day — </b><span className="text-slate-600 dark:text-slate-300">{insight.text}</span></span>
          <span className="ml-auto text-indigo-500 font-extrabold shrink-0">→</span>
        </button>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-2.5 sm:gap-3">
        <div className="rise rise-1"><KpiCard label="Account Balance" value={`$${(startBalance + stats.totalPL).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} valueTone={stats.totalPL > 0 ? 'up' : stats.totalPL < 0 ? 'down' : 'neutral'} delta={`${stats.totalPL >= 0 ? '+' : '−'}${fmtMoney(Math.abs(stats.totalPL)).slice(0)}`} deltaTone={stats.totalPL >= 0 ? 'up' : 'down'} sub={`${((stats.totalPL / startBalance) * 100).toFixed(2)}%`} icon="wallet" /></div>
        <div className="rise rise-2"><KpiCard label="Equity & Drawdown" value={fmtMoney(equity)} delta={dd < 0 ? fmtMoney(dd) : 'No DD'} deltaTone={dd < 0 ? 'down' : 'flat'} sub={dd < 0 ? `Max DD ${((Math.abs(dd) / startBalance) * 100).toFixed(2)}% · recover +${((Math.abs(dd) / equity) * 100).toFixed(2)}%` : 'Clean — no drawdown'} icon="shield" tint="bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300" /></div>
        <div className="rise rise-3"><KpiCard label="Today's Net P/L" value={`${dayPL < 0 ? '−' : '+'}${fmtMoney(Math.abs(dayPL)).slice(0)}`} valueTone={dayPL > 0 ? 'up' : dayPL < 0 ? 'down' : 'neutral'} delta={`${dayTrades.length} trades`} deltaTone="brand" sub={`${dayW}W ${dayTrades.length - dayW}L`} icon="bolt" tint="bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300" /></div>
        <div className="rise rise-4"><KpiCard label={`Monthly P/L (${new Date().toLocaleString(undefined, { month: 'short' })})`} value={`${monthPL < 0 ? '−' : '+'}${fmtMoney(Math.abs(monthPL)).slice(0)}`} valueTone={monthPL > 0 ? 'up' : monthPL < 0 ? 'down' : 'neutral'} delta={`${stats.winRate.toFixed(1)}% WR`} deltaTone="brand" sub={`vs last mo ${monthPL - prevMonthPL >= 0 ? '+' : ''}${fmtMoney(monthPL - prevMonthPL)}`} icon="calendar" tint="bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300" /></div>
        <div className="rise rise-5 col-span-2 xl:col-span-1"><KpiCard label="Profit Factor / RR" value={stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2)} delta={`Avg ${stats.avgR >= 0 ? '+' : ''}${stats.avgR.toFixed(2)}R`} deltaTone={stats.avgR >= 0 ? 'up' : 'down'} sub={`${stats.total} trades`} icon="scale" /></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        {/* Equity trajectory */}
        <Card className="xl:col-span-2 rise rise-2">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <div>
              <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white">Equity Growth Trajectory <Badge tone="green">Institutional Grade</Badge></h2>
              <p className="text-xs text-slate-500 mt-0.5">Realized balance curve vs starting-balance corridor</p>
            </div>
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              {(['1W', '1M', '3M', 'ALL'] as Range[]).map(r => (
                <button key={r} onClick={() => setRange(r)} className={`h-7 px-3 rounded-md text-xs font-extrabold transition ${range === r ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-slate-500'}`}>{r}</button>
              ))}
            </div>
          </div>
          <EquityChart points={curve} startLine={startBalance} height={250} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />Realized Equity</span>
            <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-slate-400 inline-block" />Starting Balance (${(startBalance / 1000).toFixed(0)}k)</span>
            <span className={`ml-auto num font-extrabold ${netGain > 0 ? 'text-emerald-600' : netGain < 0 ? 'text-red-600' : ''}`}>Net {netGain >= 0 ? '+' : ''}{fmtMoney(netGain)}</span>
          </div>
        </Card>

        {/* Right rail */}
        <div className="space-y-3">
          <Card className="rise rise-2">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display font-extrabold text-[15px] tracking-tight">Open exposure</h2>
              <Badge tone={openTrades.length ? 'amber' : 'gray'}>{openTrades.length} open</Badge>
            </div>
            {openTrades.length === 0 ? (
              <p className="text-xs text-slate-400">Flat — no open positions. Risk at rest. 🛋️</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-red-200 dark:border-red-900 bg-gradient-to-br from-red-50 to-white dark:from-red-950/30 dark:to-slate-900 px-3 py-3 text-center">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-red-500">At risk</p>
                    <p className="num font-display font-extrabold text-lg leading-none mt-1 text-slate-900 dark:text-white">{fmtMoney(exposure)}</p>
                    <p className="text-[11px] font-bold text-red-600 dark:text-red-400">SL hit</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-slate-900 px-3 py-3 text-center">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-emerald-500">Gain if TP</p>
                    <p className="num font-display font-extrabold text-lg leading-none mt-1 text-slate-900 dark:text-white">{fmtMoney(rewardExposure)}</p>
                    <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">TP hit</p>
                  </div>
                </div>
                <p className="text-center text-xs font-semibold text-slate-500 mt-2">
                  <span className="inline-flex items-center gap-1.5">
                    {netRR != null && <><span className="text-indigo-600 dark:text-indigo-400 font-extrabold num">1:{netRR.toFixed(2)} R:R</span><span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" /></>}
                    <span className="num">{pctAtRisk.toFixed(2)}% equity at risk</span>
                  </span>
                </p>
                <div className="space-y-1.5 mt-3">
                  {openTrades.slice(0, 4).map(t => {
                    const rr = (()=>{ const r=tradeRisk(t); const rw=tradeReward(t); return r>0? (rw/r).toFixed(2): null; })();
                    const ps=pipSize(t.pair); const slP=Math.round(Math.abs(t.entry - t.stopLoss)/ps); const tpP=Math.round(Math.abs(t.takeProfit - t.entry)/ps);
                    return (
                    <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-sm num">{t.pair}</span>
                          <SidePill side={t.direction} />
                          {rr && <span className="inline-flex h-5 px-1.5 items-center rounded-md bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-extrabold num">1:{rr}</span>}
                        </div>
                        <p className="text-[11px] text-slate-400 num truncate">{t.lot.toFixed(2)} lots · {slP} / {tpP} pips</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="num text-xs font-bold leading-none"><span className="text-red-600">−{fmtMoney(tradeRisk(t))}</span><span className="text-slate-300 mx-1">·</span><span className="text-emerald-600">+{fmtMoney(tradeReward(t))}</span></p>
                        <p className="text-[10px] text-slate-400 num">{t.entry} → TP {t.takeProfit}</p>
                      </div>
                    </div>
                  )})}
                </div>
                {openTrades.length > 4 && <p className="text-[11px] text-slate-400 mt-1.5">+{openTrades.length - 4} more</p>}
              </>
            )}
            <button onClick={() => onGo('journal')} className="mt-2 text-xs font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline">MANAGE IN JOURNAL →</button>
          </Card>
          <Card className="rise rise-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-extrabold text-[15px] tracking-tight flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500 live-dot text-red-500" />Economic Radar</h2>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">High-impact</span>
            </div>
            <div className="space-y-2">
              {high.length === 0 && <p className="text-xs text-slate-400 py-2">Loading radar…</p>}
              {high.map(e => (
                <div key={e.id} className="rounded-xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-extrabold num bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">{e.currency}</span>
                    <p className="text-[13px] font-bold truncate flex-1 text-slate-800 dark:text-slate-100">{e.title}</p>
                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 rounded-full px-2 py-0.5 whitespace-nowrap">⏱ {countdownTo(e.date, e.time)}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Fcst {e.forecast || '—'} · Prior {e.previous || '—'} <span className="text-red-500 font-bold">● High Vol</span></p>
                </div>
              ))}
            </div>
            <button onClick={() => onGo('calendar')} className="mt-3 text-xs font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline">FULL CALENDAR →</button>
          </Card>

          <Card className="rise rise-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display font-extrabold text-[15px] tracking-tight">Execution Accuracy</h2>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Setups only</span>
            </div>
            <Donut pct={stats.winRate} label="Win rate" sub={<><p><b className="text-slate-700 dark:text-slate-200">Wins:</b> {stats.wins}</p><p><b className="text-slate-700 dark:text-slate-200">Losses:</b> {stats.losses}</p><p><b className="text-slate-700 dark:text-slate-200">Avg Win:</b> {fmtMoney(stats.avgWin)}</p></>} />
          </Card>

          <Card className="rise rise-5">
            <h2 className="font-display font-extrabold text-[15px] tracking-tight mb-3">P/L by Instrument</h2>
            {byPair.length === 0 ? <p className="text-xs text-slate-400">Log trades to rank instruments.</p> : <DivBars data={byPair} money />}
            <button onClick={() => onGo('analytics')} className="mt-3 text-xs font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline">FULL ANALYTICS →</button>
          </Card>
        </div>
      </div>

      {/* Recent closed trades */}
      <Card pad={false} className="rise rise-3 overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-4">
          <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white">Recent Closed Trades <Badge tone="indigo">Last {recent.length}</Badge></h2>
          <button onClick={() => onGo('journal')} className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline">VIEW JOURNAL MATRIX →</button>
        </div>
        <div className="overflow-x-auto">
          <table className="ledger w-full text-sm min-w-[760px]">
            <thead><tr><th className="!pl-4 sm:!pl-5">Asset / Pair</th><th>Type</th><th className="text-right">Lots</th><th>Entry → Exit</th><th className="text-right">R-Multiple</th><th>Net P/L</th><th>Setup</th><th className="!pr-4 sm:!pr-5">Rating</th></tr></thead>
            <tbody>
              {recent.map(t => {
                const pl = tradePL(t) ?? 0;
                const r = tradeR(t);
                const win = pl > 0;
                return (
                  <tr key={t.id}>
                    <td className="!pl-4 sm:!pl-5 font-extrabold whitespace-nowrap"><span className={`inline-block w-2 h-2 rounded-full mr-2 ${win ? 'bg-emerald-600' : 'bg-red-500'}`} />{t.pair}</td>
                    <td><SidePill side={t.direction} /></td>
                    <td className="text-right num">{t.lot.toFixed(2)}</td>
                    <td className="num text-xs whitespace-nowrap">{t.entry} <span className="text-slate-400">→</span> {t.exit}</td>
                    <td className={`text-right num font-extrabold ${r != null && r >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{r == null ? '—' : `${r >= 0 ? '+' : ''}${r.toFixed(2)}R`}</td>
                    <td><PLPill value={pl} format={v => `${v < 0 ? '−' : '+'}${fmtMoney(Math.abs(v)).slice(0)}`} /></td>
                    <td><SetupPill>{t.setup || t.strategy}</SetupPill></td>
                    <td className="!pr-4 sm:!pr-5"><Stars n={t.rating} /></td>
                  </tr>
                );
              })}
              {recent.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-400">No closed trades yet. <button onClick={onQuickAdd} className="text-indigo-600 font-bold hover:underline">Log your first trade →</button></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
