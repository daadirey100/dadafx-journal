import { useMemo, useState } from 'react';
import type { DailyEntry, Trade } from '../lib/types';
import { Card, Empty, Glyph, Modal, PageHeader, Tabs, inputCls } from '../components/ui';
import { fmtMoney, tradePL } from '../lib/calc';

interface Shot { src: string; cap: string; kind: 'Before' | 'After' | 'Daily'; date: string; pair?: string; pl?: number | null }

export default function Gallery({ trades, entries }: { trades: Trade[]; entries: DailyEntry[] }) {
  const [tab, setTab] = useState<'all' | 'Before' | 'After' | 'Daily'>('all');
  const [view, setView] = useState<Shot | null>(null);
  const [pair, setPair] = useState('All');

  const shots = useMemo(() => {
    const out: Shot[] = [];
    for (const t of trades) {
      if (t.beforeShot) out.push({ src: t.beforeShot, cap: `${t.pair} ${t.direction} · ${t.date.slice(0, 10)}`, kind: 'Before', date: t.date, pair: t.pair, pl: tradePL(t) });
      const after = t.afterShot || t.screenshot;
      if (after) out.push({ src: after, cap: `${t.pair} ${t.direction} · ${t.date.slice(0, 10)}`, kind: 'After', date: t.date, pair: t.pair, pl: tradePL(t) });
    }
    for (const e of entries) {
      if (e.screenshot) out.push({ src: e.screenshot, cap: `Daily · ${e.date} · ${e.mood}`, kind: 'Daily', date: e.date });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [trades, entries]);

  const pairs = useMemo(() => ['All', ...new Set(trades.map(t => t.pair))], [trades]);

  const list = shots.filter(s => (tab === 'all' || s.kind === tab) && (pair === 'All' || s.pair === pair));
  const counts = {
    all: shots.filter(s => pair === 'All' || s.pair === pair).length,
    Before: shots.filter(s => s.kind === 'Before' && (pair === 'All' || s.pair === pair)).length,
    After: shots.filter(s => s.kind === 'After' && (pair === 'All' || s.pair === pair)).length,
    Daily: shots.filter(s => s.kind === 'Daily').length,
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Visual evidence" title="Screenshot Gallery" sub="Every before, after and daily chart in one wall. Click to inspect."
        right={<Tabs value={tab} onChange={setTab} options={[
          { id: 'all', label: 'All', count: counts.all },
          { id: 'Before', label: 'Before', count: counts.Before },
          { id: 'After', label: 'After', count: counts.After },
          { id: 'Daily', label: 'Daily', count: counts.Daily },
        ]} />} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><Glyph name="search" className="w-3.5 h-3.5" />Filter:</span>
        <select value={pair} onChange={e => setPair(e.target.value)} className={`${inputCls.replace('w-full', 'w-auto')} !h-9 !text-xs`}>
          {pairs.map(p => <option key={p}>{p}</option>)}
        </select>
        <span className="text-[11px] text-slate-400">{list.length} shot{list.length === 1 ? '' : 's'}</span>
      </div>

      {list.length === 0 ? (
        <Card><Empty icon="🖼️" title="No screenshots yet" hint="Attach before/after shots in any trade ticket, or add one to a daily entry." /></Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {list.map((s, i) => (
            <button key={i} onClick={() => setView(s)} className="group relative rounded-2xl overflow-hidden border border-white/60 dark:border-white/10 glass !p-0 text-left card-lift">
              <img src={s.src} alt={s.cap} className="w-full h-40 object-cover" loading="lazy" />
              <span className={`absolute top-2 left-2 h-6 px-2 rounded-md text-[10px] font-extrabold flex items-center ${s.kind === 'Before' ? 'bg-indigo-600 text-white' : s.kind === 'After' ? 'bg-emerald-600 text-white' : 'bg-slate-900/80 text-white'}`}>{s.kind.toUpperCase()}</span>
              {s.pl != null && (
                <span className={`absolute top-2 right-2 h-6 px-2 rounded-md text-[10px] font-extrabold num flex items-center ${s.pl >= 0 ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                  {s.pl >= 0 ? '+' : ''}{fmtMoney(s.pl)}
                </span>
              )}
              <span className="block px-2.5 py-1.5 text-[11px] font-bold truncate">{s.cap}</span>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!view} onClose={() => setView(null)} title={view?.cap ?? ''} eyebrow={view?.kind} wide>
        {view && <img src={view.src} alt={view.cap} className="w-full rounded-xl border" />}
      </Modal>
    </div>
  );
}