import { useMemo, useState } from 'react';
import { fmtMoney, tradePL, tradeR } from '../lib/calc';
import { compressImage, toast } from '../lib/store';
import { MOODS, todayISO, uid, type DailyEntry, type Trade } from '../lib/types';
import { Badge, btnGhost, btnPrimary, Card, Confirm, Empty, Field, Modal, PageHeader, inputCls } from '../components/ui';

export default function DailyJournal({ entries, setEntries, trades, onGo }: {
  entries: DailyEntry[]; setEntries: (e: DailyEntry[]) => void; trades: Trade[]; onGo: (p: string) => void;
}) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [sel, setSel] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ mood: 'Calm', bias: '', preparation: '', execution: '', lessons: '' });

  const byDate = useMemo(() => new Map(entries.map(e => [e.date, e])), [entries]);
  const tradesByDay = useMemo(() => {
    const m = new Map<string, Trade[]>();
    for (const t of trades) {
      const d = t.date.slice(0, 10);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(t);
    }
    return m;
  }, [trades]);
  const dayPL = (d: string) => (tradesByDay.get(d) ?? []).reduce((a, t) => a + (tradePL(t) ?? 0), 0);

  const days = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const startPad = (first.getDay() + 6) % 7; // Monday-first
    const dim = new Date(y, m, 0).getDate();
    const cells: (string | null)[] = [...Array(startPad).fill(null)];
    for (let d = 1; d <= dim; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
    return cells;
  }, [month]);

  const openFor = (date: string) => {
    const ex = byDate.get(date);
    setSel(date);
    setForm(ex ? { ...ex } : { mood: 'Calm', bias: '', preparation: '', execution: '', lessons: '' });
    setOpen(true);
  };

  const save = () => {
    if (!sel) return;
    const ex = byDate.get(sel);
    if (ex) setEntries(entries.map(e => (e.date === sel ? { ...e, ...form } : e)));
    else setEntries([{ id: uid(), date: sel, ...form }, ...entries]);
    toast.ok('Daily entry saved.');
    setOpen(false);
  };

  const selTrades = sel ? tradesByDay.get(sel) ?? [] : [];
  const selPL = sel ? dayPL(sel) : 0;

  const streak = useMemo(()=>{
    const dates = new Set(entries.map(e=>e.date));
    let cur=0; let best=0; let tmp=0;
    // longest
    const sorted = [...dates].sort();
    for(let i=0;i<sorted.length;i++){
      if(i===0) tmp=1;
      else {
        const prev = new Date(sorted[i-1]); const curD = new Date(sorted[i]);
        const diff = (curD.getTime()-prev.getTime())/864e5;
        tmp = diff===1 ? tmp+1 : 1;
      }
      best = Math.max(best, tmp);
    }
    // current streak backwards from today
    let d = new Date(todayISO());
    while(true){
      const iso = d.toISOString().slice(0,10);
      if(dates.has(iso)){ cur++; d.setDate(d.getDate()-1); } else break;
      if(cur>365) break;
    }
    return {cur, best, total: entries.length, pct: entries.length ? Math.round((new Set(entries.map(e=>e.date.slice(0,7))).size / 12)*100) : 0 };
  },[entries]);

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Psychology & routine" title="Daily Journal" sub="One entry per day — mood, bias, review, lessons. Your trades auto-attach to each day."
        right={<>
          <input type="month" className={`${inputCls} !w-40`} value={month} onChange={e => setMonth(e.target.value)} aria-label="Month" />
          <button className={btnPrimary} onClick={() => openFor(todayISO())}>Today's entry</button>
        </>} />

      <div className="grid grid-cols-3 gap-2">
        <Card className="!py-3 text-center"><p className="text-[11px] font-bold uppercase text-slate-400">Current streak</p><p className={`font-display font-extrabold text-2xl num ${streak.cur>=7?'text-emerald-600':streak.cur>=3?'text-amber-600':'text-slate-800 dark:text-white'}`}>{streak.cur} 🔥</p><p className="text-[11px] text-slate-500">{streak.cur? 'days journaling' : 'start today'}</p></Card>
        <Card className="!py-3 text-center"><p className="text-[11px] font-bold uppercase text-slate-400">Longest</p><p className="font-display font-extrabold text-2xl num">{streak.best}</p><p className="text-[11px] text-slate-500">days</p></Card>
        <Card className="!py-3 text-center"><p className="text-[11px] font-bold uppercase text-slate-400">Total entries</p><p className="font-display font-extrabold text-2xl num">{streak.total}</p><p className="text-[11px] text-slate-500">all time</p></Card>
      </div>

      <Card>
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold text-slate-400 mb-1.5">
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => <span key={d}>{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d, i) => {
            if (d == null) return <span key={i} />;
            const hasEntry = byDate.has(d);
            const dayTrades = tradesByDay.get(d) ?? [];
            const closed = dayTrades.filter(t => t.exit != null);
            const pl = dayPL(d);
            const rTotal = dayTrades.reduce((a, t) => a + (tradeR(t) ?? 0), 0);
            const state = closed.length === 0 ? 'flat' : pl > 0 ? 'win' : pl < 0 ? 'loss' : 'flat';
            // heatmap depth scales with R size (0R → faint, 4R+ → full)
            const depth = state === 'flat' ? 0 : 0.1 + 0.3 * Math.min(1, Math.abs(rTotal) / 4);
            const heat = state === 'win' ? { backgroundColor: `rgba(5,150,105,${depth})` }
              : state === 'loss' ? { backgroundColor: `rgba(220,38,38,${depth})` } : undefined;
            const cellBg = state === 'win'
              ? 'border-emerald-400/70 dark:border-emerald-400/40'
              : state === 'loss'
                ? 'border-red-400/70 dark:border-red-400/40'
                : hasEntry
                  ? 'bg-white/70 dark:bg-white/5 border-indigo-300 dark:border-indigo-400/50 ring-1 ring-indigo-200 dark:ring-indigo-400/30'
                  : 'bg-white/60 dark:bg-white/5 border-white/60 dark:border-white/10 hover:border-indigo-300 dark:hover:border-indigo-400/50';
            const numColor = state === 'win' ? 'text-emerald-800 dark:text-emerald-200'
              : state === 'loss' ? 'text-red-800 dark:text-red-200'
              : d === todayISO() ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200';
            return (
              <button key={d} onClick={() => openFor(d)} style={heat}
                className={`min-h-[66px] sm:min-h-[84px] rounded-xl border-2 p-1 sm:p-1.5 text-left text-xs transition ${cellBg} ${d === todayISO() ? '!border-indigo-500 ring-2 ring-indigo-500/40' : ''}`}>
                <span className={`num font-extrabold ${numColor}`}>{Number(d.slice(8))}</span>
                {closed.length > 0 && (
                  <span className={`block font-display font-extrabold text-[13px] sm:text-[15px] leading-tight num ${state === 'win' ? 'text-emerald-700 dark:text-emerald-300' : state === 'loss' ? 'text-red-700 dark:text-red-300' : 'text-slate-500'}`}>
                    {rTotal >= 0 ? '+' : ''}{rTotal.toFixed(1)}R
                  </span>
                )}
                {hasEntry && <span className="block truncate text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">😊 {byDate.get(d)!.mood}</span>}
                {dayTrades.length > 0 && (
                  <span className="block text-[10px] font-bold num text-slate-500 dark:text-slate-400">
                    {closed.length}/{dayTrades.length}T · {pl >= 0 ? '+' : ''}{fmtMoney(pl)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-500 mt-2">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: 'rgba(5,150,105,.35)' }} /> Profit day</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: 'rgba(220,38,38,.35)' }} /> Loss day</span>
          <span className="text-slate-400">Big number = day's R-multiple · deeper color = bigger R · click any day to see all its trades.</span>
        </div>
      </Card>

      <Card pad={false}>
        <div className="px-4 py-3 font-display font-extrabold tracking-tight text-slate-900 dark:text-white">All entries</div>
        {entries.length === 0 ? <Empty icon="📔" title="No daily entries yet" hint="Tap any calendar day to write your market preparation and review." /> : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[...entries].sort((a, b) => b.date.localeCompare(a.date)).map(e => {
              const dt = tradesByDay.get(e.date) ?? [];
              const pl = dayPL(e.date);
              return (
                <div key={e.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                      <span className="num">{e.date}</span> <Badge tone="indigo">{e.mood}</Badge>
                      {dt.length > 0 && <Badge tone={pl >= 0 ? 'green' : 'red'}>{dt.length} trades · {pl >= 0 ? '+' : ''}{fmtMoney(pl)}</Badge>}
                    </p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">Bias: {e.bias || '—'} · Lessons: {e.lessons || '—'}</p>
                  </div>
                  <button onClick={() => openFor(e.date)} className="text-xs font-bold text-indigo-600 hover:underline shrink-0">Open</button>
                  <button onClick={() => setDel(e.id)} className="text-xs font-bold text-red-500 hover:underline shrink-0">Delete</button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} eyebrow={sel === todayISO() ? "Today's entry" : 'Daily entry'} title={sel ?? ''} wide>
        {/* linked trades */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 px-3.5 py-3 mb-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">📊 Linked trades · {selTrades.length} <span className={`num ml-1 ${selPL >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{selPL >= 0 ? '+' : ''}{fmtMoney(selPL)}</span></p>
            <button onClick={() => { setOpen(false); onGo('journal'); }} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Open Trading Journal →</button>
          </div>
          {selTrades.length === 0 ? (
            <p className="text-xs text-slate-400 mt-1.5">No trades logged this day yet — they appear here automatically once you log them.</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {selTrades.map(t => {
                const pl = tradePL(t);
                const r = tradeR(t);
                return (
                  <div key={t.id} className="flex items-center gap-2 text-xs bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg px-2.5 py-1.5">
                    <span className="font-extrabold">{t.pair}</span>
                    <span className={`font-bold ${t.direction === 'Buy' ? 'text-emerald-600' : 'text-red-500'}`}>{t.direction.toUpperCase()}</span>
                    <span className="num text-slate-500">{t.lot} lots</span>
                    {r != null && <span className={`num font-extrabold ${r >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{r >= 0 ? '+' : ''}{r.toFixed(1)}R</span>}
                    <span className={`num font-extrabold ml-auto ${pl == null ? 'text-slate-400' : pl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{pl == null ? 'OPEN' : `${pl >= 0 ? '+' : ''}${fmtMoney(pl)}`}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Mood"><select className={inputCls} value={form.mood} onChange={e => setForm({ ...form, mood: e.target.value })}>{MOODS.map(m => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Market bias"><input className={inputCls} value={form.bias} onChange={e => setForm({ ...form, bias: e.target.value })} placeholder="e.g. Bullish DXY, bearish EUR/USD" /></Field>
        </div>
        {[['preparation', 'Preparation / game plan'], ['execution', 'Execution review'], ['lessons', 'Lessons learned']].map(([k, l]) => (
          <div key={k} className="mt-3"><Field label={l}><textarea rows={3} className={`${inputCls} !h-auto py-2`} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} /></Field></div>
        ))}
        <div className="mt-3"><Field label="Screenshot"><input type="file" accept="image/*" className="text-xs mt-1.5" onChange={async e => { const f = e.target.files?.[0]; if (f) { try { setForm({ ...form, screenshot: await compressImage(f) }); } catch { toast.err('Could not read that image.'); } } }} /></Field></div>
        {form.screenshot && <img src={form.screenshot} className="mt-3 rounded-xl border max-h-48" alt="Daily screenshot" />}
        <div className="flex justify-end gap-2 mt-4">
          <button className={btnGhost} onClick={() => setOpen(false)}>Cancel</button>
          <button className={btnPrimary} onClick={save}>Save entry</button>
        </div>
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} title="Delete entry?" body="This daily entry will be permanently removed." onYes={() => { setEntries(entries.filter(e => e.id !== del)); toast.info('Entry deleted.'); }} />
    </div>
  );
}
