import { useEffect, useMemo, useState } from 'react';
import { calcStats, fmtMoney, tradePL } from '../lib/calc';
import { toast, useLocal } from '../lib/store';
import type { GoalSettings, Trade } from '../lib/types';
import { btnPrimary, Card, Confetti, DivBars, Donut, Field, Glyph, PageHeader, inputCls } from '../components/ui';

export default function Goals({ trades }: { trades: Trade[] }) {
  const [goals, setGoals] = useLocal<GoalSettings>('dadafx.goals', { monthlyTarget: 2000, winRateTarget: 55, maxTrades: 40 });
  const month = new Date().toISOString().slice(0, 7);
  const monthTrades = useMemo(() => trades.filter(t => t.exit != null && t.date.startsWith(month)), [trades, month]);
  const s = calcStats(monthTrades);
  const monthPL = monthTrades.reduce((a, t) => a + (tradePL(t) ?? 0), 0);
  const profitPct = goals.monthlyTarget > 0 ? (monthPL / goals.monthlyTarget) * 100 : 0;

  const history = useMemo(() => {
    const out: { label: string; value: number }[] = [];
    const d = new Date();
    for (let i = 5; i >= 0; i--) {
      const t = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const key = t.toISOString().slice(0, 7);
      const pl = trades.filter(x => x.exit != null && x.date.startsWith(key)).reduce((a, x) => a + (tradePL(x) ?? 0), 0);
      out.push({ label: t.toLocaleString(undefined, { month: 'short' }), value: Math.round(pl) });
    }
    return out;
  }, [trades]);
  const streak = useMemo(() => {
    let n = 0;
    for (let i = 0; i < history.length; i++) {
      if (history[history.length - 1 - i].value > 0) n++;
      else break;
    }
    return n;
  }, [history]);

  const g = (k: keyof GoalSettings, v: number) => setGoals({ ...goals, [k]: v });
  const [fired, setFired] = useState(false);
  const targetHit = profitPct >= 100 && monthTrades.length > 0;
  const monthLabel = new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' });

  const shareMonth = async () => {
    const c = document.createElement('canvas');
    c.width = 1080; c.height = 1350;
    const x = c.getContext('2d')!;
    const bg = x.createLinearGradient(0, 0, 1080, 1350);
    bg.addColorStop(0, '#0f172a'); bg.addColorStop(0.55, '#312e81'); bg.addColorStop(1, '#022c22');
    x.fillStyle = bg; x.fillRect(0, 0, 1080, 1350);
    x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 3; x.strokeRect(48, 48, 984, 1254);
    x.textAlign = 'center';
    x.fillStyle = '#a5b4fc'; x.font = 'bold 40px sans-serif';
    x.fillText('DADA FX JOURNAL', 540, 170);
    x.fillStyle = '#ffffff'; x.font = 'bold 84px sans-serif';
    x.fillText(monthLabel.toUpperCase(), 540, 280);
    const good = monthPL >= 0;
    x.fillStyle = good ? '#34d399' : '#f87171'; x.font = 'bold 150px sans-serif';
    x.fillText(`${good ? '+' : ''}${fmtMoney(monthPL)}`, 540, 480);
    x.fillStyle = '#e2e8f0'; x.font = 'bold 56px sans-serif';
    x.fillText(`${s.winRate.toFixed(1)}% WIN · ${monthTrades.length} TRADES`, 540, 580);
    x.fillStyle = '#94a3b8'; x.font = '40px sans-serif';
    x.fillText(`Profit factor ${s.profitFactor >= 99 ? '∞' : s.profitFactor.toFixed(2)} · Streak ${streak} green`, 540, 650);
    x.fillStyle = targetHit ? '#34d399' : '#fbbf24'; x.font = 'bold 52px sans-serif';
    x.fillText(targetHit ? '★ TARGET SMASHED ★' : `${Math.max(0, profitPct).toFixed(0)}% OF TARGET`, 540, 760);
    // mini bars of last 6 months
    const max = Math.max(...history.map(h => Math.abs(h.value)), 1);
    history.forEach((h, i) => {
      const bw = 110, gap = 40, x0 = 540 - (history.length * (bw + gap) - gap) / 2 + i * (bw + gap);
      const bh = Math.max(8, (Math.abs(h.value) / max) * 260);
      x.fillStyle = h.value >= 0 ? '#34d399' : '#f87171';
      const y0 = 1050 - bh;
      x.fillRect(x0, y0, bw, bh);
      x.fillStyle = '#cbd5e1'; x.font = '30px sans-serif';
      x.fillText(h.label, x0 + bw / 2, 1095);
    });
    x.fillStyle = '#64748b'; x.font = '32px sans-serif';
    x.fillText('journaled, not gambled — DadaFX', 540, 1200);
    const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/png'));
    if (!blob) { toast.err('Could not render image.'); return; }
    const file = new File([blob], 'dadafx-month.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'My trading month' }); return; }
      catch { /* user cancelled — fall through to download */ }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dadafx-month.png';
    a.click();
    toast.ok('Month card downloaded — flex it. 📸');
  };

  useEffect(() => {
    if (targetHit && !fired) {
      const t = setTimeout(() => setFired(true), 7000);
      return () => clearTimeout(t);
    }
  }, [targetHit, fired]);

  return (
    <div className="space-y-4">
      {targetHit && !fired && <Confetti />}
      <PageHeader eyebrow="Targets & discipline" title="Goals"
        sub={`${monthLabel} · ${streak > 0 ? `${streak}-month green streak — keep it alive` : 'no green streak yet — start one.'}`}
        right={<button className={btnPrimary} onClick={shareMonth}><Glyph name="upload" className="w-4 h-4" />Share my month</button>} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card>
          <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white mb-1">Monthly profit target</h2>
          <Donut pct={Math.max(0, Math.min(100, profitPct))} label="of target"
            sub={<><p><b className="text-slate-700 dark:text-slate-200">Made:</b> <span className={monthPL >= 0 ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>{fmtMoney(monthPL)}</span></p><p><b className="text-slate-700 dark:text-slate-200">Target:</b> {fmtMoney(goals.monthlyTarget)}</p><p><b className="text-slate-700 dark:text-slate-200">Left:</b> {fmtMoney(goals.monthlyTarget - monthPL)}</p></>} />
          <Field label="Target ($)"><input type="number" className={`${inputCls} num mt-2`} value={goals.monthlyTarget} onChange={e => g('monthlyTarget', Number(e.target.value))} /></Field>
        </Card>
        <Card>
          <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white mb-1">Win-rate goal</h2>
          <Donut pct={s.winRate} label="Win rate"
            sub={<><p><b className="text-slate-700 dark:text-slate-200">Goal:</b> {goals.winRateTarget}%</p><p><b className="text-slate-700 dark:text-slate-200">Record:</b> {s.wins}W / {s.losses}L</p><p className={s.winRate >= goals.winRateTarget ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>{s.winRate >= goals.winRateTarget ? '✓ On target' : '✗ Below target'}</p></>} />
          <Field label="Target win rate (%)"><input type="number" className={`${inputCls} num mt-2`} value={goals.winRateTarget} onChange={e => g('winRateTarget', Number(e.target.value))} /></Field>
        </Card>
        <Card>
          <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white mb-1">Overtrading cap</h2>
          <p className="font-display font-extrabold text-4xl sm:text-5xl num tracking-tight text-slate-900 dark:text-white">{s.total}<span className="text-lg text-slate-400">/{goals.maxTrades}</span></p>
          <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 mt-3 overflow-hidden">
            <div className={`h-full rounded-full ${s.total > goals.maxTrades ? 'bg-red-500' : s.total / goals.maxTrades > 0.8 ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, (s.total / Math.max(1, goals.maxTrades)) * 100)}%` }} />
          </div>
          <p className={`text-xs font-bold mt-2 ${s.total > goals.maxTrades ? 'text-red-600' : 'text-slate-500'}`}>{s.total > goals.maxTrades ? '🛑 Over your cap — quality over quantity.' : `${Math.max(0, goals.maxTrades - s.total)} trades left this month.`}</p>
          <Field label="Max trades / month"><input type="number" className={`${inputCls} num mt-2`} value={goals.maxTrades} onChange={e => g('maxTrades', Number(e.target.value))} /></Field>
        </Card>
      </div>

      <Card>
        <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white mb-3">Last 6 months</h2>
        <DivBars data={history} money />
      </Card>
    </div>
  );
}
