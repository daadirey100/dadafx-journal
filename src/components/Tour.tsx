import { useState } from 'react';
import { btnGhost, btnPrimary } from './ui';

const STEPS: { icon: string; title: string; body: string; go?: string; cta: string }[] = [
  { icon: '📝', title: 'Log your first trade', body: 'Pair, side, lots, entry, stop and target — P/L, R-multiple and screenshots are handled for you.', go: 'journal', cta: 'Open Trading Journal' },
  { icon: '📋', title: 'Write your plan', body: 'Rules, allowed pairs, risk limits and your A+ checklist. Every future ticket is graded against it.', go: 'plan', cta: 'Open Trading Plan' },
  { icon: '🛡️', title: 'Arm the guard', body: 'Set a daily and weekly max loss in My Portfolio. The dashboard will physically tell you to stop.', go: 'portfolio', cta: 'Open My Portfolio' },
  { icon: '📅', title: 'Review your days', body: 'The heatmap calendar paints profit green and loss red. Click any day to relive every trade.', go: 'daily', cta: 'Open Daily Journal' },
  { icon: '🏦', title: 'Chase funding', body: 'Track prop challenges, log payouts and pin your certificates. Then share your month with the world.', go: 'prop', cta: 'Open Prop Tracker' },
];

export default function Tour({ onDone, onGo }: { onDone: () => void; onGo: (p: string) => void }) {
  const [i, setI] = useState(0);
  const s = STEPS[i];
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Welcome tour">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[3px]" onClick={onDone} />
      <div className="relative glass rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6 animate-slide-up">
        <div className="flex items-center gap-1.5 mb-3">
          {STEPS.map((_, j) => (
            <span key={j} className={`h-1.5 flex-1 rounded-full ${j <= i ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
          ))}
        </div>
        <p className="text-5xl">{s.icon}</p>
        <h3 className="font-display font-extrabold text-xl tracking-tight mt-2">{s.title}</h3>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">{s.body}</p>
        <div className="flex gap-2 mt-5">
          <button className={btnGhost + ' flex-1'} onClick={onDone}>{i === 0 ? 'Skip tour' : 'Finish later'}</button>
          {s.go && <button className={btnGhost + ' flex-1'} onClick={() => { onGo(s.go!); }}>Take me there</button>}
          <button className={btnPrimary + ' flex-1'} onClick={() => { if (i === STEPS.length - 1) onDone(); else setI(i + 1); }}>
            {i === STEPS.length - 1 ? "Let's trade" : 'Next'}
          </button>
        </div>
        <p className="text-[11px] text-slate-400 text-center mt-3">Step {i + 1} of {STEPS.length} · replay anytime from the ? menu</p>
      </div>
    </div>
  );
}
