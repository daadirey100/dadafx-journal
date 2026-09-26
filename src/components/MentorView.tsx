import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { calcStats, equityCurve, fmtMoney, tradePL } from '../lib/calc';
import type { Trade } from '../lib/types';
import { Badge, Card, Sparkline } from './ui';

interface Snap {
  label: string;
  created_at: string;
  startBalance: number;
  trades: Trade[];
}

// Public read-only journal review — no login required (unguessable link).
export default function MentorView({ token }: { token: string }) {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    supabase
      .from('shared_views')
      .select('label,created_at,data')
      .eq('token', token)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { setErr('This review link is invalid or was revoked.'); return; }
        setSnap({ label: (data as any).label, created_at: (data as any).created_at, ...(data as any).data });
      });
  }, [token]);

  if (err) {
    return (
      <div className="min-h-screen app-bg flex items-center justify-center p-4">
        <Card className="max-w-md text-center">
          <p className="text-4xl">🔒</p>
          <h1 className="font-display font-extrabold text-xl mt-2">Link unavailable</h1>
          <p className="text-sm text-slate-500 mt-1">{err}</p>
          <a href={location.pathname} className="inline-block mt-4 text-sm font-bold text-indigo-600 hover:underline">Open DadaFX Journal →</a>
        </Card>
      </div>
    );
  }
  if (!snap) {
    return (
      <div className="min-h-screen app-bg flex items-center justify-center p-4">
        <p className="text-sm text-slate-400 animate-pulse">Loading shared review…</p>
      </div>
    );
  }

  const s = calcStats(snap.trades);
  const curve = equityCurve(snap.trades, snap.startBalance);
  const recent = [...snap.trades].filter(t => t.exit != null).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  return (
    <div className="min-h-screen app-bg text-slate-900">
      <div className="max-w-[1000px] mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center font-display font-extrabold">D</span>
          <div>
            <h1 className="font-display font-extrabold tracking-tight">Shared review · {snap.label}</h1>
            <p className="text-xs text-slate-500">Read-only snapshot · {new Date(snap.created_at).toLocaleDateString()} · via DadaFX Journal</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {([
            ['Net P/L', `${s.totalPL >= 0 ? '+' : ''}${fmtMoney(s.totalPL)}`, s.totalPL >= 0],
            ['Win rate', `${s.winRate.toFixed(1)}%`, s.winRate >= 50],
            ['Profit factor', s.profitFactor >= 99 ? '∞' : s.profitFactor.toFixed(2), s.profitFactor >= 1],
            ['Trades', String(s.total), true],
          ] as [string, string, boolean][]).map(([l, v, good]) => (
            <Card key={l}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{l}</p>
              <p className={`font-display text-2xl font-extrabold num mt-0.5 ${good ? 'text-emerald-600' : 'text-red-600'}`}>{v}</p>
            </Card>
          ))}
        </div>
        <Card>
          <h2 className="font-display font-extrabold mb-1">Equity</h2>
          <Sparkline points={curve.map(p => p.equity)} height={140} stroke={s.totalPL >= 0 ? '#059669' : '#dc2626'} />
        </Card>
        <Card pad={false}>
          <div className="px-4 py-3 font-display font-extrabold">Recent closed trades</div>
          <div className="overflow-x-auto">
            <table className="ledger w-full text-sm min-w-[560px]">
              <thead><tr><th className="!pl-4">Date</th><th>Pair</th><th>Side</th><th className="text-right">R</th><th className="text-right !pr-4">P/L</th></tr></thead>
              <tbody>
                {recent.map(t => {
                  const pl = tradePL(t) ?? 0;
                  return (
                    <tr key={t.id}>
                      <td className="!pl-4 num text-xs">{t.date.slice(0, 10)}</td>
                      <td className="font-extrabold">{t.pair}</td>
                      <td><Badge tone={t.direction === 'Buy' ? 'green' : 'red'}>{t.direction.toUpperCase()}</Badge></td>
                      <td className="text-right num">—</td>
                      <td className={`text-right num font-extrabold !pr-4 ${pl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{pl >= 0 ? '+' : ''}{fmtMoney(pl)}</td>
                    </tr>
                  );
                })}
                {recent.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">No closed trades in this snapshot.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-center text-[11px] text-slate-400">Shared read-only from DadaFX Journal · screenshots withheld for privacy</p>
      </div>
    </div>
  );
}
