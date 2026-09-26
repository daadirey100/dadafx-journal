import { useMemo, useState } from 'react';
import { backtestStats } from '../lib/calc';
import { compressImage, toast } from '../lib/store';
import { PAIRS, SESSIONS, STRATEGIES, TIMEFRAMES, uid, type BacktestTrade, type Direction } from '../lib/types';
import { Badge, btnGhost, btnPrimary, Card, Confirm, DivBars, Donut, Empty, EquityChart, Field, Glyph, Modal, PageHeader, Stars, inputCls } from '../components/ui';
import Replay from '../components/Replay';
import TradingViewLibraryChart from '../components/TradingViewLibraryChart';
import TradeZellaReplay from '../components/TradeZellaReplay';
import { tvSymbol } from '../lib/tv';
import type { Trade } from '../lib/types';

export default function BacktestedTrades({ rows, setRows }: { rows: BacktestTrade[]; setRows: (r: BacktestTrade[]) => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BacktestTrade | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const [fStrat, setFStrat] = useState('All');
  const [fPair, setFPair] = useState('All');
  const [sort, setSort] = useState<'new' | 'best' | 'worst'>('new');
  const [form, setForm] = useState<any>({ date: new Date().toISOString().slice(0, 10), pair: 'EUR/USD', direction: 'Buy' as Direction, lot: 1, entry: 1.085, stopLoss: 1.083, takeProfit: 1.089, exit: 1.087, strategy: STRATEGIES[0], session: SESSIONS[0], setup: '', timeframe: 'H1', notes: '', riskPct: 1, commission: 0, rating: 3, mistakes: '', emotions: '', beforeShot: '', afterShot: '', planScore: 80 });
  const [chart, setChart] = useState<Trade | null>(null);
  const [tvRow, setTvRow] = useState<BacktestTrade | null>(null);
  const [lab, setLab] = useState(false);
  const toTrade = (r: BacktestTrade): Trade => ({
    id: r.id, date: r.date, pair: r.pair, direction: r.direction, lot: r.lot ?? 1,
    entry: r.entry, stopLoss: r.stopLoss, takeProfit: r.takeProfit, exit: r.exit,
    riskPct: r.riskPct ?? 1, strategy: r.strategy, session: r.session ?? '', timeframe: r.timeframe,
    setup: r.setup ?? '', emotions: r.emotions ?? '', mistakes: r.mistakes ?? '', notes: r.notes, rating: r.rating ?? 3,
    commission: r.commission, beforeShot: r.beforeShot, afterShot: r.afterShot, planScore: r.planScore,
  });
  const s = backtestStats(rows);

  const planRR = (r: Pick<BacktestTrade, 'entry' | 'stopLoss' | 'takeProfit'>) => {
    const risk = Math.abs(r.entry - r.stopLoss);
    return risk > 0 ? Math.abs(r.takeProfit - r.entry) / risk : null;
  };

  const list = useMemo(() => {
    let r = [...rows];
    if (fStrat !== 'All') r = r.filter(x => x.strategy === fStrat);
    if (fPair !== 'All') r = r.filter(x => x.pair === fPair);
    if (sort === 'new') r.sort((a, b) => b.date.localeCompare(a.date));
    if (sort === 'best') r.sort((a, b) => b.resultR - a.resultR);
    if (sort === 'worst') r.sort((a, b) => a.resultR - b.resultR);
    return r;
  }, [rows, fStrat, fPair, sort]);

  const curve = useMemo(() => {
    const sorted = [...rows].sort((a, b) => (a.date + a.pair).localeCompare(b.date + b.pair));
    const { out } = sorted.reduce<{ peak: number; out: { date: string; equity: number }[] }>(
      (acc, r) => {
        const peak = acc.peak + r.resultR;
        acc.out.push({ date: r.date, equity: Math.round(peak * 100) / 100 });
        return { peak, out: acc.out };
      },
      { peak: 0, out: [] },
    );
    return out;
  }, [rows]);

  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = r.date.slice(0, 7);
      m.set(k, (m.get(k) ?? 0) + r.resultR);
    }
    return [...m.entries()].sort().map(([label, value]) => ({ label, value: Math.round(value * 10) / 10 }));
  }, [rows]);

  const strats = useMemo(() => [...new Set(rows.map(r => r.strategy))], [rows]);
  const pairs = useMemo(() => [...new Set(rows.map(r => r.pair))], [rows]);

  const calcR = () => {
    const riskDist = Math.abs(Number(form.entry) - Number(form.stopLoss));
    const plDist = form.direction === 'Buy' ? Number(form.exit) - Number(form.entry) : Number(form.entry) - Number(form.exit);
    return riskDist > 0 ? plDist / riskDist : 0;
  };

  const save = () => {
    if (!form.pair || !(Number(form.entry) > 0)) { toast.err('Pair and entry are required.'); return; }
    if (!(Number(form.stopLoss) > 0) || !(Number(form.takeProfit) > 0)) { toast.err('SL and TP required for R calculation.'); return; }
    const data: BacktestTrade = {
      ...form, lot: Number(form.lot) || 1, entry: Number(form.entry), stopLoss: Number(form.stopLoss),
      takeProfit: Number(form.takeProfit), exit: Number(form.exit), resultR: Math.round(calcR() * 100) / 100,
      riskPct: Number(form.riskPct) || 1, commission: Number(form.commission) || 0, rating: Number(form.rating) || 3,
      planScore: Number(form.planScore) || 0,
    };
    if (editing) { setRows(rows.map(r => (r.id === editing.id ? { ...data, id: editing.id } : r))); toast.ok('Backtest updated.'); }
    else { setRows([{ ...data, id: uid() }, ...rows]); toast.ok(`Backtest logged (${data.resultR >= 0 ? '+' : ''}${data.resultR.toFixed(2)}R).`); }
    setOpen(false);
  };

  const download = (name: string, text: string, type: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
  };
  const exportCSV = () => {
    const head = ['date', 'pair', 'side', 'lot', 'entry', 'sl', 'tp', 'exit', 'resultR', 'strategy', 'session', 'setup', 'timeframe', 'notes'];
    const body = list.map(r => [r.date, r.pair, r.direction, r.lot ?? 1, r.entry, r.stopLoss, r.takeProfit, r.exit, r.resultR, r.strategy, r.session ?? '', r.setup ?? '', r.timeframe, `"${(r.notes || '').replace(/"/g, '""')}"`]);
    download('dadafx-backtests.csv', [head, ...body].map(x => x.join(',')).join('\n'), 'text/csv');
    toast.ok('Backtests exported.');
  };
  const importCSV = async (f: File) => {
    try {
      const lines = (await f.text()).split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { toast.err('No data rows.'); return; }
      const head = lines[0].split(',').map(h => h.trim().toLowerCase());
      const idx = (...ns: string[]) => { for (const n of ns) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
      const c = { date: idx('date'), pair: idx('pair', 'symbol'), dir: idx('side', 'direction'), lot: idx('lot', 'lots', 'volume'), entry: idx('entry'), sl: idx('sl', 'stop'), tp: idx('tp'), exit: idx('exit'), strat: idx('strategy'), sess: idx('session'), setup: idx('setup'), tf: idx('timeframe', 'tf'), notes: idx('notes') };
      if (c.pair < 0 || c.entry < 0) { toast.err('Need Pair + Entry columns.'); return; }
      const num = (v = '') => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
      const get = (r: string[], i: number, fb = '') => (i >= 0 && r[i] != null ? r[i].trim() : fb);
      const made: BacktestTrade[] = [];
      for (const line of lines.slice(1)) {
        const r = line.split(',');
        const pair = get(r, c.pair), entry = num(get(r, c.entry));
        if (!pair || !entry) continue;
        const dv = get(r, c.dir, 'Buy').toLowerCase();
        const dir = (dv.includes('sell') || dv.includes('short') ? 'Sell' : 'Buy') as Direction;
        const sl = num(get(r, c.sl)), tp = num(get(r, c.tp)), ex = num(get(r, c.exit));
        const rd = Math.abs(entry - sl);
        made.push({
          id: uid(), date: get(r, c.date, new Date().toISOString().slice(0, 10)).slice(0, 10), pair, direction: dir,
          lot: num(get(r, c.lot, '1')) || 1, entry, stopLoss: sl, takeProfit: tp, exit: ex,
          resultR: rd > 0 ? Math.round(((dir === 'Buy' ? ex - entry : entry - ex) / rd) * 100) / 100 : 0,
          strategy: get(r, c.strat, 'Imported'), session: get(r, c.sess), setup: get(r, c.setup),
          timeframe: get(r, c.tf, 'H1'), notes: get(r, c.notes),
        });
      }
      if (!made.length) { toast.err('No valid rows.'); return; }
      setRows([...made.reverse(), ...rows]);
      toast.ok(`Imported ${made.length} backtests.`);
    } catch { toast.err('Could not read that file.'); }
  };

  const strip: [string, string, string][] = [
    ['Total R', `${s.totalR >= 0 ? '+' : ''}${s.totalR.toFixed(1)}R`, s.totalR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'],
    ['Avg R · Expectancy', `${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}R`, s.avgR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'],
    ['Win rate', `${s.winRate.toFixed(1)}% · ${s.wins}W/${s.losses}L`, 'text-slate-900 dark:text-white'],
    ['PF · Max DD', `${s.pf >= 99 ? '∞' : s.pf.toFixed(2)} · ${s.maxDD.toFixed(1)}R`, s.pf >= 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'],
    ['Best / Worst', `+${s.best.toFixed(1)} / ${s.worst.toFixed(1)}`, 'text-slate-900 dark:text-white'],
    ['Streak W/L', `${s.maxWinStreak} / ${s.maxLossStreak}`, 'text-slate-900 dark:text-white'],
  ];

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Strategy lab" title="Backtested Trades"
        sub={`${s.total} samples · ${s.winRate.toFixed(1)}% win · ${s.totalR >= 0 ? '+' : ''}${s.totalR.toFixed(1)}R total · ${s.avgR.toFixed(2)}R avg. Kept separate from live trades.`}
        right={<div className="flex gap-2"><button className="h-10 px-4 rounded-xl bg-[#00E676] text-black font-black text-sm hover:bg-[#00CC6A]" onClick={() => setLab(true)}>▶ Trade Replay Lab</button><button className={btnPrimary} onClick={() => { setEditing(null); setOpen(true); }}><Glyph name="plus" className="w-4 h-4" />Add backtest</button></div>} />

      {/* TradeZella-style lab promo */}
      <div className="rounded-2xl border border-[#00E676]/15 bg-gradient-to-br from-[#0E1220] to-[#0A0E1A] p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1">
          <p className="text-[10px] font-black tracking-[0.16em] text-[#00E676]">TRADE REPLAY — MAKE BACKTEST</p>
          <h3 className="font-black text-[15px] mt-1">Replay like TradeZella, save as Backtest</h3>
          <p className="text-xs text-white/45 mt-1">Pick any symbol & timeframe, step candle-by-candle, click Buy/Sell → Exit, tag mistakes, and save tick-by-tick as a real BacktestTrade. No TradingView needed.</p>
        </div>
        <button onClick={() => setLab(true)} className="shrink-0 h-10 px-5 rounded-full bg-white text-black font-black text-sm hover:bg-white/90">Start Replay Lab →</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
        {strip.map(([l, v, c]) => (
          <Card key={l} className="!p-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{l}</p>
            <p className={`font-display font-extrabold text-sm sm:text-lg num ${c}`}>{v}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <Card className="xl:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white">Strategy equity trajectory</h2>
              <p className="text-xs text-slate-500">Cumulative R over time · hover any point</p>
            </div>
            <Badge tone={s.totalR >= 0 ? 'green' : 'red'}>{s.totalR >= 0 ? '+' : ''}{s.totalR.toFixed(1)}R</Badge>
          </div>
          <EquityChart points={curve} startLine={0} height={230}
            format={v => `${v >= 0 ? '+' : ''}${Math.round(v)}R`}
            formatTip={v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />Cumulative R</span>
            <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-slate-400 inline-block" />Breakeven (0R)</span>
            <span className="ml-auto num">Expectancy {s.avgR >= 0 ? '+' : ''}{s.avgR.toFixed(2)}R / trade</span>
          </div>
        </Card>
        <div className="space-y-3">
          <Card>
            <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white mb-2">Win rate</h2>
            <Donut pct={s.winRate} label="Win rate"
              sub={<><p><b className="text-slate-700 dark:text-slate-200">Wins:</b> {s.wins}</p><p><b className="text-slate-700 dark:text-slate-200">Losses:</b> {s.losses}</p><p><b className="text-slate-700 dark:text-slate-200">Avg:</b> {s.avgR >= 0 ? '+' : ''}{s.avgR.toFixed(2)}R</p></>} />
          </Card>
          <Card>
            <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white mb-2">R by month</h2>
            {byMonth.length ? <DivBars data={byMonth} /> : <p className="text-xs text-slate-400">Log backtests to see monthly R.</p>}
          </Card>
        </div>
      </div>

      <Card className="!p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <select className="h-10 px-3 rounded-xl bg-white/70 dark:bg-slate-950/50 border border-white/60 dark:border-white/10 text-sm font-bold" value={fStrat} onChange={e => setFStrat(e.target.value)} aria-label="Strategy">
            <option>All</option>{strats.map(x => <option key={x}>{x}</option>)}
          </select>
          <select className="h-10 px-3 rounded-xl bg-white/70 dark:bg-slate-950/50 border border-white/60 dark:border-white/10 text-sm font-bold" value={fPair} onChange={e => setFPair(e.target.value)} aria-label="Pair">
            <option>All</option>{pairs.map(x => <option key={x}>{x}</option>)}
          </select>
          <select className="h-10 px-3 rounded-xl bg-white/70 dark:bg-slate-950/50 border border-white/60 dark:border-white/10 text-sm font-bold" value={sort} onChange={e => setSort(e.target.value as any)} aria-label="Sort">
            <option value="new">Sort: Newest</option><option value="best">Sort: Best R</option><option value="worst">Sort: Worst R</option>
          </select>
          <span className="flex-1" />
          <button onClick={exportCSV} className={btnGhost + ' !h-10 !text-xs'}><Glyph name="download" className="w-3.5 h-3.5" />CSV</button>
          <label className={btnGhost + ' !h-10 !text-xs cursor-pointer'}><Glyph name="upload" className="w-3.5 h-3.5" />Import
            <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importCSV(f); e.target.value = ''; }} />
          </label>
        </div>
      </Card>

      <Card pad={false} className="overflow-hidden">
        {list.length === 0 ? <Empty icon="🔬" title="No backtests yet" hint="Log historical setups to validate your edge before risking real money." action={<button className={btnPrimary} onClick={() => setOpen(true)}>Add backtest</button>} /> : (
          <div className="overflow-x-auto">
            <table className="ledger w-full text-sm min-w-[980px]">
              <thead><tr><th className="!pl-4">Date</th><th>Pair / Side</th><th className="text-right">Entry → Exit</th><th className="text-right">SL / TP</th><th className="text-right">Plan R:R</th><th className="text-right">Real R</th><th>Rating</th><th>Strategy</th><th className="!pr-4">Note</th></tr></thead>
              <tbody>
                {list.map(r => {
                  const rr = planRR(r);
                  return (
                    <tr key={r.id} className="group">
                      <td className="!pl-4 num text-xs whitespace-nowrap">{r.date}</td>
                      <td className="whitespace-nowrap font-extrabold">{r.pair} <Badge tone={r.direction === 'Buy' ? 'green' : 'red'}>{r.direction.toUpperCase()}</Badge></td>
                      <td className="text-right num">{r.entry} <span className="text-slate-400">→</span> {r.exit}</td>
                      <td className="text-right num text-xs leading-relaxed whitespace-nowrap"><span className="text-red-600 font-semibold">{r.stopLoss}</span><br /><span className="text-emerald-600 font-semibold">{r.takeProfit}</span></td>
                      <td className="text-right"><span className="inline-flex h-6 px-2 items-center rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-extrabold num">{rr == null ? '—' : `1:${rr.toFixed(2)}`}</span></td>
                      <td className={`text-right num font-extrabold ${r.resultR >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{r.resultR >= 0 ? '+' : ''}{r.resultR.toFixed(2)}R</td>
                      <td className="text-center"><Stars n={r.rating ?? 3} /></td>
                      <td className="text-xs max-w-[170px]">
                        <span className="block font-semibold truncate">{r.strategy}</span>
                        <span className="block truncate text-slate-400">{[r.session, r.setup].filter(Boolean).join(' · ') || `${r.timeframe}`}{r.mistakes ? ` · ⚠️ ${r.mistakes}` : ''}</span>
                      </td>
                      <td className="!pr-4 text-xs text-slate-500 max-w-[220px] truncate whitespace-nowrap">{r.notes || '—'}
                        <span className="ml-2 inline-flex gap-1 align-middle">
                          <button className="h-6 px-2 rounded-md bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-200 text-[11px] font-extrabold" onClick={() => setChart(toTrade(r))}>Replay</button>
                          <button className="h-6 px-2 rounded-md bg-sky-500 text-white text-[11px] font-extrabold shadow" onClick={() => setTvRow(r)}>TV Chart</button>
                          <button className="text-[11px] font-bold text-indigo-600 hover:underline ml-1" onClick={() => { setEditing(r); setForm({ ...r }); setOpen(true); }}>Edit</button>
                          <button className="text-[11px] font-bold text-red-500 hover:underline" onClick={() => setDel(r.id)}>Del</button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
          <span><b className="text-slate-800 dark:text-slate-200">{list.length}</b> of <b className="text-slate-800 dark:text-slate-200">{rows.length}</b> backtests</span>
          <span className="num">Avg win +{s.avgWin.toFixed(2)}R · Avg loss −{s.avgLoss.toFixed(2)}R</span>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} eyebrow="Backtest ticket — professional" title={editing ? 'Edit backtest' : 'Add backtest'} wide>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><input type="date" className={inputCls} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Pair"><select className={inputCls} value={form.pair} onChange={e => setForm({ ...form, pair: e.target.value })}>{PAIRS.map(p => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Direction"><select className={inputCls} value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}><option>Buy</option><option>Sell</option></select></Field>
          <Field label="Lot size"><input type="number" step="0.01" className={`${inputCls} num`} value={form.lot} onChange={e => setForm({ ...form, lot: e.target.value })} /></Field>
          <Field label="Risk %"><input type="number" step="0.1" className={`${inputCls} num`} value={form.riskPct} onChange={e => setForm({ ...form, riskPct: e.target.value })} /></Field>
          <Field label="Commission $"><input type="number" step="0.01" className={`${inputCls} num`} value={form.commission} onChange={e => setForm({ ...form, commission: e.target.value })} /></Field>
          <Field label="Session"><select className={inputCls} value={form.session} onChange={e => setForm({ ...form, session: e.target.value })}>{SESSIONS.map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Entry"><input type="number" step="0.00001" className={`${inputCls} num`} value={form.entry} onChange={e => setForm({ ...form, entry: e.target.value })} /></Field>
          <Field label="Exit"><input type="number" step="0.00001" className={`${inputCls} num`} value={form.exit} onChange={e => setForm({ ...form, exit: e.target.value })} /></Field>
          <Field label="Stop loss"><input type="number" step="0.00001" className={`${inputCls} num`} value={form.stopLoss} onChange={e => setForm({ ...form, stopLoss: e.target.value })} /></Field>
          <Field label="Take profit"><input type="number" step="0.00001" className={`${inputCls} num`} value={form.takeProfit} onChange={e => setForm({ ...form, takeProfit: e.target.value })} /></Field>
          <Field label="Strategy"><select className={inputCls} value={form.strategy} onChange={e => setForm({ ...form, strategy: e.target.value })}>{STRATEGIES.map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Timeframe"><select className={inputCls} value={form.timeframe} onChange={e => setForm({ ...form, timeframe: e.target.value })}>{TIMEFRAMES.map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Rating"><select className={inputCls} value={form.rating} onChange={e => setForm({ ...form, rating: Number(e.target.value) })}><option value={1}>1 — Poor</option><option value={2}>2 — Fair</option><option value={3}>3 — Good</option><option value={4}>4 — Great</option><option value={5}>5 — Perfect</option></select></Field>
          <Field label="Plan score %"><input type="number" min={0} max={100} className={`${inputCls} num`} value={form.planScore} onChange={e => setForm({ ...form, planScore: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="Setup"><input className={inputCls} value={form.setup} onChange={e => setForm({ ...form, setup: e.target.value })} placeholder="e.g. Break + retest" /></Field></div>
          <div className="col-span-2"><Field label="Mistakes (comma separated)"><input className={inputCls} value={form.mistakes} onChange={e => setForm({ ...form, mistakes: e.target.value })} placeholder="e.g. FOMO, late entry" /></Field></div>
          <div className="col-span-2"><Field label="Emotions"><input className={inputCls} value={form.emotions} onChange={e => setForm({ ...form, emotions: e.target.value })} placeholder="e.g. Calm, confident" /></Field></div>
          <div className="col-span-2"><Field label="Notes"><textarea rows={2} className={`${inputCls} !h-auto py-2`} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="What did you learn from replay?" /></Field></div>
          <Field label="Before screenshot"><input type="file" accept="image/*" className="text-xs" onChange={async e=>{const f=e.target.files?.[0]; if(f) try{setForm({...form, beforeShot: await compressImage(f)})}catch{toast.err('Image failed')}}} />{form.beforeShot && <img src={form.beforeShot} className="mt-2 rounded-lg border max-h-28" alt="before" />}</Field>
          <Field label="After screenshot"><input type="file" accept="image/*" className="text-xs" onChange={async e=>{const f=e.target.files?.[0]; if(f) try{setForm({...form, afterShot: await compressImage(f)})}catch{toast.err('Image failed')}}} />{form.afterShot && <img src={form.afterShot} className="mt-2 rounded-lg border max-h-28" alt="after" />}</Field>
        </div>
        <p className="text-xs text-slate-500 mt-2">Result: <b className={`num ${calcR() >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{calcR() >= 0 ? '+' : ''}{calcR().toFixed(2)}R</b> · net of commission · Plan {form.planScore ?? 0}%</p>
        <div className="flex justify-end gap-2 mt-4"><button className={btnGhost} onClick={() => setOpen(false)}>Cancel</button><button className={btnPrimary} onClick={save}>Save professional</button></div>
      </Modal>
      {lab && <TradeZellaReplay onClose={() => setLab(false)} onSave={r => { setRows([r, ...rows]); toast.ok(`Backtest saved via Replay: ${r.resultR >= 0 ? '+' : ''}${r.resultR.toFixed(2)}R`); setLab(false); }} />}
      {chart && <Replay trade={chart} onClose={() => setChart(null)} />}
      <Modal open={!!tvRow} onClose={() => setTvRow(null)} title={tvRow ? tvSymbol(tvRow.pair) : ''} eyebrow="TradingView pro chart" wide>
        {tvRow && (
          <TradingViewLibraryChart
            symbol={tvSymbol(tvRow.pair)}
            marks={[
              { time: Math.floor(new Date(`${tvRow.date}T12:00:00Z`).getTime() / 1000), price: tvRow.entry, dir: tvRow.direction === 'Buy' ? 'buy' : 'sell', label: `Entry ${tvRow.direction}` },
              { time: Math.floor(new Date(`${tvRow.date}T12:00:00Z`).getTime() / 1000), price: tvRow.exit, dir: tvRow.direction === 'Buy' ? 'buy' : 'sell', label: `Exit ${tvRow.exit}` },
            ]}
            levels={[
              { price: tvRow.stopLoss, label: `SL ${tvRow.stopLoss}`, color: '#F23645' },
              { price: tvRow.takeProfit, label: `TP ${tvRow.takeProfit}`, color: '#089981' },
            ]}
          />
        )}
        <p className="text-[11px] text-slate-400 mt-2">Your entry, exit, SL and TP are pinned on the live chart (midday mark — backtests store dates, not times). Replay shows the trade itself.</p>
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} title="Delete backtest?" body="This backtested trade will be removed." onYes={() => { setRows(rows.filter(r => r.id !== del)); toast.info('Backtest deleted.'); }} />
    </div>
  );
}
