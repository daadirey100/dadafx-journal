import { useState } from 'react';
import { toast, useLocal } from '../lib/store';
import { DEFAULT_PLAN, PAIRS, SESSIONS, type TradingPlan } from '../lib/types';
import { btnGhost, btnPrimary, Card, Empty, Field, PageHeader, inputCls } from '../components/ui';

export default function Plan({ onQuickAdd }: { onQuickAdd: () => void }) {
  const [plan, setPlan] = useLocal<TradingPlan>('dadafx.plan', DEFAULT_PLAN);
  const [rule, setRule] = useState('');
  const [item, setItem] = useState('');

  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter(x => x !== v) : [...list, v];

  const addRule = () => {
    if (!rule.trim()) return;
    setPlan({ ...plan, rules: [...plan.rules, rule.trim()] });
    setRule('');
    toast.ok('Rule added.');
  };
  const addItem = () => {
    if (!item.trim()) return;
    setPlan({ ...plan, checklist: [...plan.checklist, item.trim()] });
    setItem('');
    toast.ok('Checklist item added.');
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Discipline system" title="Trading Plan"
        sub="Your rules live here — and every trade ticket is checked against them automatically."
        right={<button className={btnPrimary} onClick={onQuickAdd}>Test a trade vs plan</button>} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white mb-1">Trading rules</h2>
          <div className="space-y-1.5 mt-2">
            {plan.rules.length === 0 && <Empty icon="📜" title="No rules yet" hint="Write the rules that keep you alive." />}
            {plan.rules.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                <span className="num font-extrabold text-indigo-500 w-5">{i + 1}</span>
                <span className="flex-1 font-medium">{r}</span>
                <button className="text-xs font-bold text-red-500 hover:underline" onClick={() => setPlan({ ...plan, rules: plan.rules.filter((_, j) => j !== i) })}>Del</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input className={inputCls} value={rule} onChange={e => setRule(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRule()} placeholder="e.g. Never risk more than 1%" />
            <button className={btnGhost} onClick={addRule}>Add</button>
          </div>
        </Card>

        <Card>
          <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white mb-1">A+ setup checklist</h2>
          <p className="text-xs text-slate-500 mb-2">Tick through this mentally before every entry.</p>
          <div className="space-y-1.5">
            {plan.checklist.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/30 px-3 py-2">
                <span className="w-5 h-5 rounded-md bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center shrink-0">✓</span>
                <span className="flex-1 font-medium">{c}</span>
                <button className="text-xs font-bold text-red-500 hover:underline" onClick={() => setPlan({ ...plan, checklist: plan.checklist.filter((_, j) => j !== i) })}>Del</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input className={inputCls} value={item} onChange={e => setItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()} placeholder="e.g. SL beyond structure" />
            <button className={btnGhost} onClick={addItem}>Add</button>
          </div>
        </Card>

        <Card>
          <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white mb-1">Allowed pairs</h2>
          <p className="text-xs text-slate-500 mb-2">Trades on other pairs get flagged in the ticket.</p>
          <div className="flex flex-wrap gap-1.5">
            {PAIRS.map(p => (
              <button key={p} onClick={() => setPlan({ ...plan, allowedPairs: toggle(plan.allowedPairs, p) })}
                className={`h-8 px-3 rounded-lg text-xs font-extrabold num border transition ${plan.allowedPairs.includes(p) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>{p}</button>
            ))}
          </div>
          <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white mt-4 mb-1">Preferred sessions</h2>
          <div className="flex flex-wrap gap-1.5">
            {SESSIONS.map(s => (
              <button key={s} onClick={() => setPlan({ ...plan, preferredSessions: toggle(plan.preferredSessions, s) })}
                className={`h-8 px-3 rounded-lg text-xs font-extrabold border transition ${plan.preferredSessions.includes(s) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>{s}</button>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white mb-2">Risk limits</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max risk / trade (%)"><input type="number" step="0.1" className={`${inputCls} num`} value={plan.maxDailyRisk} onChange={e => setPlan({ ...plan, maxDailyRisk: Number(e.target.value) })} /></Field>
            <Field label="Max trades / day"><input type="number" className={`${inputCls} num`} value={plan.maxTradesPerDay} onChange={e => setPlan({ ...plan, maxTradesPerDay: Number(e.target.value) })} /></Field>
          </div>
          <div className="mt-3"><Field label="Entry rules"><textarea rows={3} className={`${inputCls} !h-auto py-2`} value={plan.entryRules} onChange={e => setPlan({ ...plan, entryRules: e.target.value })} /></Field></div>
          <div className="mt-3"><Field label="Exit rules"><textarea rows={3} className={`${inputCls} !h-auto py-2`} value={plan.exitRules} onChange={e => setPlan({ ...plan, exitRules: e.target.value })} /></Field></div>
        </Card>
      </div>

      <Card>
        <p className="text-sm text-slate-600 dark:text-slate-300">✅ When you log a trade, the ticket checks <b>pair → session → risk → daily count → rules</b> and stores a <b>plan score</b>. Statistics Center then shows whether plan-followers or rule-breakers make you money.</p>
      </Card>
    </div>
  );
}
