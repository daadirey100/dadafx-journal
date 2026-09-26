import { useMemo } from 'react';
import { fmtMoney } from '../lib/calc';
import { mistakeStats } from '../lib/mistakes';
import { toast, useLocal } from '../lib/store';
import type { Trade } from '../lib/types';
import { Card, Empty, Glyph, KpiCard, PageHeader } from '../components/ui';

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

export default function Mistakes({ trades }: { trades: Trade[] }) {
  const stats = useMemo(() => mistakeStats(trades), [trades]);
  const [warnOn, setWarnOn] = useLocal<boolean>('dadafx.mistakeWarn', true);
  const costly = stats.filter(s => s.pl < 0);
  const totalCost = costly.reduce((a, s) => a + s.pl, 0);
  const topCount = stats.filter(s => s.pl < 0 && s.n >= 2).length;

  const coachFor = (mistake: string): [string, string] => {
    for (const [re, fix, rule] of COACH) if (re.test(mistake)) return [fix, rule];
    return ['Name it precisely next time — vague mistakes repeat.', `Review every "${mistake}" trade weekly`];
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Anti-tilt clinic" title="Mistake Tracker"
        sub="Every tag you write in a trade ticket is counted here. Patterns that cost you money get called out — and we can warn you the moment you check the same box again." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Costly patterns" value={String(costly.length)} icon="bolt" deltaTone="down" sub="net negative P/L" tint="bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300" />
        <KpiCard label="Total cost" value={fmtMoney(totalCost)} icon="wallet" valueTone="down" deltaTone="down" sub="money lost to mistakes" tint="bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300" />
        <KpiCard label="Repeat offenders" value={String(topCount)} icon="refresh" deltaTone="down" sub={`appear ${'2+'} times`} tint="bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white">Save-time warnings</h2>
            <p className="text-xs text-slate-500 mt-1">When you log a trade, if its mistake already cost you money on your history, the journal pings a warning right before it saves. This works on web and Android.</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{warnOn ? 'Warnings ON' : 'Warnings OFF'}</span>
            <button onClick={() => { setWarnOn(!warnOn); toast.info(warnOn ? 'Mistake warnings disabled.' : 'Mistake warnings enabled — stay sharp.'); }}
              className={`relative w-11 h-6 rounded-full transition ${warnOn ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition ${warnOn ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </label>
        </div>
      </Card>

      {stats.length === 0 ? (
        <Card><Empty icon="🕶️" title="No mistakes logged" hint="Everything you do is clean — or you haven't tagged mistakes yet. Either way, keep it up." /></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {stats.map(s => {
            const [fix, rule] = coachFor(s.name);
            const bad = s.pl < 0;
            return (
              <Card key={s.name} className={bad ? '!border-red-200 dark:!border-red-900 !bg-red-50/30 dark:!bg-red-950/20' : ''}>
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0"><Glyph name="bolt" className="w-4 h-4" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-sm truncate">“{s.name}”</p>
                    <p className="text-[11px] text-slate-400 num">{s.n} trade{s.n === 1 ? '' : 's'} · {s.wr.toFixed(0)}% WR · {(s.r / Math.max(1, s.n)).toFixed(2)}R avg</p>
                  </div>
                  <span className={`num font-extrabold shrink-0 ${bad ? 'text-red-600' : 'text-emerald-600'}`}>{s.pl >= 0 ? '+' : ''}{fmtMoney(s.pl)}</span>
                </div>
                <p className="text-xs mt-2 text-slate-500 dark:text-slate-400"><b className="text-indigo-600 dark:text-indigo-300">Fix:</b> {fix}</p>
                {bad && <p className="text-[11px] font-extrabold text-amber-600 dark:text-amber-400 mt-1.5">⚠ {s.n >= 3 ? 'Third+ time — this is a real leak.' : 'Watch this one.'} “{rule}”</p>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}