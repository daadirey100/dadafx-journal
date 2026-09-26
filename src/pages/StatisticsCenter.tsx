import { useMemo, useState } from 'react';
import { backtestStats, calcStats, fmtMoney, tradePL, tradeR } from '../lib/calc';
import { toast, useLocal } from '../lib/store';
import { DEFAULT_PLAN, type BacktestTrade, type Trade, type TradingPlan } from '../lib/types';
import { Card, PageHeader, StatCard, Tabs } from '../components/ui';

const COACH: [RegExp, string, string][] = [
  [/early entry|entered early|jumped/i, 'Wait for the confirmation candle close.', 'No entry before M15 confirmation close'],
  [/fomo|chased|chase/i, 'If you feel urgency, it is FOMO — walk away for 15 minutes.', 'No trades within 15 min of a missed move'],
  [/no stop|moved sl|widen.*stop|removed sl|no sl/i, 'The stop is the business plan. Never move it away.', 'Stops set at entry, never widened'],
  [/revenge|angry|tilt/i, 'After 2 losses, screens off for the day. Revenge is a donation.', 'Max 2 losses per day, then done'],
  [/overtrad|too many|over-trad/i, 'Cap trades per day in your plan and honor it.', 'Max N trades per day — quality only'],
  [/news|red news|high impact/i, 'No new entries 15 min before/after red news.', 'Flat into high-impact news'],
  [/late entry|entered late/i, 'Missed it = skipped it. There is always another setup.', 'Enter in the first 30% of the move or skip'],
  [/no confirm|without confirm/i, 'No confirmation, no trade. Screenshot the missing piece.', 'Every entry needs listed confirmation'],
  [/lot|leverag|too big|oversiz/i, 'Risk is set in % first — lots are just math.', 'Position size from calculator only'],
  [/held|didn't cut|wouldn't cut|hope/i, 'Cut at the plan stop, not at hope. Small losses are rent.', 'Exit at planned stop, no hoping'],
  [/early exit|cut winner|early tp|took.*early/i, 'Partial at 1R, runner to target. Let math pay you.', 'Partial 1R + runner, no full early exits'],
];

function coachFor(mistake: string): [string, string] {
  for (const [re, fix, rule] of COACH) if (re.test(mistake)) return [fix, rule];
  return ['Name it precisely next time — vague mistakes repeat.', `Review every "${mistake}" trade weekly`];
}

const MEDALS = ['🥇', '🥈', '🥉'];

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

function Leaderboard({ trades }: { trades: Trade[] }) {
  const [tab, setTab] = useState<'months' | 'pairs' | 'strategies' | 'sessions'>('months');
  const monthName = (key: string) => {
    const d = new Date(key + '-02T12:00:00');
    return isNaN(d.getTime()) ? key : d.toLocaleString(undefined, { month: 'long' });
  };
  const rows = useMemo(() => {
    if (tab === 'months') return rankBy(trades, t => t.date.slice(0, 7));
    if (tab === 'pairs') return rankBy(trades, t => t.pair);
    if (tab === 'strategies') return rankBy(trades, t => t.strategy);
    return rankBy(trades, t => t.session);
  }, [trades, tab]);
  const top = Math.max(...rows.map(r => Math.abs(r.r)), 1);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div>
          <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white">Personal leaderboard</h2>
          <p className="text-xs text-slate-500">Not against other traders — against your own history. Ranked by R-multiple.</p>
        </div>
        <Tabs value={tab} onChange={setTab} options={[
          { id: 'months', label: 'Months' }, { id: 'pairs', label: 'Pairs' },
          { id: 'strategies', label: 'Strategies' }, { id: 'sessions', label: 'Sessions' },
        ]} />
      </div>
      {rows.length === 0 ? <p className="text-xs text-slate-400 py-4">Close some trades and your leaderboard fills up.</p> : (
        <div className="space-y-1.5 mt-2">
          {rows.slice(0, 8).map((r, i) => (
            <div key={r.name} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${i === 0 ? 'border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/30' : 'border-slate-200/70 dark:border-slate-800'}`}>
              <span className="w-8 text-center text-lg shrink-0">{tab === 'months' && i < 3 ? MEDALS[i] : <span className="num text-sm font-extrabold text-slate-400">{i + 1}</span>}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-extrabold text-sm truncate">{tab === 'months' ? monthName(r.name) : r.name}</p>
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
      )}
    </Card>
  );
}

function MistakeCoach({ mistakes }: { mistakes: [string, { n: number; pl: number }][] }) {
  const [plan, setPlan] = useLocal<TradingPlan>('dadafx.plan', DEFAULT_PLAN);
  const addRule = (rule: string) => {
    if (plan.rules.includes(rule)) { toast.info('Already in your plan.'); return; }
    setPlan({ ...plan, rules: [...plan.rules, rule] });
    toast.ok('Rule added to your Trading Plan. ✅');
  };
  return (
    <Card>
      <h2 className="font-display font-bold text-slate-900 dark:text-white">Mistake coach</h2>
      <p className="text-xs text-slate-500 mb-2">Your costliest patterns, diagnosed — one tap sends the fix to your plan.</p>
      {mistakes.length === 0 ? <p className="text-xs text-slate-400">Log trades with a "mistakes" tag to meet your coach.</p> :
        <div className="space-y-2.5">
          {mistakes.slice(0, 5).map(([k, v]) => {
            const [fix, rule] = coachFor(k);
            return (
              <div key={k} className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/30 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex-1 font-extrabold truncate">“{k}” <span className="text-xs font-normal text-slate-400">×{v.n}</span></span>
                  <span className={`num font-extrabold ${v.pl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtMoney(v.pl)}</span>
                </div>
                <p className="text-xs mt-1"><b className="text-indigo-600 dark:text-indigo-300">Fix:</b> <span className="text-slate-600 dark:text-slate-300">{fix}</span></p>
                <button onClick={() => addRule(rule)} className="mt-1.5 text-[11px] font-extrabold text-indigo-600 dark:text-indigo-300 hover:underline">＋ Add rule to my plan: “{rule}”</button>
              </div>
            );
          })}
        </div>}
    </Card>
  );
}

function Records({ trades }: { trades: Trade[] }) {
  const rec = useMemo(() => {
    const closed = trades.filter(t => t.exit != null);
    if (!closed.length) return null;
    const byDay = new Map<string, number>();
    const byWeek = new Map<string, number>();
    for (const t of closed) {
      const d = t.date.slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + (tradePL(t) ?? 0));
      const dt = new Date(d + 'T12:00:00');
      dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
      const wk = dt.toISOString().slice(0, 10);
      byWeek.set(wk, (byWeek.get(wk) ?? 0) + (tradePL(t) ?? 0));
    }
    const bestDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
    const bestWeek = [...byWeek.entries()].sort((a, b) => b[1] - a[1])[0];
    const sorted = [...closed].sort((a, b) => a.date.localeCompare(b.date));
    let run = 0, bestStreak = 0, curStreak = 0;
    for (const t of sorted) {
      const w = (tradePL(t) ?? 0) > 0;
      if (w) { run++; bestStreak = Math.max(bestStreak, run); } else run = 0;
    }
    for (let i = sorted.length - 1; i >= 0; i--) {
      if ((tradePL(sorted[i]) ?? 0) > 0) curStreak++;
      else break;
    }
    const bestTrade = sorted.reduce((a, b) => ((tradePL(a) ?? 0) > (tradePL(b) ?? 0) ? a : b));
    return { bestDay, bestWeek, bestStreak, curStreak, bestTrade, n: closed.length };
  }, [trades]);
  if (!rec) return null;
  const items: [string, string, string][] = [
    ['🏆 Best day', `${rec.bestDay[0]}`, `+${fmtMoney(rec.bestDay[1])}`],
    ['📅 Best week', `w/c ${rec.bestWeek[0]}`, `+${fmtMoney(rec.bestWeek[1])}`],
    ['🔥 Longest win streak', `${rec.bestStreak} in a row`, rec.curStreak > 0 ? `active: ${rec.curStreak} live` : 'no active streak'],
    ['⭐ Best single trade', `${rec.bestTrade.pair} ${rec.bestTrade.direction}`, `+${fmtMoney(tradePL(rec.bestTrade) ?? 0)}`],
  ];
  return (
    <Card>
      <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white mb-2">Your records wall</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
        {items.map(([t, a, b]) => (
          <div key={t} className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-gradient-to-br from-amber-50/80 to-orange-50/60 dark:from-amber-950/40 dark:to-orange-950/20 px-3.5 py-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">{t}</p>
            <p className="font-display font-extrabold text-slate-900 dark:text-white mt-0.5 truncate">{a}</p>
            <p className="num font-extrabold text-emerald-600 text-sm">{b}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function StatisticsCenter({ trades, backtests }: { trades: Trade[]; backtests: BacktestTrade[] }) {
  const s = calcStats(trades);
  const b = backtestStats(backtests);
  const mistakes = useMemo(() => {
    const m = new Map<string, { n: number; pl: number }>();
    for (const t of trades.filter(t => t.exit != null)) {
      const k = (t.mistakes || 'No mistake noted').split(',')[0].trim() || 'No mistake noted';
      const e = m.get(k) ?? { n: 0, pl: 0 };
      e.n++; e.pl += tradePL(t) ?? 0;
      m.set(k, e);
    }
    return [...m.entries()].sort((a, z) => a[1].pl - z[1].pl).slice(0, 8);
  }, [trades]);
  const emotions = useMemo(() => {
    const m = new Map<string, { n: number; pl: number }>();
    for (const t of trades.filter(t => t.exit != null)) {
      const k = (t.emotions || '—').split(',')[0].trim() || '—';
      const e = m.get(k) ?? { n: 0, pl: 0 };
      e.n++; e.pl += tradePL(t) ?? 0;
      m.set(k, e);
    }
    return [...m.entries()].sort((a, z) => z[1].pl - a[1].pl);
  }, [trades]);

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Edge audit" title="Statistics Center" sub="Live vs backtest · the mistakes & emotions costing you money." />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Live win rate" value={`${s.winRate.toFixed(1)}%`} sub={`${s.wins}W / ${s.losses}L`} tone={s.total ? (s.winRate >= 50 ? 'up' : 'down') : 'neutral'} icon="target" />
        <StatCard label="Live profit factor" value={s.profitFactor >= 99 ? '∞' : s.profitFactor.toFixed(2)} sub={`Net ${fmtMoney(s.totalPL)}`} tone={s.totalPL >= 0 ? 'up' : 'down'} icon="scale" />
        <StatCard label="Backtest win rate" value={`${b.winRate.toFixed(1)}%`} sub={`${b.total} samples`} tone={b.total ? (b.winRate >= 50 ? 'up' : 'down') : 'neutral'} icon="flask" />
        <StatCard label="Backtest expectancy" value={`${b.avgR >= 0 ? '+' : ''}${b.avgR.toFixed(2)}R`} sub={`Total ${b.totalR.toFixed(1)}R`} tone={b.avgR >= 0 ? 'up' : 'down'} icon="bars" />
      </div>
      <Leaderboard trades={trades} />
      <Records trades={trades} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <MistakeCoach mistakes={mistakes} />
        <Card>
          <h2 className="font-display font-bold mb-2 text-slate-900 dark:text-white">Performance by emotion</h2>
          {emotions.length === 0 ? <p className="text-xs text-slate-400">Log trades with an "emotions" tag to see this.</p> :
            <div className="space-y-2">{emotions.map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{k} <span className="text-xs text-slate-400">({v.n})</span></span>
                <span className={`num font-bold ${v.pl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtMoney(v.pl)}</span>
              </div>))}</div>}
        </Card>
      </div>
      <Card>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display font-bold text-slate-900 dark:text-white">Plan compliance — does discipline pay?</h2>
        </div>
        {(() => {
          const scored = trades.filter(t => t.exit != null && t.planScore != null);
          const fol = scored.filter(t => t.planScore! >= 80);
          const vio = scored.filter(t => t.planScore! < 80);
          const un = trades.filter(t => t.exit != null && t.planScore == null);
          const pl = (l: Trade[]) => l.reduce((a, t) => a + (tradePL(t) ?? 0), 0);
          if (!scored.length) return <p className="text-xs text-slate-400">Log new trades — each ticket now stores a plan score, and the verdict appears here.</p>;
          const rows: [string, Trade[], string][] = [
            ['✅ Followed plan (≥80)', fol, 'text-emerald-600'],
            ['⚠️ Broke rules (<80)', vio, 'text-red-600'],
            ['❔ Unchecked (old trades)', un, 'text-slate-500'],
          ];
          return (
            <div className="space-y-2">
              {rows.map(([l, list, c]) => (
                <div key={l} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 font-semibold">{l} <span className="text-xs text-slate-400">({list.length})</span></span>
                  <span className={`num font-extrabold ${c}`}>{pl(list) >= 0 ? '+' : ''}{fmtMoney(pl(list))}</span>
                </div>
              ))}
              {fol.length > 0 && vio.length > 0 && (
                <p className="text-xs font-bold pt-1 text-slate-600 dark:text-slate-300">
                  {pl(fol) >= pl(vio) ? '✅ Following your plan earns more. Keep it.' : '⚠️ Rule-breakers are winning — your plan may need updating, not your discipline.'}
                </p>
              )}
            </div>
          );
        })()}
      </Card>
      <Card>
        <h2 className="font-display font-bold mb-2 text-slate-900 dark:text-white">How to read this</h2>
        <ul className="text-sm text-slate-600 dark:text-slate-300 list-disc pl-5 space-y-1">
          <li>Profit factor above 1.5 with 100+ live trades = a healthy edge.</li>
          <li>If backtest expectancy is positive but live is negative — the problem is execution, not strategy.</li>
          <li>Fix your single costliest mistake first. That is usually worth more than a new strategy.</li>
        </ul>
      </Card>
    </div>
  );
}
