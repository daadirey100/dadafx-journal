import { useMemo, useState } from 'react';
import { calcStats, equityCurve, fmtDuration, fmtMoney, maxDrawdown, tradeDurationMs, tradePL, tradeR } from '../lib/calc';
import type { Trade } from '../lib/types';
import { Bars, Card, DivBars, Donut, EquityChart, Glyph, PageHeader, Sparkline } from '../components/ui';
import TradingViewTech from '../components/TradingViewTech';
import { tvSymbol } from '../lib/tv';
import { PAIRS } from '../lib/types';

function groupBy(trades: Trade[], fn: (t: Trade) => string) {
  const m = new Map<string, number>();
  for (const t of trades) {
    const pl = tradePL(t) ?? 0;
    const k = fn(t);
    m.set(k, (m.get(k) ?? 0) + pl);
  }
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export default function Analytics({ trades, startBalance }: { trades: Trade[]; startBalance: number }) {
  const closed = useMemo(() => trades.filter(t => t.exit != null), [trades]);
  const s = calcStats(trades);
  const curve = useMemo(() => equityCurve(trades, startBalance), [trades, startBalance]);
  const ddSeries = useMemo(() => {
    const start = curve[0]?.equity ?? startBalance;
    const { out } = curve.reduce<{ peak: number; out: number[] }>(
      (acc, p) => {
        const peak = Math.max(acc.peak, p.equity);
        acc.out.push(p.equity - peak);
        return { peak, out: acc.out };
      },
      { peak: start, out: [] },
    );
    return out;
  }, [curve, startBalance]);
  const dd = maxDrawdown(trades, startBalance);
  const years = useMemo(() => {
    const ys = new Set<string>();
    for (const t of closed) ys.add(t.date.slice(0, 4));
    ys.add(new Date().toISOString().slice(0, 4));
    return [...ys].sort().reverse();
  }, [closed]);
  const avgHold = useMemo(() => {
    const ds = closed.map(t => tradeDurationMs(t)).filter((d): d is number => d != null);
    return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
  }, [closed]);
  const byPair = groupBy(closed, t => t.pair);
  const byRating = groupBy(closed, t => `${t.rating}★`);
  const byStrat = groupBy(closed, t => t.strategy || '—');
  const bySession = groupBy(closed, t => t.session || '—');
  const byTf = groupBy(closed, t => t.timeframe || '—');
  const byDay = groupBy(closed, t => new Date(t.date).toLocaleDateString(undefined, { weekday: 'short' }));
  const byMonth = groupBy(closed, t => t.date.slice(0, 7));
  const byHour = useMemo(() => {
    const blocks = Array.from({ length: 8 }, (_, i) => ({ label: `${String(i * 3).padStart(2, '0')}-${String(i * 3 + 3).padStart(2, '0')}`, value: 0 }));
    for (const t of closed) {
      const h = new Date(t.date).getHours();
      if (isNaN(h)) continue;
      blocks[Math.min(7, Math.floor(h / 3))].value += tradePL(t) ?? 0;
    }
    return blocks.map(b => ({ ...b, value: Math.round(b.value * 100) / 100 }));
  }, [closed]);
  const totalCosts = useMemo(() => closed.reduce((a, t) => a + (t.commission ?? 0), 0), [closed]);
  const rDist = useMemo(() => {
    const buckets = new Map<string, { value: number; tone: 'up' | 'down' | 'flat' }>([
      ['<-2R', { value: 0, tone: 'down' }], ['-2..0R', { value: 0, tone: 'down' }],
      ['0..1R', { value: 0, tone: 'flat' }], ['1..2R', { value: 0, tone: 'up' }], ['2R+', { value: 0, tone: 'up' }],
    ]);
    for (const t of closed) {
      const r = tradeR(t) ?? 0;
      const k = r < -2 ? '<-2R' : r < 0 ? '-2..0R' : r < 1 ? '0..1R' : r < 2 ? '1..2R' : '2R+';
      buckets.get(k)!.value++;
    }
    return [...buckets.entries()].map(([label, v]) => ({ label, ...v }));
  }, [closed]);

  const [techPair, setTechPair] = useState(byPair[0]?.label ?? 'EUR/USD');
  const [techInterval, setTechInterval] = useState('1M');
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Performance intelligence" title="Analytics"
        sub={<>Win rate <b className={s.winRate >= 50 ? 'text-emerald-600' : 'text-amber-600'}>{s.winRate.toFixed(1)}%</b> · Profit factor <b className={s.profitFactor >= 1 ? 'text-emerald-600' : 'text-red-600'}>{s.profitFactor >= 99 ? '∞' : s.profitFactor.toFixed(2)}</b> · Net <b className={s.totalPL >= 0 ? 'text-emerald-600' : 'text-red-600'}>{s.totalPL >= 0 ? '+' : ''}{fmtMoney(s.totalPL)}</b> · all values in account currency</>} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <Card className="xl:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white">Equity growth</h2>
            <span className={`num text-sm font-extrabold ${s.totalPL >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{s.totalPL >= 0 ? '+' : ''}{fmtMoney(s.totalPL)}</span>
          </div>
          <EquityChart points={curve} startLine={startBalance} height={220} />
        </Card>
        <div className="space-y-3">
          <Card>
            <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white mb-2">Win rate</h2>
            <Donut pct={s.winRate} label="Win rate" sub={<><p><b className="text-slate-700 dark:text-slate-200">Profit factor:</b> {s.profitFactor >= 99 ? '∞' : s.profitFactor.toFixed(2)}</p><p><b className="text-slate-700 dark:text-slate-200">Expectancy:</b> {fmtMoney(s.expectancy)}</p></>} />
          </Card>
          <Card>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white">Drawdown drift</h2>
              <span className="num text-sm font-extrabold text-red-600">{fmtMoney(dd)}</span>
            </div>
            <Sparkline points={ddSeries} height={90} stroke="#dc2626" />
          </Card>
        </div>
      </div>
      <Card pad={false}>
        <div className="px-4 sm:px-5 pt-4">
          <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white">Year in review</h2>
          <p className="text-xs text-slate-500">Net P/L per month — green months pay for the red ones.</p>
        </div>
        <div className="overflow-x-auto px-4 sm:px-5 pb-4">
          <table className="w-full text-xs min-w-[860px] mt-2">
            <thead><tr className="text-slate-400">
              <th className="text-left py-1.5 pr-2 font-bold">Year</th>
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(m => <th key={m} className="py-1.5 px-1 font-bold text-right">{m}</th>)}
              <th className="py-1.5 pl-2 font-bold text-right">Total</th>
            </tr></thead>
            <tbody>
              {years.map(y => {
                const cells = Array.from({ length: 12 }, (_, i) => {
                  const key = `${y}-${String(i + 1).padStart(2, '0')}`;
                  return closed.filter(t => t.date.startsWith(key)).reduce((a, t) => a + (tradePL(t) ?? 0), 0);
                });
                const tot = cells.reduce((a, b) => a + b, 0);
                const kfmt = (v: number) => `${v < 0 ? '−' : '+'}$${(Math.abs(v) / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k`;
                return (
                  <tr key={y} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 pr-2 font-extrabold num">{y}</td>
                    {cells.map((v, i) => (
                      <td key={i} title={fmtMoney(v)} className={`py-1.5 px-1 text-right num font-bold rounded ${v > 0 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' : v < 0 ? 'text-red-600 bg-red-50 dark:bg-red-950/40' : 'text-slate-300 dark:text-slate-700'}`}>
                        {v === 0 ? '·' : kfmt(v)}
                      </td>
                    ))}
                    <td className={`py-1.5 pl-2 text-right num font-extrabold ${tot >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{tot >= 0 ? '+' : ''}{fmtMoney(tot)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card><h2 className="font-display font-bold mb-3 text-slate-900 dark:text-white">P/L by pair</h2><Bars data={byPair} /></Card>
        <Card><h2 className="font-display font-bold mb-1 text-slate-900 dark:text-white">P/L by star rating</h2><p className="text-xs text-slate-500 mb-3">Do your 5★ calls actually pay?</p><Bars data={byRating} money /></Card>
        <Card><h2 className="font-display font-bold mb-3 text-slate-900 dark:text-white">P/L by strategy</h2><Bars data={byStrat} /></Card>
        <Card><h2 className="font-display font-bold mb-3 text-slate-900 dark:text-white">P/L by session</h2><Bars data={bySession} /></Card>
        <Card><h2 className="font-display font-bold mb-3 text-slate-900 dark:text-white">P/L by timeframe</h2><Bars data={byTf} /></Card>
        <Card><h2 className="font-display font-bold mb-3 text-slate-900 dark:text-white">P/L by weekday</h2><Bars data={byDay} /></Card>
        <Card><h2 className="font-display font-bold mb-3 text-slate-900 dark:text-white">P/L by direction</h2><Bars data={groupBy(closed, t => t.direction)} money /></Card>
        <Card><h2 className="font-display font-bold mb-1 text-slate-900 dark:text-white">P/L by setup</h2><p className="text-xs text-slate-500 mb-3">Top setups by absolute P/L</p><Bars data={groupBy(closed, t => (t.setup || '—').slice(0, 24)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 8)} money /></Card>
        <Card><h2 className="font-display font-bold mb-3 text-slate-900 dark:text-white">P/L by month</h2><Bars data={byMonth} /></Card>
        <Card><h2 className="font-display font-bold mb-1 text-slate-900 dark:text-white">Best trading hours</h2><p className="text-xs text-slate-500 mb-3">Local entry time · 3-hour blocks</p><DivBars data={byHour} money /></Card>
        <Card><h2 className="font-display font-bold mb-3 text-slate-900 dark:text-white">R-multiple distribution (trade count)</h2><Bars data={rDist} /></Card>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="font-display font-bold text-slate-900 dark:text-white">TradingView — Technical Analysis</h2>
            <div className="flex items-center gap-1.5">
              <select value={techPair} onChange={e=>setTechPair(e.target.value)} className="h-8 px-2 rounded-lg border bg-white dark:bg-slate-900 text-xs font-bold">
                {[...new Set([...(byPair.map(p=>p.label)), ...PAIRS])].slice(0,12).map(p=> <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={techInterval} onChange={e=>setTechInterval(e.target.value)} className="h-8 px-2 rounded-lg border bg-white dark:bg-slate-900 text-xs font-bold">
                {['1m','5m','15m','60m','240','1D','1W','1M'].map(v=> <option key={v} value={v==='1m'?'1':v==='5m'?'5':v==='15m'?'15':v==='60m'?'60':v}>{v}</option>)}
              </select>
              <a href={`https://www.tradingview.com/symbols/${tvSymbol(techPair).replace(':','-')}/`} target="_blank" rel="noreferrer" className="h-8 px-2.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center gap-1"><Glyph name="trend" className="w-3.5 h-3.5" />Chart</a>
            </div>
          </div>
          <TradingViewTech symbol={tvSymbol(techPair)} interval={techInterval} key={`${techPair}-${techInterval}`} />
          <p className="text-[11px] text-slate-400 mt-2">Oscillators + Moving Averages → BUY/SELL summary for <b>{techPair}</b> — from TradingView, not a signal. Use with your journal edge.</p>
        </Card>
        <Card>
          <h2 className="font-display font-bold mb-3 text-slate-900 dark:text-white">Monte Carlo — next 100 trades</h2>
          <p className="text-xs text-slate-500 mb-3">500 shuffled paths from your win rate ({s.winRate.toFixed(1)}%) × payoff ({s.avgLoss>0?(s.avgWin/s.avgLoss).toFixed(2):'—'}R). Median, p10/p90 bands.</p>
          {(() => {
            if(closed.length<10) return <p className="text-xs text-slate-400 py-6 text-center">Need 10+ closed trades for a meaningful sim.</p>;
            const paths = 120;
            const steps = 100;
            const p = s.winRate/100;
            const win = s.avgWin; const loss = s.avgLoss;
            const sims: number[][] = [];
            for(let i=0;i<paths;i++){
              let bal=0; const pts:number[]=[0];
              // oxlint-disable-next-line react(purity)
              for(let j=0;j<steps;j++){ bal += Math.random()<p ? win : -loss; pts.push(bal); }
              sims.push(pts);
            }
            const pct = (arr:number[], q:number)=>{ const s=[...arr].sort((a,b)=>a-b); return s[Math.floor(q*s.length)]; };
            const median = Array.from({length:steps+1},(_,k)=> pct(sims.map(s=>s[k]),0.5));
            const p10 = Array.from({length:steps+1},(_,k)=> pct(sims.map(s=>s[k]),0.10));
            const p90 = Array.from({length:steps+1},(_,k)=> pct(sims.map(s=>s[k]),0.90));
            const endMedian = median[steps]; const endP10 = p10[steps]; const endP90 = p90[steps];
            return <>
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-2">
                <Sparkline points={median} height={140} stroke="#4f46e5" />
                <div className="flex gap-2 text-[11px] num font-bold justify-center mt-1">
                  <span className="text-red-500">p10 {endP10>=0?'+':''}{fmtMoney(endP10)}</span>
                  <span className="text-indigo-600">median {endMedian>=0?'+':''}{fmtMoney(endMedian)}</span>
                  <span className="text-emerald-600">p90 {endP90>=0?'+':''}{fmtMoney(endP90)}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">If median stays &gt;0 after 100 trades, edge is durable. p10 negative = still 10% chance of that drawdown even with your edge.</p>
            </>;
          })()}
        </Card>
        <Card>
          <h2 className="font-display font-bold mb-3 text-slate-900 dark:text-white">Key numbers</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {[
              ['Avg win', fmtMoney(s.avgWin), 'text-emerald-600 dark:text-emerald-400'],
              ['Avg loss', fmtMoney(s.avgLoss), 'text-red-600 dark:text-red-400'],
              ['Expectancy', `${s.expectancy >= 0 ? '+' : ''}${fmtMoney(s.expectancy)}`, s.expectancy > 0 ? 'text-emerald-600 dark:text-emerald-400' : s.expectancy < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'],
              ['Avg R', `${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}R`, s.avgR > 0 ? 'text-emerald-600 dark:text-emerald-400' : s.avgR < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'],
              ['Best', fmtMoney(s.bestTrade), 'text-emerald-600 dark:text-emerald-400'],
              ['Worst', fmtMoney(s.worstTrade), 'text-red-600 dark:text-red-400'],
              ['Avg hold', avgHold != null ? fmtDuration(avgHold) : 'add exit times', 'text-slate-900 dark:text-white'],
              ['Total costs', fmtMoney(totalCosts), totalCosts > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'],
              ['Gross profit', fmtMoney(s.grossProfit), 'text-emerald-600 dark:text-emerald-400'],
              ['Gross loss', fmtMoney(s.grossLoss), 'text-red-600 dark:text-red-400'],
              ['Max drawdown', fmtMoney(dd), dd < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'],
            ].map(([k, v, c]) => (
              <div key={k} className="border border-slate-100 dark:border-slate-800 rounded-md p-2"><dt className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">{k}</dt><dd className={`num font-extrabold ${c}`}>{v}</dd></div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}
