import { useEffect, useMemo, useState } from 'react';
import { calcStats, fmtMoney, tradePL, tradeR } from '../lib/calc';
import { toast } from '../lib/store';
import { supabase } from '../lib/supabase';
import type { Trade } from '../lib/types';
import { Badge, Card, DivBars, Donut, PageHeader, btnGhost, btnPrimary } from '../components/ui';

interface ShareLink { token: string; label: string; created_at: string }

function snapshotTrades(trades: Trade[]): Trade[] {
  return trades.map(t => {
    const { beforeShot: _b, afterShot: _a, screenshot: _s, ...rest } = t as any;
    return rest as Trade;
  });
}

function weekRange(offset: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  const f = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return { start: monday, end: sunday, label: `${f(monday)} – ${f(sunday)}` };
}

function ShareCard({ trades, copy, onGo }: { trades: Trade[]; copy: () => void; onGo: (p: string) => void }) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('shared_views').select('token,label,created_at').order('created_at', { ascending: false });
    if (data) setLinks(data as ShareLink[]);
  };
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const snap = () => {
    let bal = 10000;
    try { bal = Number(JSON.parse(localStorage.getItem('dadafx.balance') ?? '10000')) || 10000; } catch { /* ignore */ }
    return { startBalance: bal, trades: snapshotTrades(trades) };
  };
  const urlFor = (token: string) => `${location.origin}${location.pathname}?share=${token}`;

  const create = async () => {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.err('Sign in to share.'); return; }
      const token = crypto.randomUUID();
      const { error } = await supabase.from('shared_views').insert({
        token, user_id: user.id,
        label: label.trim() || `Mentor review ${new Date().toLocaleDateString()}`,
        data: snap(),
      });
      if (error) throw error;
      setLabel('');
      await load();
      await navigator.clipboard?.writeText(urlFor(token)).catch(() => {});
      toast.ok('Mentor link created & copied. No login needed to view.');
    } catch (e: any) {
      toast.err(e?.message?.includes('shared_views') ? 'Run the SHARE SQL in Supabase first — see SUPABASE.sql.' : 'Could not create link.');
    } finally {
      setBusy(false);
    }
  };

  const refresh = async (token: string) => {
    const { error } = await supabase.from('shared_views').update({ data: snap() }).eq('token', token);
    if (error) toast.err('Refresh failed.');
    else { toast.ok('Snapshot refreshed with latest trades.'); load(); }
  };

  const revoke = async (token: string) => {
    await supabase.from('shared_views').delete().eq('token', token);
    toast.info('Link revoked.');
    load();
  };

  return (
    <Card>
      <h2 className="font-display font-extrabold text-slate-900 dark:text-white mb-2">Share</h2>
      <p className="text-sm text-slate-500">Copy a text summary — or send a read-only mentor link (screenshots withheld).</p>
      <div className="flex gap-2 mt-3">
        <button className={btnPrimary} onClick={copy}>Copy summary</button>
        <button className={btnGhost} onClick={() => onGo('daily')}>Review days →</button>
      </div>
      <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
        <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">Mentor read-only links</p>
        <div className="flex gap-2">
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label, e.g. For Brian" className="h-10 px-3 rounded-xl bg-white/70 dark:bg-slate-950/50 border border-white/60 dark:border-white/10 text-sm flex-1" />
          <button className={btnPrimary} onClick={create} disabled={busy}>{busy ? '…' : 'Create link'}</button>
        </div>
        {links.length > 0 && (
          <div className="space-y-1.5 mt-2">
            {links.map(l => (
              <div key={l.token} className="flex items-center gap-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold truncate">{l.label}</p>
                  <p className="text-slate-400 num truncate">{urlFor(l.token)}</p>
                </div>
                <button className="font-bold text-indigo-600 hover:underline shrink-0" onClick={() => { navigator.clipboard?.writeText(urlFor(l.token)); toast.ok('Link copied.'); }}>Copy</button>
                <button className="font-bold text-emerald-600 hover:underline shrink-0" onClick={() => refresh(l.token)}>Refresh</button>
                <button className="font-bold text-red-500 hover:underline shrink-0" onClick={() => revoke(l.token)}>Revoke</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function Weekly({ trades, onGo }: { trades: Trade[]; onGo: (p: string) => void }) {
  const [off, setOff] = useState(0);
  const { start, end, label } = useMemo(() => weekRange(off), [off]);
  const week = useMemo(() => {
    const list = trades.filter(t => {
      const d = new Date(t.date);
      return d >= start && d <= end;
    });
    const closed = list.filter(t => t.exit != null);
    const s = calcStats(list);
    const pl = closed.reduce((a, t) => a + (tradePL(t) ?? 0), 0);
    const r = closed.reduce((a, t) => a + (tradeR(t) ?? 0), 0);
    const best = closed.length ? closed.reduce((a, b) => ((tradePL(a) ?? 0) > (tradePL(b) ?? 0) ? a : b)) : null;
    const worst = closed.length ? closed.reduce((a, b) => ((tradePL(a) ?? 0) < (tradePL(b) ?? 0) ? a : b)) : null;
    const withMist = closed.filter(t => t.mistakes.trim()).length;
    const scores = closed.map(t => t.planScore ?? 100);
    const avgPlan = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 100;
    const mistMap = new Map<string, number>();
    for (const t of closed) {
      const k = (t.mistakes || '').split(',')[0].trim();
      if (k) mistMap.set(k, (mistMap.get(k) ?? 0) + 1);
    }
    const topMistake = [...mistMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { list, closed, s, pl, r, best, worst, withMist, avgPlan, topMistake };
  }, [trades, start, end]);

  const grade = useMemo(() => {
    if (!week.closed.length) return { g: '—', c: 'text-slate-400', note: 'No closed trades this week.' };
    let score = 100;
    if (week.pl < 0) score -= 30;
    if (week.s.winRate < 40) score -= 15;
    if (week.avgPlan < 70) score -= 15;
    if (week.closed.length && week.withMist / week.closed.length > 0.5) score -= 10;
    if (week.r < 0) score -= 10;
    const g = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
    return {
      g, note: g === 'A' ? 'Elite week. Protect the process.' : g === 'B' ? 'Solid — one leak to fix.' : g === 'C' ? 'Average — review mistakes below.' : 'Red week — cut size, re-read your plan.',
      c: g === 'A' ? 'text-emerald-500' : g === 'F' ? 'text-red-500' : 'text-amber-500',
    };
  }, [week]);

  const focus = !week.closed.length ? 'Log your first trade of the week.'
    : week.s.winRate < 45 ? 'Selectivity — only A+ setups next week.'
    : week.avgPlan < 75 ? 'Plan discipline — re-read rules before each entry.'
    : week.r < 1 ? 'Let winners run — hold for full 2R targets.'
    : week.pl < 0 ? 'Quit while green — honor the daily loss guard.'
    : 'Scale with care — edge confirmed, consider +10% size.';

  const byDay = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map((d, i) => {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      const pl = week.closed.filter(t => t.date.slice(0, 10) === key).reduce((a, t) => a + (tradePL(t) ?? 0), 0);
      return { label: d, value: Math.round(pl) };
    });
  }, [week.closed, start]);

  const copy = () => {
    const bestPL = week.best ? tradePL(week.best) ?? 0 : 0;
    const worstPL = week.worst ? tradePL(week.worst) ?? 0 : 0;
    const txt = `WEEKLY REPORT (${label})\nGrade ${grade.g} · P/L ${week.pl >= 0 ? '+' : ''}${fmtMoney(week.pl)} · ${week.r.toFixed(1)}R · WR ${week.s.winRate.toFixed(1)}% · ${week.closed.length} trades\nBest: ${week.best ? `${week.best.pair} ${fmtMoney(bestPL)}` : '—'} · Worst: ${week.worst ? `${week.worst.pair} ${fmtMoney(worstPL)}` : '—'}\nTop mistake: ${week.topMistake ?? 'none'} · Focus: ${focus}`;
    navigator.clipboard?.writeText(txt).then(() => toast.ok('Report copied.')).catch(() => toast.err('Copy failed.'));
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Auto-generated review" title="Weekly Report" sub={`Week of ${label} · your trading week on one page.`}
        right={<>
          <button className={btnGhost} onClick={() => setOff(off - 1)}>← Prev</button>
          <button className={btnGhost} onClick={() => setOff(0)} disabled={off === 0}>This week</button>
          <button className={btnGhost} onClick={() => setOff(off + 1)}>Next →</button>
          <button className={btnPrimary} onClick={() => window.print()}>Print</button>
        </>} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <Card className="flex items-center gap-4">
          <span className={`font-display font-extrabold text-7xl ${grade.c}`}>{grade.g}</span>
          <div>
            <p className="font-display font-extrabold text-slate-900 dark:text-white">Week grade</p>
            <p className="text-sm text-slate-500 mt-0.5">{grade.note}</p>
            <p className="text-sm font-bold mt-1.5">🎯 Next week: <span className="text-indigo-600 dark:text-indigo-300">{focus}</span></p>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-display font-extrabold text-slate-900 dark:text-white">Net P/L</h2>
            <Badge tone={week.pl >= 0 ? 'green' : 'red'}>{week.r >= 0 ? '+' : ''}{week.r.toFixed(1)}R</Badge>
          </div>
          <p className={`font-display font-extrabold text-4xl num tracking-tight mt-1 ${week.pl > 0 ? 'text-emerald-600' : week.pl < 0 ? 'text-red-600' : ''}`}>{week.pl >= 0 ? '+' : ''}{fmtMoney(week.pl)}</p>
          <p className="text-xs text-slate-500 mt-1 num">{week.closed.length} closed · WR {week.s.winRate.toFixed(1)}% · PF {week.s.profitFactor >= 99 ? '∞' : week.s.profitFactor.toFixed(2)}</p>
          <div className="mt-2"><Donut pct={week.s.winRate} size={96} label="Win rate" /></div>
        </Card>
        <Card>
          <h2 className="font-display font-extrabold text-slate-900 dark:text-white mb-2">Day by day</h2>
          <DivBars data={byDay} money />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <h2 className="font-display font-extrabold text-slate-900 dark:text-white mb-2">Best & worst</h2>
          {week.best && week.worst ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-3 py-2"><span className="font-bold">Best: {week.best.pair} {week.best.direction}</span><span className="num font-extrabold text-emerald-600">+{fmtMoney(tradePL(week.best!) ?? 0).slice(0)}</span></div>
              <div className="flex justify-between rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2"><span className="font-bold">Worst: {week.worst.pair} {week.worst.direction}</span><span className="num font-extrabold text-red-600">{fmtMoney(tradePL(week.worst!) ?? 0)}</span></div>
              <p className="text-xs text-slate-500">Top mistake: <b>{week.topMistake ?? 'none — clean week'}</b> · Plan score avg: <b className="num">{week.avgPlan.toFixed(0)}%</b></p>
            </div>
          ) : <p className="text-sm text-slate-400">No closed trades this week.</p>}
        </Card>
        <ShareCard trades={trades} copy={copy} onGo={onGo} />
      </div>
    </div>
  );
}
