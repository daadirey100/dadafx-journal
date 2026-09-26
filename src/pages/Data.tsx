import { useRef } from 'react';
import { btnGhost, btnPrimary, Card, Glyph, PageHeader } from '../components/ui';
import { toast } from '../lib/store';
import { accountName, uid, type BacktestTrade, type NoteItem, type Trade } from '../lib/types';
import { tradePL, tradeR } from '../lib/calc';

function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

export default function Data({
  trades, setTrades, backtests, setBacktests, notes,
}: {
  trades: Trade[]; setTrades: (t: Trade[]) => void;
  backtests: BacktestTrade[]; setBacktests: (t: BacktestTrade[]) => void;
  notes: NoteItem[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const backupAll = () => {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith('dadafx.')) data[k] = localStorage.getItem(k)!;
    }
    download(`dadafx-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
    toast.ok('Full backup downloaded — keep it safe.');
  };

  const restoreAll = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      Object.entries(data).forEach(([k, v]) => {
        if (k.startsWith('dadafx.') && typeof v === 'string') localStorage.setItem(k, v);
      });
      toast.ok('Backup restored — reloading…');
      setTimeout(() => location.reload(), 800);
    } catch {
      toast.err('Invalid backup file.');
    }
  };

  const exportTradesCSV = () => {
    const rows = [['date', 'pair', 'side', 'lot', 'entry', 'sl', 'tp', 'exit', 'commission', 'account', 'pl', 'r_multiple', 'strategy', 'session', 'timeframe', 'setup', 'rating'],
      ...trades.map(t => [t.date, t.pair, t.direction, t.lot, t.entry, t.stopLoss, t.takeProfit, t.exit ?? '', t.commission ?? 0, accountName(t.accountId), tradePL(t) ?? '', tradeR(t)?.toFixed(2) ?? '', t.strategy, t.session, t.timeframe, t.setup, t.rating])];
    download('dadafx-trades.csv', rows.map(r => r.join(',')).join('\n'), 'text/csv');
    toast.ok('Trades CSV exported.');
  };

  const exportBacktestsCSV = () => {
    const rows = [['date', 'pair', 'direction', 'entry', 'sl', 'tp', 'result_r', 'strategy', 'session', 'timeframe', 'notes'],
      ...backtests.map(b => [b.date, b.pair, b.direction, b.entry, b.stopLoss, b.takeProfit, b.resultR, b.strategy, b.session ?? '', b.timeframe, (b.notes ?? '').replace(/[,;]/g, ' ')])];
    download('dadafx-backtests.csv', rows.map(r => r.join(',')).join('\n'), 'text/csv');
    toast.ok('Backtests CSV exported.');
  };

  const exportNotesCSV = () => {
    const rows = [['title', 'folder', 'body', 'tags'],
      ...notes.map(n => [n.title, n.folder ?? '', n.body.replace(/[,\n]/g, ' '), (n.tags ?? []).join('|')])];
    download('dadafx-notes.csv', rows.map(r => r.join(',')).join('\n'), 'text/csv');
    toast.ok('Notebook CSV exported.');
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

  const importTradesCSV = async (f: File) => {
    try {
      const rows = parseCSV(await f.text());
      if (rows.length < 2) { toast.err('No data rows found.'); return; }
      const head = rows[0].map(h => h.trim().toLowerCase());
      const idx = (...names: string[]) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
      const c = {
        date: idx('date', 'datetime', 'time'), pair: idx('pair', 'symbol', 'asset'),
        dir: idx('side', 'direction', 'type'), lot: idx('lot', 'lots', 'volume'),
        entry: idx('entry', 'open'), sl: idx('sl', 'stop loss', 'stop_loss'), tp: idx('tp', 'take profit'),
        exit: idx('exit', 'close'), comm: idx('commission'), strategy: idx('strategy'), session: idx('session'),
        tf: idx('timeframe'), setup: idx('setup'), rating: idx('rating'),
      };
      if (c.pair < 0 || c.entry < 0) { toast.err('Need Pair + Entry columns.'); return; }
      const num = (v = '') => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
      const get = (r: string[], i: number, fb = '') => (i >= 0 && r[i] != null ? r[i].trim() : fb);
      const now = new Date().toISOString().slice(0, 16);
      const made: Trade[] = [];
      let skipped = 0;
      for (const r of rows.slice(1)) {
        const pair = get(r, c.pair);
        const entry = num(get(r, c.entry));
        if (!pair || !entry) continue;
        const pairU = pair.toUpperCase().replace(/_/g, '/');
        if (trades.some(t => t.pair === pairU && t.entry === entry && t.date.slice(0, 10) === get(r, c.date, now).slice(0, 10))) { skipped++; continue; }
        const dv = get(r, c.dir, 'Buy').toLowerCase();
        made.push({
          id: uid(), date: get(r, c.date, now).slice(0, 16) || now, pair: pairU,
          direction: dv.includes('sell') || dv === 's' ? 'Sell' : 'Buy',
          lot: num(get(r, c.lot, '0.5')) || 0.5, entry,
          stopLoss: num(get(r, c.sl)), takeProfit: num(get(r, c.tp)),
          exit: get(r, c.exit) ? num(get(r, c.exit)) : null, commission: num(get(r, c.comm)), riskPct: 1,
          strategy: get(r, c.strategy, 'Imported'), session: get(r, c.session, 'London'),
          timeframe: get(r, c.tf, 'H1'), setup: get(r, c.setup),
          emotions: '', mistakes: '', notes: '', rating: num(get(r, c.rating, '3')) || 3,
        });
      }
      if (!made.length) { toast.err(skipped ? 'All rows already in your journal.' : 'No valid rows (need Pair + Entry).'); return; }
      setTrades([...made.reverse(), ...trades]);
      toast.ok(`Imported ${made.length} trades.${skipped ? ` ${skipped} duplicates skipped.` : ''}`);
    } catch { toast.err('Could not read that file.'); }
  };

  const importBacktestsCSV = async (f: File) => {
    try {
      const rows = parseCSV(await f.text());
      if (rows.length < 2) { toast.err('No data rows.'); return; }
      const head = rows[0].map(h => h.trim().toLowerCase());
      const idx = (...names: string[]) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
      const c = {
        date: idx('date'), pair: idx('pair', 'symbol'), dir: idx('direction', 'side'),
        entry: idx('entry'), sl: idx('sl', 'stop loss'), tp: idx('tp', 'take profit'),
        r: idx('result_r', 'result', 'r'),
        strategy: idx('strategy'), session: idx('session'), tf: idx('timeframe', 'tf'), notes: idx('notes'),
      };
      if (c.pair < 0 || c.entry < 0) { toast.err('Need Pair + Entry columns.'); return; }
      const num = (v = '') => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
      const get = (r: string[], i: number, fb = '') => (i >= 0 && r[i] != null ? r[i].trim() : fb);
      const now = new Date().toISOString().slice(0, 16);
      const made: BacktestTrade[] = [];
      for (const r of rows.slice(1)) {
        const pair = get(r, c.pair);
        const entry = num(get(r, c.entry));
        if (!pair || !entry) continue;
        const dv = get(r, c.dir, 'Buy').toLowerCase();
        made.push({
          id: uid(), date: get(r, c.date, now).slice(0, 16) || now, pair: pair.toUpperCase().replace(/_/g, '/'),
          direction: dv.includes('sell') ? 'Sell' : 'Buy', entry,
          stopLoss: num(get(r, c.sl)) || 0, takeProfit: num(get(r, c.tp)) || 0,
          exit: 0, lot: 0.5,
          resultR: num(get(r, c.r)), strategy: get(r, c.strategy, 'Imported'), session: get(r, c.session, 'London'),
          timeframe: get(r, c.tf, 'H1'), notes: get(r, c.notes),
        });
      }
      if (!made.length) { toast.err('No valid rows.'); return; }
      setBacktests([...made.reverse(), ...backtests]);
      toast.ok(`Imported ${made.length} backtests.`);
    } catch { toast.err('Could not read that file.'); }
  };

  const items = [
    { title: 'Full backup (everything)', icon: 'download', desc: 'One JSON file with ALL data — trades, journal, backtests, notebook, goals, coupons, watchlist. Use it to move to another device or restore later.', btn: 'Download backup', run: backupAll },
    // oxlint-disable-next-line react(refs)
    { title: 'Restore backup', icon: 'upload', desc: 'Load a previous backup file and replace your current data.', btn: 'Choose a backup file', run: () => fileRef.current?.click(), file: true },
    { title: 'Trades CSV', icon: 'clipboard', desc: 'Export or import your trade journal rows for Excel / MT4 / spreadsheet editing.', btn: 'Export trades CSV', run: exportTradesCSV },
    { title: 'Backtests CSV', icon: 'flask', desc: 'Export or import your backtested trades in a portable format.', btn: 'Export backtests CSV', run: exportBacktestsCSV },
    { title: 'Notebook CSV', icon: 'book', desc: 'Download your notebook notes and playbooks as a spreadsheet-friendly file.', btn: 'Export notebook CSV', run: exportNotesCSV },
  ];

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Portability" title="Backup & Restore"
        sub="Your journal lives on this device and in the cloud. Download a full backup regularly — and move any part of it in or out as CSV." />

      <input ref={fileRef} type="file" accept="application/json" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) restoreAll(f); e.target.value = ''; }} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* oxlint-disable-next-line react(refs) */}
        {items.map((it, i) => (
          <Card key={i}>
            <div className="flex items-start justify-between gap-3">
              <span className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0"><Glyph name={it.icon} className="w-5 h-5" /></span>
              <div className="flex-1 min-w-0">
                <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white">{it.title}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{it.desc}</p>
                {i === 2 && (
                  <label className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer">
                    Import trades CSV…
                    <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importTradesCSV(f); e.target.value = ''; }} />
                  </label>
                )}
                {i === 3 && (
                  <label className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer">
                    Import backtests CSV…
                    <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importBacktestsCSV(f); e.target.value = ''; }} />
                  </label>
                )}
              </div>
              <button onClick={it.run} className={(i === 0 ? btnPrimary : btnGhost) + ' !h-9 !text-xs shrink-0'}><Glyph name={it.icon} className="w-3.5 h-3.5" />{it.btn}</button>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <p className="text-xs text-slate-400">
          <b className="text-slate-600 dark:text-slate-300">Where your files land:</b> the full JSON backup is the only file that restores <i>everything</i> — settings and all. CSV files carry one dataset at a time, which is handy for spreadsheets or migrating out of other journaling apps. Your data is also synced to the cloud automatically when you are signed in.
        </p>
      </Card>
    </div>
  );
}