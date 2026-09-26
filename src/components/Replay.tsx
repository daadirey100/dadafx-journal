import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtMoney, tradePL, tradeRisk } from '../lib/calc';
import type { Trade } from '../lib/types';
import { Modal } from './ui';

// Visual step-through of a trade: setup → entry → heat → exit.
export default function Replay({ trade, onClose }: { trade: Trade; onClose: () => void }) {
  const [t, setT] = useState(0); // 0..1 progress
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const risk = tradeRisk(trade);
  const finalPL = tradePL(trade) ?? 0;

  const prices = useMemo(() => {
    const e = trade.entry;
    const sl = trade.stopLoss;
    const tp = trade.takeProfit;
    const ex = trade.exit ?? trade.entry;
    const adv = e + (sl - e) * 0.45; // heat: 45% toward SL
    const lo = Math.min(e, sl, tp, ex, adv);
    const hi = Math.max(e, sl, tp, ex, adv);
    const pad = (hi - lo) * 0.12 || 1;
    return { e, sl, tp, ex, adv, lo: lo - pad, hi: hi + pad };
  }, [trade]);

  const w = 640, h = 240, padL = 8, padR = 70, padT = 14, padB = 14;
  const Y = (v: number) => padT + (1 - (v - prices.lo) / (prices.hi - prices.lo || 1)) * (h - padT - padB);
  const X = (f: number) => padL + f * (w - padL - padR);
  const priceAt = (f: number) => (f <= 0.5 ? prices.e + (prices.adv - prices.e) * (f / 0.5) : prices.adv + (prices.ex - prices.adv) * ((f - 0.5) / 0.5));
  const plAt = (f: number) => (f <= 0.5 ? -risk * 0.45 * (f / 0.5) / (risk || 1) * risk : -risk * 0.45 + (f - 0.5) * 2 * (finalPL + risk * 0.45));

  const N = 60;
  const pts = Array.from({ length: N + 1 }, (_, i) => {
    const f = (i / N) * t;
    return [X(f), Y(priceAt(f))] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const cur = priceAt(t);
  const curPL = plAt(t);

  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; setPlaying(false); };
  const play = () => {
    if (t >= 1) setT(0);
    stop();
    setPlaying(true);
    timer.current = window.setInterval(() => {
      setT(prev => {
        if (prev >= 1) { stop(); return 1; }
        return Math.min(1, prev + 0.02);
      });
    }, 40);
  };

  const stage = t < 0.12 ? 'Setup forming' : t < 0.3 ? `Entered ${trade.direction} @ ${trade.entry}` : t < 0.62 ? 'Holding through heat' : t < 1 ? 'Into the exit' : trade.exit == null ? 'Still open' : `Exited @ ${trade.exit}`;

  return (
    <Modal open onClose={onClose} title={`${trade.pair} · ${trade.direction} replay`} eyebrow="Trade replay" wide>
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{stage}</p>
        <p className={`num font-extrabold ${curPL > 0 ? 'text-emerald-600' : curPL < 0 ? 'text-red-600' : 'text-slate-400'}`}>
          {t >= 1 ? (finalPL >= 0 ? '+' : '') + fmtMoney(finalPL) : `${curPL >= 0 ? '+' : ''}${fmtMoney(curPL)} (live)`}
        </p>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40" role="img" aria-label="Trade replay chart">
        <line x1={padL} x2={w - padR} y1={Y(prices.sl)} y2={Y(prices.sl)} stroke="#dc2626" strokeDasharray="6 4" strokeWidth={1.4} />
        <line x1={padL} x2={w - padR} y1={Y(prices.tp)} y2={Y(prices.tp)} stroke="#059669" strokeDasharray="6 4" strokeWidth={1.4} />
        <text x={w - padR + 6} y={Y(prices.sl) + 4} fontSize={11} fill="#dc2626" fontWeight={700}>SL</text>
        <text x={w - padR + 6} y={Y(prices.tp) + 4} fontSize={11} fill="#059669" fontWeight={700}>TP</text>
        {t > 0 && <path d={line} fill="none" stroke={finalPL >= 0 ? '#059669' : '#dc2626'} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />}
        <circle cx={X(0)} cy={Y(prices.e)} r={5} fill="#4f46e5" stroke="#fff" strokeWidth={2} />
        <text x={X(0) + 8} y={Y(prices.e) - 8} fontSize={11} fill="#4f46e5" fontWeight={700}>Entry</text>
        {t > 0 && <circle cx={X(t)} cy={Y(cur)} r={6} fill={curPL >= 0 ? '#059669' : '#dc2626'} stroke="#fff" strokeWidth={2.5} />}
        {t >= 1 && trade.exit != null && (
          <g><circle cx={X(1)} cy={Y(prices.ex)} r={6} fill={finalPL >= 0 ? '#059669' : '#dc2626'} stroke="#fff" strokeWidth={2.5} />
          <text x={X(1) - 34} y={Y(prices.ex) - 10} fontSize={11} fill={finalPL >= 0 ? '#059669' : '#dc2626'} fontWeight={700}>Exit</text></g>
        )}
      </svg>
      <div className="flex items-center gap-3 mt-3">
        <button onClick={() => (playing ? stop() : play())} className="h-10 w-10 rounded-full bg-indigo-600 text-white font-extrabold shrink-0" aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <input type="range" min={0} max={1000} value={Math.round(t * 1000)} onChange={e => { setPlaying(false); setT(Number(e.target.value) / 1000); }} className="flex-1" aria-label="Replay position" />
        <span className="num text-xs font-bold text-slate-500 w-10 text-right">{Math.round(t * 100)}%</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-center text-xs">
        {[['Entry', String(trade.entry)], ['Stop', String(trade.stopLoss)], ['Target', String(trade.takeProfit)], ['Exit', trade.exit == null ? 'open' : String(trade.exit)]].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5"><p className="text-[10px] font-bold uppercase text-slate-400">{k}</p><p className="num font-extrabold">{v}</p></div>
        ))}
      </div>
    </Modal>
  );
}
