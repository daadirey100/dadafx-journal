import { useEffect, useMemo, useRef, useState } from 'react';
import { calcStats, fmtDuration, fmtMoney, pipSize, tradeDurationMs, tradePL, tradeR, tradeReward, tradeRisk, tradeRR } from '../lib/calc';
import { compressImage, toast, useLocal } from '../lib/store';
import { accountName, accountOptions, DEFAULT_PLAN, PAIRS, SESSIONS, STRATEGIES, TIMEFRAMES, uid, type Trade, type TradeTemplate, type TradingPlan } from '../lib/types';
import { findDuplicateImports, isBrokerTrade, mergeTrade } from '../lib/brokerTrade';
import { costlyMistakeHit } from '../lib/mistakes';
import { SOURCE_LABEL } from '../lib/brokers/registry';
import { Badge, btnGhost, btnPrimary, Card, Confirm, Empty, Field, Glyph, Modal, PageHeader, PLPill, SetupPill, SidePill, Stars, Tabs, inputCls } from '../components/ui';
import Replay from '../components/Replay';

const emptyTrade: Omit<Trade, 'id'> = {
  date: new Date().toISOString().slice(0, 16), pair: 'EUR/USD', direction: 'Buy',
  lot: 0.5, entry: 1.0850, stopLoss: 1.0830, takeProfit: 1.0890, exit: null,
  riskPct: 1, strategy: STRATEGIES[0], session: SESSIONS[0], timeframe: 'H1',
  setup: '', emotions: '', mistakes: '', notes: '', rating: 3,
};

type Tab = 'all' | 'open' | 'win' | 'loss' | 'be';

export default function TradingJournal({ trades, setTrades, query, setQuery, openSignal, onGo, onReplay }: {
  trades: Trade[]; setTrades: (t: Trade[]) => void; query: string; setQuery: (q: string) => void; openSignal: number; onGo: (p: string) => void; onReplay?: (id:string)=>void;
}) {
  const [pair, setPair] = useState('All');
  const [side, setSide] = useState('All');
  const [sess, setSess] = useState('All');
  const [strat, setStrat] = useState('All');
  const [acct, setAcct] = useState('All');
  const [templates, setTemplates] = useLocal<TradeTemplate[]>('dadafx.templates', []);
  const [tplName, setTplName] = useState('');
  const accts = accountOptions();
  const [tab, setTab] = useState<Tab>('all');
  const [sort, setSort] = useState<'new' | 'old' | 'best' | 'worst'>('new');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Trade | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ ...emptyTrade });
  const [exitStr, setExitStr] = useState('');
  const [plan] = useLocal<TradingPlan>('dadafx.plan', DEFAULT_PLAN);
  const [warnOn] = useLocal<boolean>('dadafx.mistakeWarn', true);
  const [replay, setReplay] = useState<Trade | null>(null);
  const [dupMatches, setDupMatches] = useState<Trade[]>([]);
  const pendingRef = useRef<any>(null);
  const editingBroker = !!editing && isBrokerTrade(editing);
  const [replays] = useLocal<any[]>('dadafx.replays', []);
  const replayStats = useMemo(()=>{
    const n=replays.length; if(!n) return null;
    const winsSim=replays.filter((r:any)=>(r.simR??0)>0).length;
    const avgSim=replays.reduce((a:number,r:any)=>a+(r.simR??0),0)/n;
    const avgAct=replays.reduce((a:number,r:any)=>a+(r.actualR??0),0)/n;
    return { n, winsSim, avgSim, avgAct, diff: avgSim-avgAct };
  },[replays]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyTrade, date: new Date().toISOString().slice(0, 16), pair: pair !== 'All' ? pair : 'EUR/USD', followedRules: true });
    setExitStr('');
    setOpen(true);
  };

  useEffect(() => {
    if (openSignal > 0) openNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

  const stats = useMemo(() => calcStats(trades), [trades]);
  const maxDDpct = useMemo(() => {
    let peak = 0, cur = 0, worst = 0;
    const sorted = [...trades].filter(t => t.exit != null).sort((a, b) => a.date.localeCompare(b.date));
    for (const t of sorted) { cur += tradePL(t) ?? 0; peak = Math.max(peak, cur); worst = Math.min(worst, cur - peak); }
    return worst;
  }, [trades]);
  const streak = useMemo(() => {
    const sorted = [...trades].filter(t => t.exit != null).sort((a, b) => b.date.localeCompare(a.date));
    if (!sorted.length) return '—';
    const firstWin = (tradePL(sorted[0]) ?? 0) > 0;
    let n = 0;
    for (const t of sorted) { if (((tradePL(t) ?? 0) > 0) === firstWin) n++; else break; }
    return `${n} ${firstWin ? 'Wins' : 'Losses'}`;
  }, [trades]);

  const counts = useMemo(() => ({
    all: trades.length,
    open: trades.filter(t => t.exit == null).length,
    win: trades.filter(t => (tradePL(t) ?? 0) > 0).length,
    loss: trades.filter(t => (tradePL(t) ?? 0) < 0).length,
    be: trades.filter(t => t.exit != null && (tradePL(t) ?? 0) === 0).length,
  }), [trades]);

  const list = useMemo(() => {
    let r = [...trades];
    if (tab === 'open') r = r.filter(t => t.exit == null);
    if (tab === 'win') r = r.filter(t => (tradePL(t) ?? 0) > 0);
    if (tab === 'loss') r = r.filter(t => (tradePL(t) ?? 0) < 0);
    if (tab === 'be') r = r.filter(t => t.exit != null && (tradePL(t) ?? 0) === 0);
    if (query) r = r.filter(t => (t.pair + t.strategy + t.notes + t.setup + t.session).toLowerCase().includes(query.toLowerCase()));
    if (pair !== 'All') r = r.filter(t => t.pair === pair);
    if (side !== 'All') r = r.filter(t => t.direction === side);
    if (sess !== 'All') r = r.filter(t => t.session === sess);
    if (strat !== 'All') r = r.filter(t => t.strategy === strat);
    if (acct !== 'All') r = r.filter(t => (t.accountId ?? '') === acct);
    if (sort === 'new') r.sort((a, b) => b.date.localeCompare(a.date));
    if (sort === 'old') r.sort((a, b) => a.date.localeCompare(b.date));
    if (sort === 'best') r.sort((a, b) => (tradePL(b) ?? -1e18) - (tradePL(a) ?? -1e18));
    if (sort === 'worst') r.sort((a, b) => (tradePL(a) ?? 1e18) - (tradePL(b) ?? 1e18));
    return r;
  }, [trades, tab, query, pair, side, sess, strat, acct, sort]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const checks = useMemo(() => {
    const day = String(form.date ?? '').slice(0, 10);
    const todayCount = trades.filter(t => t.date.slice(0, 10) === day && (!editing || t.id !== editing.id)).length;
    return [
      { label: `Pair allowed (${form.pair})`, ok: !plan.allowedPairs.length || plan.allowedPairs.includes(form.pair) },
      { label: `Session preferred (${form.session})`, ok: !plan.preferredSessions.length || plan.preferredSessions.includes(form.session) },
      { label: `Risk ${Number(form.riskPct) || 0}% ≤ ${plan.maxDailyRisk}%`, ok: (Number(form.riskPct) || 0) <= plan.maxDailyRisk },
      { label: `Trades today ${todayCount}/${plan.maxTradesPerDay}`, ok: todayCount < plan.maxTradesPerDay },
      { label: 'Followed entry & exit rules', ok: !!form.followedRules, manual: true },
    ];
  }, [form, trades, editing, plan]);
  const planScore = Math.round((checks.filter(c => c.ok).length / checks.length) * 100);

  const buildData = (): any | null => {
    if (!form.pair || !(form.lot > 0) || !(form.entry > 0)) { toast.err('Pair, lot size and entry are required.'); return null; }
    const exit = exitStr.trim() === '' ? null : Number(exitStr);
    if (exitStr.trim() !== '' && !(exit! > 0)) { toast.err('Exit must be a number — or empty for open.'); return null; }
    const { followedRules: _fr, customPair: _cp, exitAt: _ea, ...rest } = form;
    const exitAt = exit == null ? undefined : form.exitAt || undefined;
    const pair = form.pair === '__custom' ? String(form.customPair || '').trim().toUpperCase() : String(form.pair || '').trim().toUpperCase();
    if (!pair) { toast.err('Enter a pair.'); return null; }
    return { ...rest, pair, accountId: form.accountId ?? '', lot: Number(form.lot), entry: Number(form.entry), stopLoss: Number(form.stopLoss), takeProfit: Number(form.takeProfit), riskPct: Number(form.riskPct), rating: Number(form.rating), commission: Number(form.commission) || 0, exit, exitAt, planScore };
  };

  const doSave = (data: any) => {
    const costly = costlyMistakeHit(trades, String(data.mistakes || ''), warnOn);
    if (costly) toast.err(`⚠️ “${costly}” has cost you before — check the Mistake Tracker. Saved anyway.`);
    const msg = planScore >= 80 ? 'Trade logged — follows plan. ✅' : `Trade logged — plan score ${planScore}%. ⚠️`;
    if (editing) {
      // Broker facts are untouchable: the journal half merges onto the frozen original.
      const final = isBrokerTrade(editing)
        ? { ...mergeTrade(editing, {
          strategy: data.strategy, session: data.session, timeframe: data.timeframe, setup: data.setup,
          emotions: data.emotions, mistakes: data.mistakes, notes: data.notes, rating: data.rating,
          riskPct: data.riskPct, stopLoss: data.stopLoss, takeProfit: data.takeProfit,
          screenshot: data.screenshot, beforeShot: data.beforeShot, afterShot: data.afterShot,
          accountId: data.accountId,
        }), planScore }
        : { ...data, id: editing.id };
      setTrades(trades.map(t => (t.id === editing.id ? final : t)));
      toast.ok(msg);
    } else {
      setTrades([{ ...data, source: data.source ?? 'manual', id: uid() }, ...trades]);
      toast.ok(msg);
    }
    setOpen(false);
    setDupMatches([]);
    pendingRef.current = null;
  };

  const save = () => {
    const data = buildData();
    if (!data) return;
    // Accidental-duplicate guard: a fresh MANUAL ticket matching a BROKER
    // row on pair + side + entry + exit is the same fill typed by hand.
    if (!editing && (!data.source || data.source === 'manual')) {
      const matches = findDuplicateImports(trades, {
        pair: data.pair, direction: data.direction, entry: data.entry, exit: data.exit, id: '',
      });
      if (matches.length) {
        pendingRef.current = data;
        setDupMatches(matches);
        return;
      }
    }
    doSave(data);
  };

  const download = (name: string, text: string, type: string) => {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  };
  const exportCSV = () => {
    const rows = [['date', 'pair', 'side', 'lot', 'entry', 'sl', 'tp', 'exit', 'exit_time', 'commission', 'account', 'source', 'external_id', 'pl', 'r_multiple', 'strategy', 'session', 'timeframe', 'rating'],
      ...list.map(t => [t.date, t.pair, t.direction, t.lot, t.entry, t.stopLoss, t.takeProfit, t.exit ?? '', t.exitAt ?? '', t.commission ?? 0, accountName(t.accountId), t.source ?? 'manual', t.externalId ?? '', tradePL(t) ?? '', tradeR(t)?.toFixed(2) ?? '', t.strategy, t.session, t.timeframe, t.rating])];
    download('dadafx-trades.csv', rows.map(r => r.join(',')).join('\n'), 'text/csv');
    toast.ok('CSV exported.');
  };
  const exportJSON = () => {
    download('dadafx-trades.json', JSON.stringify(list, null, 2), 'application/json');
    toast.ok('JSON exported.');
  };

  const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== ''));
  };

  // Broker-friendly import: Pair + Entry required, everything else best-effort.
  const importCSV = async (f: File) => {
    try {
      const rows = parseCSV(await f.text());
      if (rows.length < 2) { toast.err('No data rows found.'); return; }
      const head = rows[0].map(h => h.trim().toLowerCase());
      const idx = (...names: string[]) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
      const c = {
        date: idx('date', 'datetime', 'time', 'open time', 'open_time'),
        pair: idx('pair', 'symbol', 'asset', 'instrument'),
        dir: idx('side', 'direction', 'type'),
        lot: idx('lot', 'lots', 'volume', 'size'),
        entry: idx('entry', 'open', 'price_in', 'open price', 'entry price'),
        sl: idx('sl', 'stop', 'stop loss', 'stop_loss'),
        tp: idx('tp', 'take profit', 'take_profit'),
        exit: idx('exit', 'close', 'price_out', 'close price', 'exit price'),
        exitAt: idx('exit time', 'exit_time', 'close time', 'close_time'),
        comm: idx('commission', 'commissions', 'swap', 'fees', 'cost'),
        acct: idx('account'),
        ext: idx('external_id', 'externalid', 'deal_id', 'dealid', 'ticket'),
        strategy: idx('strategy', 'system'), session: idx('session'),
        tf: idx('timeframe', 'tf'), setup: idx('setup'),
        notes: idx('notes', 'comment', 'note'), rating: idx('rating'),
      };
      if (c.pair < 0 || c.entry < 0) { toast.err('Need at least Pair + Entry columns.'); return; }
      const num = (v = '') => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
      const get = (r: string[], i: number, fb = '') => (i >= 0 && r[i] != null ? r[i].trim() : fb);
      const now = new Date().toISOString().slice(0, 16);
      const haveExt = new Set(trades.map(t => t.externalId).filter(Boolean));
      const made: Trade[] = [];
      let skippedExt = 0;
      for (const r of rows.slice(1)) {
        const pair = get(r, c.pair);
        const entry = num(get(r, c.entry));
        if (!pair || !entry) continue;
        const ext = get(r, c.ext);
        if (ext && haveExt.has(ext)) { skippedExt++; continue; }
        const dv = get(r, c.dir, 'Buy').toLowerCase();
        const exitRaw = get(r, c.exit);
        const acctName = get(r, c.acct);
        const acctHit = accountOptions().find(a => a.name.toLowerCase() === acctName.toLowerCase());
        made.push({
          id: uid(), date: get(r, c.date, now).slice(0, 16) || now, pair,
          direction: dv.includes('sell') || dv.includes('short') || dv === 's' ? 'Sell' : 'Buy',
          accountId: acctHit ? acctHit.id : '',
          externalId: ext || undefined, source: ext ? undefined : 'manual',
          lot: num(get(r, c.lot, '0.5')) || 0.5, entry,
          stopLoss: num(get(r, c.sl)), takeProfit: num(get(r, c.tp)),
          exit: exitRaw ? num(exitRaw) : null, exitAt: exitRaw && get(r, c.exitAt) ? get(r, c.exitAt).slice(0, 16) : undefined, commission: num(get(r, c.comm)), riskPct: 1,
          strategy: get(r, c.strategy, 'Imported'), session: get(r, c.session, 'London'),
          timeframe: get(r, c.tf, 'H1'), setup: get(r, c.setup),
          emotions: '', mistakes: '', notes: get(r, c.notes), rating: num(get(r, c.rating, '3')) || 3,
        });
      }
      if (!made.length) { toast.err(skippedExt ? 'All rows already journaled.' : 'No valid rows (need Pair + Entry).'); return; }
      setTrades([...made.reverse(), ...trades]);
      toast.ok(`Imported ${made.length} trades.${skippedExt ? ` ${skippedExt} duplicates skipped.` : ''}`);
    } catch { toast.err('Could not read that file.'); }
  };

  const liveRisk = tradeRisk({ direction: form.direction, lot: Number(form.lot) || 0, entry: Number(form.entry) || 0, stopLoss: Number(form.stopLoss) || 0, pair: form.pair });
  const liveReward = tradeReward({ direction: form.direction, lot: Number(form.lot) || 0, entry: Number(form.entry) || 0, takeProfit: Number(form.takeProfit) || 0, pair: form.pair });
  const liveRR = tradeRR({ entry: Number(form.entry) || 0, stopLoss: Number(form.stopLoss) || 0, takeProfit: Number(form.takeProfit) || 0 });

  const strip: [string, string, string][] = [
    ['Win rate', `${stats.winRate.toFixed(1)}%`, 'text-slate-900 dark:text-white'],
    ['Profit factor', stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2), stats.profitFactor >= 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'],
    ['Avg R:R multiplier', `1 : ${stats.avgR.toFixed(2)}`, stats.avgR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'],
    ['Max drawdown', fmtMoney(maxDDpct), 'text-red-600 dark:text-red-400'],
    ['Current streak', streak, streak.includes('Wins') ? 'text-emerald-600 dark:text-emerald-400' : streak.includes('Losses') ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'],
  ];

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Institutional ledger · sync active" title="Trading Journal"
        sub="Real-time execution performance, psychological review & R-multiple accounting — replay any trade like live."
        right={<>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-sm font-bold mr-1">📈 Net P/L: <span className={`num ${stats.totalPL > 0 ? 'text-emerald-600' : stats.totalPL < 0 ? 'text-red-600' : ''}`}>{stats.totalPL >= 0 ? '+' : ''}{fmtMoney(stats.totalPL)}</span>
            <Badge tone={stats.winRate >= 50 ? 'green' : 'amber'}>{stats.winRate.toFixed(1)}% WR</Badge></span>
          <button className={btnGhost} onClick={()=> onReplay ? onReplay(trades.filter(t=>t.exit!=null)[0]?.id ?? '') : onGo('replay')}><Glyph name="bolt" className="w-4 h-4" />Trade Replay</button>
          <button className={btnPrimary} onClick={openNew}><Glyph name="plus" className="w-4 h-4" />Log New Trade <kbd className="text-[10px] font-bold bg-white/20 rounded px-1.5 py-0.5">N</kbd></button>
        </>} />

      {/* Replay Analytics — Trading Journal dashboard */}
      {replayStats && (
        <Card className="!p-3 border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-xs tracking-widest">REPLAY ANALYTICS</h3>
            <button onClick={()=> onReplay ? onReplay(trades.filter(t=>t.exit!=null)[0]?.id ?? '') : onGo('replay')} className="text-xs font-bold text-indigo-600 hover:underline">Open Trade Replay →</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2 text-xs">
            <div className="rounded-xl bg-white dark:bg-slate-900 border p-2"><p className="text-[10px] font-black tracking-widest text-slate-400">REPLAYED</p><p className="font-black text-lg num">{replayStats.n}</p></div>
            <div className="rounded-xl bg-white dark:bg-slate-900 border p-2"><p className="text-[10px] font-black tracking-widest text-slate-400">SIM WIN%</p><p className="font-black text-lg num">{((replayStats.winsSim/replayStats.n)*100).toFixed(1)}%</p></div>
            <div className="rounded-xl bg-white dark:bg-slate-900 border p-2"><p className="text-[10px] font-black tracking-widest text-slate-400">AVG SIM R</p><p className={`font-black text-lg num ${replayStats.avgSim>=0?'text-emerald-600':'text-red-600'}`}>{replayStats.avgSim>=0?'+':''}{replayStats.avgSim.toFixed(2)}R</p></div>
            <div className="rounded-xl bg-white dark:bg-slate-900 border p-2"><p className="text-[10px] font-black tracking-widest text-slate-400">AVG ACT R</p><p className={`font-black text-lg num ${replayStats.avgAct>=0?'text-emerald-600':'text-red-600'}`}>{replayStats.avgAct>=0?'+':''}{replayStats.avgAct.toFixed(2)}R</p></div>
            <div className="rounded-xl bg-white dark:bg-slate-900 border p-2"><p className="text-[10px] font-black tracking-widest text-slate-400">SIM-ACT Δ</p><p className={`font-black text-lg num ${replayStats.diff>=0?'text-emerald-600':'text-red-600'}`}>{replayStats.diff>=0?'+':''}{replayStats.diff.toFixed(2)}R</p></div>
          </div>
        </Card>
      )}
      {/* filter bar */}
      <Card className="!p-3">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          <div className="relative col-span-2 md:col-span-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">⌕</span>
            <input className={`${inputCls} !pl-9`} placeholder="Search asset, notes, setup…" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <select className={inputCls} value={acct} onChange={e => setAcct(e.target.value)} aria-label="Account">
            <option value="All">Account: All</option>{accts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {[['Pair', pair, setPair, ['All', ...PAIRS]], ['Direction', side, setSide, ['All', 'Buy', 'Sell']], ['Session', sess, setSess, ['All', ...SESSIONS]], ['Strategy', strat, setStrat, ['All', ...STRATEGIES]]].map(([l, v, fn, opts]: any) => (
            <select key={l as string} className={inputCls} value={v} onChange={e => fn(e.target.value)} aria-label={l as string}>
              {opts.map((o: string) => <option key={o} value={o}>{l === 'Pair' && o === 'All' ? 'Pair: All Assets' : o === 'All' ? `${l}: All` : o}</option>)}
            </select>
          ))}
          <select className={inputCls} value={tab} onChange={e => setTab(e.target.value as Tab)} aria-label="Outcome">
            <option value="all">Outcome: All</option><option value="win">Outcome: Winners</option><option value="loss">Outcome: Losers</option><option value="open">Outcome: Open</option>
          </select>
        </div>
        {/* stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 mt-2 [&>*:last-child]:max-xl:col-span-2">
          {strip.map(([l, v, c]) => (
            <div key={l} className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 px-3 py-2">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{l}</p>
              <p className={`font-display font-extrabold text-lg num ${c}`}>{v}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* tabs + export */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs<Tab> value={tab} onChange={setTab} options={[
          { id: 'all', label: 'All Trades', count: counts.all },
          { id: 'open', label: 'Open Positions', count: counts.open },
          { id: 'win', label: 'Winning Trades', count: counts.win },
          { id: 'loss', label: 'Losing Trades', count: counts.loss },
          { id: 'be', label: 'Break Even', count: counts.be },
        ]} />
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
          <select className="h-9 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300" value={sort} onChange={e => setSort(e.target.value as any)} aria-label="Sort">
            <option value="new">Sort: Newest</option>
            <option value="old">Sort: Oldest</option>
            <option value="best">Sort: Best P/L</option>
            <option value="worst">Sort: Worst P/L</option>
          </select>
          EXPORT
          <button onClick={exportCSV} className={btnGhost + ' !h-9 !px-2.5 !text-xs'}><Glyph name="download" className="w-3.5 h-3.5" />CSV</button>
          <button onClick={exportJSON} className={btnGhost + ' !h-9 !px-2.5 !text-xs'}>{'{ }'} JSON</button>
          <label className={btnGhost + ' !h-9 !px-2.5 !text-xs cursor-pointer'}><Glyph name="upload" className="w-3.5 h-3.5" />Import
            <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importCSV(f); e.target.value = ''; }} />
          </label>
        </div>
      </div>

      {/* ledger */}
      <Card pad={false} className="overflow-hidden">
        {list.length === 0 ? (
          <Empty icon="📝" title="No trades match" hint="Adjust filters — or log a trade with entry, SL, TP and exit. P/L and R calculate automatically." action={<button className={btnPrimary} onClick={openNew}>⊕ Log New Trade</button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger w-full text-sm min-w-[1120px]">
              <thead><tr><th className="!pl-4">Date & Time</th><th>Pair / Dir</th><th>Session</th><th className="text-right">Lots</th><th className="text-right">Entry</th><th className="text-right">SL / TP</th><th className="text-right">Exit</th><th className="text-right">Pips</th><th className="text-right">Plan R:R</th><th className="text-right">Real R</th><th className="text-right">Net P/L</th><th>Strategy</th><th className="!pr-4">★</th></tr></thead>
              <tbody>
                {list.map(t => {
                  const pl = tradePL(t);
                  const rr = tradeRR(t);
                  const ps = pipSize(t.pair);
                  const pips = pl == null || t.exit == null ? null : ((t.direction === 'Buy' ? t.exit - t.entry : t.entry - t.exit) / ps);
                  return (
                    <tr key={t.id} className="group">
                      <td className="!pl-4 num text-[11px] text-slate-500 leading-tight whitespace-nowrap">{t.date.slice(0, 10)}<br />{t.date.slice(11, 16) || '—'} UTC{(() => { const d = tradeDurationMs(t); return d != null ? <><br /><span className="text-indigo-500 font-bold">◷ {fmtDuration(d)}</span></> : null; })()}</td>
                      <td className="whitespace-nowrap font-extrabold leading-tight">{t.pair} <SidePill side={t.direction} /><span className="block text-[10px] font-bold text-slate-400">{accountName(t.accountId)}{t.source && t.source !== 'manual' ? ` · Source: ${SOURCE_LABEL[t.source] ?? t.source}` : ''}</span></td>
                      <td><SetupPill>{t.session || '—'}</SetupPill></td>
                      <td className="text-right num">{t.lot.toFixed(2)}</td>
                      <td className="text-right num">{t.entry}</td>
                      <td className="text-right num text-xs leading-relaxed whitespace-nowrap"><span className="text-red-600 font-semibold">{t.stopLoss}</span><br /><span className="text-emerald-600 font-semibold">{t.takeProfit}</span></td>
                      <td className="text-right num">{t.exit ?? <Badge tone="gray">OPEN</Badge>}</td>
                      <td className={`text-right num font-bold ${pips == null ? '' : pips >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{pips == null ? '—' : `${pips >= 0 ? '+' : ''}${pips.toFixed(1)}`}</td>
                      <td className="text-right"><span className="inline-flex h-6 px-2 items-center rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-extrabold num">{rr == null ? '—' : `1:${rr.toFixed(2)}`}</span></td>
                      <td className={`text-right num font-extrabold ${(() => { const r = tradeR(t); return r == null ? 'text-slate-400' : r >= 0 ? 'text-emerald-600' : 'text-red-600'; })()}`}>{(() => { const r = tradeR(t); return r == null ? '—' : `${r >= 0 ? '+' : ''}${r.toFixed(2)}R`; })()}</td>
                      <td><PLPill value={pl} format={v => `${v < 0 ? '−' : '+'}${fmtMoney(Math.abs(v)).slice(0)}`} /></td>
                      <td className="text-xs font-semibold text-slate-600 dark:text-slate-300 max-w-[150px]">
                        <span className="block truncate">{t.strategy}</span>
                        <span className="block truncate text-slate-400 font-normal">{t.setup || '—'}</span>
                      </td>
                      <td className="!pr-4 whitespace-nowrap"><Stars n={t.rating} />
                        <span className="ml-1.5 inline-flex gap-1 align-middle">
                          {t.source && t.source !== 'manual' && <span title={`Auto-imported from ${t.source} · ${t.externalId ?? ''}`} className="inline-flex items-center h-5 px-1.5 rounded-md bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-200 text-[10px] font-extrabold">{t.source === 'oanda' ? 'OANDA' : t.source === 'ctrader' ? 'cTrader' : 'MT5'}</span>}
                          {t.beforeShot && <span title="Before screenshot attached" className="inline-flex items-center h-5 px-1.5 rounded-md bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 text-[10px] font-extrabold">B</span>}
                          {(t.afterShot || t.screenshot) && <span title="After screenshot attached" className="inline-flex items-center h-5 px-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-200 text-[10px] font-extrabold">A</span>}
                          {t.planScore != null && <span title={`Plan compliance: ${t.planScore}%`} className={`inline-flex items-center h-5 px-1.5 rounded-md text-[10px] font-extrabold num ${t.planScore >= 80 ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-200' : t.planScore >= 50 ? 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-200' : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200'}`}>✓{t.planScore}</span>}
                        </span>
                        <span className="ml-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition">
                          <button onClick={() => onReplay ? onReplay(t.id) : setReplay(t)} className="text-[11px] font-black text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-1 rounded-full mr-1">▶ Replay</button>
                          <button onClick={() => { setEditing(t); setForm({ ...t, followedRules: true }); setExitStr(t.exit == null ? '' : String(t.exit)); setOpen(true); }} className="text-[11px] font-bold text-indigo-600 hover:underline mr-1.5">Edit</button>
                          <button onClick={() => setConfirmId(t.id)} className="text-[11px] font-bold text-red-600 hover:underline">Del</button>
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
          <span>Showing <b className="text-slate-800 dark:text-slate-200">{list.length}</b> of <b className="text-slate-800 dark:text-slate-200">{trades.length}</b> trade records</span>
          <span className="num">R-total {trades.reduce((a, t) => a + (tradeR(t) ?? 0), 0).toFixed(2)}R</span>
        </div>
      </Card>

      {/* trade modal */}
      <Modal open={open} onClose={() => setOpen(false)} eyebrow="Trade ticket" title={editing ? 'Edit trade' : 'Log New Trade'} wide>
        {editingBroker && editing && (
          <div className="mb-3 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/30 px-3.5 py-2.5 text-[13px] text-sky-800 dark:text-sky-200">
            <b>Broker record</b> — entry, exit, size, P/L and timestamps are locked{(editing.externalId ? ` (${editing.externalId})` : '')}. Everything below (setup, psychology, notes, screenshots, rating) is yours to journal.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 mb-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-3 py-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Template</span>
          <select className="h-9 px-2 rounded-lg bg-white/70 dark:bg-slate-950/50 border border-white/60 dark:border-white/10 text-xs font-bold" value="" onChange={e => {
            const t = templates.find(x => x.id === e.target.value);
            if (t) { setForm((f: any) => ({ ...f, ...t.data })); toast.info(`Applied “${t.name}”.`); }
          }} aria-label="Apply template">
            <option value="">Apply saved setup…</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input className="h-9 px-2 rounded-lg bg-white/70 dark:bg-slate-950/50 border border-white/60 dark:border-white/10 text-xs w-36" placeholder="Name this setup…" value={tplName} onChange={e => setTplName(e.target.value)} />
          <button type="button" className="text-[11px] font-extrabold text-indigo-600 hover:underline" onClick={() => {
            const name = tplName.trim() || `${form.pair} ${form.strategy}`;
            setTemplates([{ id: uid(), name, data: { pair: form.pair, direction: form.direction, lot: Number(form.lot) || 0.5, riskPct: Number(form.riskPct) || 1, strategy: form.strategy, session: form.session, timeframe: form.timeframe, setup: form.setup } }, ...templates]);
            setTplName('');
            toast.ok(`Template “${name}” saved.`);
          }}>Save setup</button>
          {templates.length > 0 && <button type="button" className="text-[11px] font-bold text-red-500 hover:underline ml-auto" onClick={() => { setTemplates([]); toast.info('Templates cleared.'); }}>Clear all</button>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Account"><select className={inputCls} value={form.accountId ?? ''} onChange={e => set('accountId', e.target.value)}>{accountOptions().map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Date / time"><input type="datetime-local" className={inputCls} value={form.date} disabled={editingBroker} title={editingBroker ? 'Locked broker fact' : undefined} onChange={e => set('date', e.target.value)} /></Field>
          <Field label="Pair">
            <select className={inputCls} value={PAIRS.includes(form.pair) ? form.pair : '__custom'} disabled={editingBroker} title={editingBroker ? 'Locked broker fact' : undefined} onChange={e => set('pair', e.target.value)}>
              {PAIRS.map(p => <option key={p}>{p}</option>)}
              <option value="__custom">＋ Custom pair…</option>
            </select>
            {!PAIRS.includes(form.pair) && <input className={`${inputCls} mt-2 num`} value={form.pair === '__custom' ? (form.customPair ?? '') : form.pair} onChange={e => set('pair', e.target.value.toUpperCase())} placeholder="e.g. US30, ETH/USD" />}
          </Field>
          <Field label="Buy / Sell">
            <div className="flex gap-2">
              {(['Buy', 'Sell'] as const).map(d => (
                <button key={d} type="button" disabled={editingBroker} onClick={() => set('direction', d)} className={`flex-1 h-10 rounded-lg text-sm font-extrabold border transition disabled:cursor-not-allowed disabled:opacity-55 ${form.direction === d ? (d === 'Buy' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-red-600 text-white border-red-600') : 'border-slate-300 dark:border-slate-700 text-slate-500'}`}>{d}</button>
              ))}
            </div>
          </Field>
          <Field label="Lot size"><input type="number" step="0.01" className={`${inputCls} num`} value={form.lot} disabled={editingBroker} title={editingBroker ? 'Locked broker fact' : undefined} onChange={e => set('lot', e.target.value)} /></Field>
          <Field label="Entry"><input type="number" step="0.00001" className={`${inputCls} num`} value={form.entry} disabled={editingBroker} title={editingBroker ? 'Locked broker fact' : undefined} onChange={e => set('entry', e.target.value)} /></Field>
          <Field label="Exit (empty = open)"><input type="number" step="0.00001" className={`${inputCls} num`} placeholder="Leave empty if open" value={exitStr} disabled={editingBroker} title={editingBroker ? 'Locked broker fact' : undefined} onChange={e => setExitStr(e.target.value)} /></Field>
          <Field label="Exit time (for duration)"><input type="datetime-local" className={inputCls} value={form.exitAt ?? ''} disabled={editingBroker} title={editingBroker ? 'Locked broker fact' : undefined} onChange={e => set('exitAt', e.target.value)} /></Field>
          <Field label="Stop loss"><input type="number" step="0.00001" className={`${inputCls} num`} value={form.stopLoss} onChange={e => set('stopLoss', e.target.value)} /></Field>
          <Field label="Take profit"><input type="number" step="0.00001" className={`${inputCls} num`} value={form.takeProfit} onChange={e => set('takeProfit', e.target.value)} /></Field>
          <Field label="Risk %"><input type="number" step="0.1" className={`${inputCls} num`} value={form.riskPct} onChange={e => set('riskPct', e.target.value)} /></Field>
          <Field label="Commission + swap ($)"><input type="number" step="0.01" className={`${inputCls} num`} value={form.commission ?? 0} disabled={editingBroker} title={editingBroker ? 'Locked broker fact' : undefined} onChange={e => set('commission', e.target.value)} /></Field>
          <Field label="Strategy"><select className={inputCls} value={form.strategy} onChange={e => set('strategy', e.target.value)}>{STRATEGIES.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Session"><select className={inputCls} value={form.session} onChange={e => set('session', e.target.value)}>{SESSIONS.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Timeframe"><select className={inputCls} value={form.timeframe} onChange={e => set('timeframe', e.target.value)}>{TIMEFRAMES.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Setup"><input className={inputCls} value={form.setup} onChange={e => set('setup', e.target.value)} placeholder="e.g. Break + retest" /></Field>
          <Field label="Emotions"><input className={inputCls} value={form.emotions} onChange={e => set('emotions', e.target.value)} placeholder="e.g. Calm, patient" /></Field>
          <Field label="Mistakes"><input className={inputCls} value={form.mistakes} onChange={e => set('mistakes', e.target.value)} placeholder="e.g. Early entry" /></Field>
          <Field label="Rating (1-5)"><select className={inputCls} value={form.rating} onChange={e => set('rating', Number(e.target.value))}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} ★</option>)}</select></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="📷 Before — entry setup"><input type="file" accept="image/*" className="text-xs mt-2" onChange={async e => { const f = e.target.files?.[0]; if (f) { try { set('beforeShot', await compressImage(f)); } catch { toast.err('Could not read that image.'); } e.target.value = ''; } }} /></Field>
            <Field label="📷 After — trade result"><input type="file" accept="image/*" className="text-xs mt-2" onChange={async e => { const f = e.target.files?.[0]; if (f) { try { set('afterShot', await compressImage(f)); } catch { toast.err('Could not read that image.'); } e.target.value = ''; } }} /></Field>
          </div>
          <div className="sm:col-span-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/40 px-3 py-2 text-xs font-bold"><span className="text-red-700 dark:text-red-300">Risk if SL:</span> <span className="num text-red-600">−{fmtMoney(liveRisk)}</span></span>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/40 px-3 py-2 text-xs font-bold"><span className="text-emerald-700 dark:text-emerald-300">Gain if TP:</span> <span className="num text-emerald-600">+{fmtMoney(liveReward)}</span></span>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/40 px-3 py-2 text-xs font-bold"><span className="text-indigo-700 dark:text-indigo-300">R:R</span> <span className="num text-indigo-700 dark:text-indigo-300">1:{liveRR?.toFixed(2) ?? '-'}</span></span>
          </div>
        </div>
        <Field label="Notes"><textarea rows={3} className={`${inputCls} !h-auto py-2`} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Why did you take this trade? What happened?" /></Field>

        {/* plan compliance */}
        <div className={`mt-3 rounded-2xl border px-3.5 py-3 ${planScore >= 80 ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30' : planScore >= 50 ? 'border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30' : 'border-red-300 dark:border-red-800 bg-red-50/60 dark:bg-red-950/30'}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">✅ Does this trade follow your plan?</p>
            <span className={`inline-flex items-center h-7 px-3 rounded-full text-sm font-extrabold num ${planScore >= 80 ? 'bg-emerald-500 text-white' : planScore >= 50 ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'}`}>{planScore}%</span>
          </div>
          <div className="mt-2 space-y-1.5">
            {checks.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-[13px] font-medium">
                <span className={`w-5 h-5 rounded-md text-xs font-extrabold flex items-center justify-center shrink-0 ${c.ok ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>{c.ok ? '✓' : '✕'}</span>
                <span className={c.ok ? 'text-slate-700 dark:text-slate-200' : 'text-red-700 dark:text-red-300 font-bold'}>{c.label}</span>
                {c.manual && (
                  <button type="button" onClick={() => set('followedRules', !form.followedRules)} className={`ml-auto h-7 px-3 rounded-lg text-[11px] font-extrabold border transition ${form.followedRules ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-300 dark:border-slate-600 text-slate-500'}`}>
                    {form.followedRules ? '✓ I followed the rules' : 'Mark as followed'}
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => { setOpen(false); onGo('plan'); }} className="mt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Edit my plan →</button>
        </div>
        {(form.beforeShot || form.afterShot || form.screenshot) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Before — setup</p>
              {form.beforeShot ? <img src={form.beforeShot} alt="Before trade" className="rounded-xl border max-h-48 w-full object-cover" /> : <p className="text-xs text-slate-400 border border-dashed rounded-xl p-4 text-center">No before shot</p>}
            </div>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">After — result</p>
              {(form.afterShot || form.screenshot) ? <img src={form.afterShot || form.screenshot} alt="After trade" className="rounded-xl border max-h-48 w-full object-cover" /> : <p className="text-xs text-slate-400 border border-dashed rounded-xl p-4 text-center">No after shot</p>}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button className={btnGhost} onClick={() => setOpen(false)}>Cancel</button>
          <button className={btnPrimary} onClick={save}>{editing ? 'Save changes' : 'Log trade'}</button>
        </div>
      </Modal>

      <Modal open={dupMatches.length > 0} onClose={() => { setDupMatches([]); pendingRef.current = null; }} title="Already in your journal?" eyebrow="Duplicate guard">
        <p className="text-sm text-slate-600 dark:text-slate-300">This looks like {dupMatches.length === 1 ? 'a trade your broker already imported' : `${dupMatches.length} trades your broker already imported`} — saving again would double-count it:</p>
        <div className="space-y-1.5 mt-3">
          {dupMatches.map(t => (
            <div key={t.id} className="flex items-center gap-2 text-xs rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/30 px-3 py-2">
              <span className="font-extrabold">{t.pair} {t.direction}</span>
              <span className="num text-slate-500">{t.entry} → {t.exit}</span>
              <span className="ml-auto font-bold text-sky-700 dark:text-sky-300">Source: {SOURCE_LABEL[t.source ?? 'manual'] ?? t.source}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className={btnGhost} onClick={() => {
            const first = dupMatches[0];
            setDupMatches([]); pendingRef.current = null; setOpen(false);
            if (first) { setEditing(first); setForm({ ...first, followedRules: true }); setExitStr(first.exit == null ? '' : String(first.exit)); setOpen(true); }
          }}>Open existing instead</button>
          <button className={btnPrimary} onClick={() => { const d = pendingRef.current; if (d) doSave(d); }}>Save anyway</button>
        </div>
      </Modal>
      {replay && <Replay trade={replay} onClose={() => setReplay(null)} />}
      <Confirm open={!!confirmId} onClose={() => setConfirmId(null)} title="Delete trade?" body="This trade will be permanently removed from your journal. This cannot be undone." onYes={() => { setTrades(trades.filter(t => t.id !== confirmId)); toast.info('Trade deleted.'); }} />
    </div>
  );
}
