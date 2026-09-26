import { useMemo, useState } from 'react';
import { fmtMoney, tradePL, tradeR } from '../lib/calc';
import type { Trade } from '../lib/types';
import { Card, Empty, PageHeader, Tabs } from '../components/ui';

const MEDALS = ['🥇', '🥈', '🥉'];
type Dim = 'strategies' | 'sessions' | 'setups' | 'pairs' | 'months';

function rankBy(trades: Trade[], key: (t: Trade) => string) {
  const m = new Map<string, Trade[]>();
  for (const t of trades.filter(t => t.exit != null)) {
    const k = key(t) || '—';
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(t);
  }
  return [...m.entries()].map(([name, list]) => {
    const r = list.reduce((a, t) => a + (tradeR(t) ?? 0), 0);
    const pl = list.reduce((a, t) => a + (tradePL(t) ?? 0), 0);
    const w = list.filter(t => (tradePL(t) ?? 0) > 0).length;
    return { name, r, pl, n: list.length, wr: list.length ? (w / list.length) * 100 : 0 };
  }).sort((a, b) => b.r - a.r);
}

const monthName = (key: string) => {
  const d = new Date(key + '-02T12:00:00');
  return isNaN(d.getTime()) ? key : d.toLocaleString(undefined, { month: 'long' });
};

const DIMS: { id: Dim; label: string; key: (t: Trade) => string }[] = [
  { id: 'strategies', label: 'Strategies', key: t => t.strategy },
  { id: 'sessions', label: 'Sessions', key: t => t.session },
  { id: 'setups', label: 'Setups', key: t => t.setup },
  { id: 'pairs', label: 'Pairs', key: t => t.pair },
  { id: 'months', label: 'Months', key: t => t.date.slice(0, 7) },
];

export default function Leaderboard({ trades }: { trades: Trade[] }) {
  const [dim, setDim] = useState<Dim>('strategies');
  const dimDef = DIMS.find(d => d.id === dim)!;

  const rows = useMemo(() => rankBy(trades, dimDef.key), [trades, dimDef]);
  const top = Math.max(...rows.map((r: any) => Math.abs(r.r)), 1);
  const isMonth = dim === 'months';
  const labelOf = (n: string) => (isMonth ? monthName(n) : n);

  const total = rows.reduce((a, r) => a + r.pl, 0);
  const best = rows[0];
  const worst = rows[rows.length - 1];

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Know your edge" title="Performance Leaderboard"
        sub="Rank your own factors — what actually makes you money? Sorted by R-multiple, with win rate and P/L per group."
        right={<Tabs value={dim} onChange={setDim} options={DIMS.map(d => ({ id: d.id, label: d.label }))} />} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-emerald-200 dark:border-emerald-900 !bg-emerald-50/40 dark:!bg-emerald-950/30">
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Top {dimDef.label.slice(0, -1)}</p>
          <p className="font-display text-xl font-extrabold mt-1 truncate">{best ? labelOf(best.name) : '—'}</p>
          {best && <p className="text-xs num text-slate-500 mt-0.5">+{best.r.toFixed(1)}R · {fmtMoney(best.pl)}</p>}
        </Card>
        <Card className="border-amber-200 dark:border-amber-900 !bg-amber-50/40 dark:!bg-amber-950/30">
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300">Total {dimDef.label}</p>
          <p className={`font-display text-xl font-extrabold num mt-1 ${total >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtMoney(total)}</p>
          <p className="text-xs text-slate-500 mt-0.5">{rows.length} group{rows.length === 1 ? '' : 's'}</p>
        </Card>
        <Card className="border-red-200 dark:border-red-900 !bg-red-50/40 dark:!bg-red-950/30">
          <p className="text-[11px] font-bold uppercase tracking-widest text-red-700 dark:text-red-300">Weakest {dimDef.label.slice(0, -1)}</p>
          <p className="font-display text-xl font-extrabold mt-1 truncate">{worst && worst.r < 0 ? labelOf(worst.name) : 'None — all green 🔥'}</p>
          {worst && worst.r < 0 && <p className="text-xs num text-slate-500 mt-0.5">{worst.r.toFixed(1)}R · {fmtMoney(worst.pl)}</p>}
        </Card>
      </div>

      {rows.length === 0 ? (
        <Card><Empty icon="🏆" title="Nothing to rank yet" hint="Close a few trades and this leaderboard fills itself in." /></Card>
      ) : (
        <Card>
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={r.name} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${i === 0 ? 'border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/30' : 'border-slate-200/70 dark:border-slate-800'}`}>
                <span className="w-8 text-center text-lg shrink-0">{isMonth && i < 3 ? MEDALS[i] : <span className="num text-sm font-extrabold text-slate-400">{i + 1}</span>}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-extrabold text-sm truncate">{labelOf(r.name)}</p>
                    <p className={`num font-extrabold ${r.r >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{r.r >= 0 ? '+' : ''}{r.r.toFixed(1)}R</p>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 mt-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${r.r >= 0 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-red-500 to-red-400'}`} style={{ width: `${Math.max(3, (Math.abs(r.r) / top) * 100)}%` }} />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 num">{r.n} trades · {r.wr.toFixed(0)}% WR · {r.pl >= 0 ? '+' : ''}{fmtMoney(r.pl)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}