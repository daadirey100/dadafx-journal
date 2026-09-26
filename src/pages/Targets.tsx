import { useMemo } from 'react';
import { calcStats, fmtMoney, tradePL } from '../lib/calc';
import { useLocal } from '../lib/store';
import type { Trade } from '../lib/types';
import { Card, Confetti, Field, KpiCard, PageHeader, inputCls } from '../components/ui';

interface Targets { daily: number; weekly: number; monthly: number }

function weekStart() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function TargetRow({ label, made, target, color }: { label: string; made: number; target: number; color: string }) {
  const pct = target > 0 ? (made / target) * 100 : 0;
  const hit = pct >= 100 && made > 0;
  return (
    <div className="rounded-xl border border-slate-200/70 dark:border-slate-800 p-4">
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">{label} {hit && '✓'}</p>
        <p className={`num font-display text-xl font-extrabold ${made >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtMoney(made)}</p>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
      </div>
      <p className="text-[11px] text-slate-400 num mt-1.5">{pct.toFixed(0)}% of {fmtMoney(target)}{hit && ' — target hit 🎯'}</p>
    </div>
  );
}

export default function Targets({ trades }: { trades: Trade[] }) {
  const [tg, setTg] = useLocal<Targets>('dadafx.targets', { daily: 500, weekly: 2500, monthly: 10000 });

  const today = new Date().toISOString().slice(0, 10);
  const ws = weekStart();
  const month = today.slice(0, 7);

  const { madeToday, madeWeek, madeMonth, todayTrades, todayStats } = useMemo(() => {
    const todayList = trades.filter(t => t.exit != null && t.date.slice(0, 10) === today);
    const weekList = trades.filter(t => t.exit != null && t.date.slice(0, 10) >= ws);
    const monthList = trades.filter(t => t.exit != null && t.date.startsWith(month));
    return {
      madeToday: todayList.reduce((a, t) => a + (tradePL(t) ?? 0), 0),
      madeWeek: weekList.reduce((a, t) => a + (tradePL(t) ?? 0), 0),
      madeMonth: monthList.reduce((a, t) => a + (tradePL(t) ?? 0), 0),
      todayTrades: todayList.length,
      todayStats: calcStats(todayList),
    };
  }, [trades, today, ws, month]);

  const goals = [
    { key: 'daily', label: 'Daily target', made: madeToday, target: tg.daily, color: 'bg-gradient-to-r from-emerald-500 to-emerald-400' },
    { key: 'weekly', label: 'Weekly target', made: madeWeek, target: tg.weekly, color: 'bg-gradient-to-r from-indigo-500 to-violet-500' },
    { key: 'monthly', label: 'Monthly target', made: madeMonth, target: tg.monthly, color: 'bg-gradient-to-r from-amber-500 to-orange-400' },
  ] as const;

  const doneToday = tg.daily > 0 && madeToday >= tg.daily;

  return (
    <div className="space-y-4">
      {doneToday && <Confetti count={90} />}
      <PageHeader eyebrow="Daily discipline" title="P&L Targets"
        sub={`Today is a ${todayTrades > 0 ? `${todayStats.winRate.toFixed(0)}% win-rate day across ${todayTrades} closed trade(s)` : 'fresh day — go earn your first green'} · ${fmtMoney(madeToday)} so far.`} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {goals.map(g => (
          <Card key={g.key}>
            <TargetRow label={g.label} made={g.made} target={g.target} color={g.color} />
            <Field label={`${g.label} ($)`}><input type="number" className={`${inputCls} num mt-2`} value={g.target} onChange={e => setTg({ ...tg, [g.key]: Number(e.target.value) })} /></Field>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard label="Today" value={fmtMoney(madeToday)} icon="sun" valueTone={madeToday >= 0 ? 'up' : 'down'} tint="bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300" />
        <KpiCard label="This week" value={fmtMoney(madeWeek)} icon="calendar" valueTone={madeWeek >= 0 ? 'up' : 'down'} tint="bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300" />
        <KpiCard label="This month" value={fmtMoney(madeMonth)} icon="bars" valueTone={madeMonth >= 0 ? 'up' : 'down'} tint="bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300" />
        <KpiCard label="Closed trades today" value={String(todayTrades)} icon="briefcase" tint="bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300" />
      </div>

      <Card>
        <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white mb-2">Why targets work</h2>
        <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
          Small daily targets keep you consistent; big monthly targets keep you ambitious. The moment you hit a daily target, the app rewards you with confetti so you can stop there — locking in the green is the whole game. Targets are saved with your data, sync to the cloud, and travel to your Android app automatically.
        </p>
      </Card>
    </div>
  );
}