import { useState } from 'react';
import LiveQuote from '../components/LiveQuote';
import { Card, PageHeader } from '../components/ui';
import { useLocal } from '../lib/store';
import { PAIRS } from '../lib/types';

const DEFAULT_WATCH = ['EUR/USD', 'GBP/USD', 'XAU/USD', 'BTC/USD'];

export default function Watchlist() {
  const [list, setList] = useLocal<string[]>('dadafx.watchlist', DEFAULT_WATCH);
  const [picker, setPicker] = useState(false);
  const available = PAIRS.filter(p => !list.includes(p));

  const toggle = (p: string) => {
    if (list.includes(p)) setList(list.filter(x => x !== p));
    else setList([...list, p]);
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Live markets" title="Watchlist"
        sub="Pairs you track, with live prices from TradingView — no API key, updates in real time. Tap a pair below to add or remove it."
        right={<button onClick={() => setPicker(!picker)} className="h-10 px-4 rounded-xl bg-indigo-600 text-white text-[13px] font-extrabold flex items-center gap-1.5 shadow"><span className="text-lg leading-none">+</span>Edit watchlist</button>} />

      {picker && (
        <Card>
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Available pairs</p>
          <div className="flex flex-wrap gap-2">
            {available.length === 0 ? <p className="text-xs text-slate-400">All pairs already on your watchlist.</p> : available.map(p => (
              <button key={p} onClick={() => toggle(p)} className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold hover:border-indigo-400 hover:text-indigo-600 transition">+ {p}</button>
            ))}
          </div>
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mt-4 mb-2">On watchlist</p>
          <div className="flex flex-wrap gap-2">
            {list.map(p => (
              <button key={p} onClick={() => toggle(p)} className="h-9 px-3 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:line-through">✓ {p}</button>
            ))}
          </div>
        </Card>
      )}

      {list.length === 0 ? (
        <Card><p className="text-xs text-slate-400 text-center py-8">Open “Edit watchlist” and add your first pair to see live prices.</p></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map(p => <LiveQuote key={p} pair={p} onRemove={() => toggle(p)} />)}
        </div>
      )}

      <Card>
        <p className="text-[11px] text-slate-400">Quotes load from s3.tradingview.com — needs internet. Your watchlist is saved in this browser and backs up with the rest of your journal.</p>
      </Card>
    </div>
  );
}