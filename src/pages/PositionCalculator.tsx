import { useMemo, useState } from 'react';
import { calcStats, fmtMoney, positionSize } from '../lib/calc';
import { PAIRS, type Trade } from '../lib/types';
import { Card, Field, PageHeader, inputCls } from '../components/ui';

function ruinPct(winRate: number, payoff: number, riskPct: number, ruinAtPct: number): number {
  const p = winRate / 100;
  const q = 1 - p;
  const e = p * payoff - q; // expectancy per 1R risked
  if (e <= 0 || riskPct <= 0 || ruinAtPct <= 0) return 100;
  const units = ruinAtPct / riskPct;
  return Math.pow((1 - e) / (1 + e), units) * 100;
}

export default function PositionCalculator({ trades }: { trades: Trade[] }) {
  const [balance, setBalance] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [pair, setPair] = useState('EUR/USD');
  const [entry, setEntry] = useState(1.085);
  const [sl, setSl] = useState(1.083);
  const [rr, setRr] = useState(2);

  const live = calcStats(trades);
  const [rWin, setRWin] = useState<number | null>(null);
  const [rPay, setRPay] = useState<number | null>(null);
  const [rRisk, setRRisk] = useState(1);
  const [rRuin, setRRuin] = useState(50);
  const winRate = rWin ?? (live.total ? live.winRate : 50);
  const payoff = rPay ?? (live.avgLoss > 0 ? live.avgWin / live.avgLoss : 2);
  const ruin = ruinPct(winRate, payoff, rRisk, rRuin);

  const lots = useMemo(() => positionSize(balance, riskPct, entry, sl, pair), [balance, riskPct, entry, sl, pair]);
  const riskMoney = balance * (riskPct / 100);
  const dist = Math.abs(entry - sl);
  const tp = entry + (entry >= sl ? dist * rr : -dist * rr);

  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader eyebrow="Risk desk" title="Position Calculator" sub="Size every position from risk — never guess lots again." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account balance ($)"><input type="number" className={`${inputCls} num`} value={balance} onChange={e => setBalance(Number(e.target.value))} /></Field>
            <Field label="Risk %"><input type="number" step="0.1" className={`${inputCls} num`} value={riskPct} onChange={e => setRiskPct(Number(e.target.value))} /></Field>
            <div className="col-span-2"><Field label="Pair"><select className={inputCls} value={pair} onChange={e => setPair(e.target.value)}>{PAIRS.map(p => <option key={p}>{p}</option>)}</select></Field></div>
            <Field label="Entry"><input type="number" step="0.00001" className={`${inputCls} num`} value={entry} onChange={e => setEntry(Number(e.target.value))} /></Field>
            <Field label="Stop loss"><input type="number" step="0.00001" className={`${inputCls} num`} value={sl} onChange={e => setSl(Number(e.target.value))} /></Field>
            <div className="col-span-2"><Field label="Target R:R"><input type="range" min={0.5} max={5} step={0.5} value={rr} onChange={e => setRr(Number(e.target.value))} className="w-full accent-indigo-600" /><span className="text-xs num font-bold">1 : {rr}</span></Field></div>
          </div>
        </Card>
        <Card className="relative overflow-hidden">
          <span className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" />
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Recommended size</p>
          <p className="font-display text-6xl font-extrabold num tracking-tight mt-1 bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-300 dark:to-violet-300 bg-clip-text text-transparent">{lots.toFixed(2)}</p>
          <p className="text-sm font-bold text-slate-500 mt-1">lots · <span className="num">{pair}</span></p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between items-center rounded-xl border border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/40 px-3 py-2"><dt className="font-semibold text-red-700 dark:text-red-300">Risk amount</dt><dd className="num font-extrabold text-red-600 dark:text-red-300">−{fmtMoney(riskMoney).slice(0)}</dd></div>
            <div className="flex justify-between items-center rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2"><dt className="font-semibold text-slate-500">Stop distance</dt><dd className="num font-bold text-slate-800 dark:text-slate-100">{dist.toFixed(5)}</dd></div>
            <div className="flex justify-between items-center rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/40 px-3 py-2"><dt className="font-semibold text-indigo-700 dark:text-indigo-300">Suggested TP (1:{rr})</dt><dd className="num font-bold text-indigo-700 dark:text-indigo-200">{tp.toFixed(5)}</dd></div>
            <div className="flex justify-between items-center rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/40 px-3 py-2"><dt className="font-semibold text-emerald-700 dark:text-emerald-300">Potential reward</dt><dd className="num font-extrabold text-emerald-600 dark:text-emerald-300">+{fmtMoney(riskMoney * rr).slice(0)}</dd></div>
          </dl>
          <p className="text-[11px] mt-3 text-slate-400">Estimate using standard contract math. Always double-check with your broker's calculator before going live.</p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white">Risk of ruin</h2>
            <p className="text-xs text-slate-500">Odds of hitting −{rRuin}% if you keep trading exactly like this. Prefilled from your journal — override anytime.</p>
          </div>
          <span className={`font-display font-extrabold text-4xl num ${ruin < 1 ? 'text-emerald-500' : ruin < 10 ? 'text-amber-500' : 'text-red-500'}`}>{ruin < 0.05 ? '<0.05' : ruin.toFixed(ruin < 1 ? 2 : 1)}%</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <Field label="Win rate %"><input type="number" className={`${inputCls} num`} value={Math.round(winRate * 10) / 10} onChange={e => setRWin(Number(e.target.value))} /></Field>
          <Field label="Payoff (avg win ÷ avg loss)"><input type="number" step="0.1" className={`${inputCls} num`} value={Math.round(payoff * 100) / 100} onChange={e => setRPay(Number(e.target.value))} /></Field>
          <Field label="Risk / trade %"><input type="number" step="0.1" className={`${inputCls} num`} value={rRisk} onChange={e => setRRisk(Number(e.target.value))} /></Field>
          <Field label="Ruin = drawdown %"><input type="number" className={`${inputCls} num`} value={rRuin} onChange={e => setRRuin(Number(e.target.value))} /></Field>
        </div>
        <p className="text-xs font-bold mt-2 text-slate-500">{ruin < 1 ? 'Institutional-grade survival odds. Do not touch your risk.' : ruin < 10 ? 'Acceptable — cut risk in half to crush it further.' : 'Dangerous — halve your risk per trade or improve payoff before sizing up.'}</p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white">Kelly & Expectancy lab</h2>
            <p className="text-xs text-slate-500">Optimal f* from your edge — trade at ½ Kelly for sanity. Prefilled from journal.</p>
          </div>
          {(() => {
            const p = winRate/100; const b = payoff;
            const kelly = b>0 ? (p - (1-p)/b)*100 : 0;
            const tone = kelly<0 ? 'text-red-500' : kelly<2 ? 'text-amber-500' : 'text-emerald-500';
            return <span className={`font-display font-extrabold text-4xl num ${tone}`}>{kelly.toFixed(1)}%</span>;
          })()}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
          {(() => {
            const p = winRate/100; const b = payoff; const kelly = b>0 ? (p - (1-p)/b)*100 : 0;
            const exp = p * (live.avgWin || 0) - (1-p)*(live.avgLoss || 0);
            return <>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Kelly f*</p><p className={`font-extrabold num text-lg ${kelly<0?'text-red-600':kelly<2?'text-amber-600':'text-emerald-600'}`}>{kelly.toFixed(2)}% per trade</p><p className="text-[11px] text-slate-500">½ Kelly = {(kelly/2).toFixed(2)}%</p></div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Expectancy</p><p className={`font-extrabold num text-lg ${exp>=0?'text-emerald-600':'text-red-600'}`}>{exp>=0?'+':''}{fmtMoney(exp)}</p><p className="text-[11px] text-slate-500">per trade</p></div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Payoff × Win</p><p className="font-extrabold num text-lg">{payoff.toFixed(2)}R × {winRate.toFixed(1)}%</p><p className="text-[11px] text-slate-500">{kelly<0?'Negative edge — fix strategy':'Edge OK'}</p></div>
            </>;
          })()}
        </div>
        <p className="text-[11px] text-slate-400 mt-2">Half-Kelly is institutional standard — full Kelly is too volatile for funded accounts.</p>
      </Card>
    </div>
  );
}
