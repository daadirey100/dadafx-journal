import { useMemo, useState } from 'react';
import { calcStats, fmtMoney, maxDrawdown, tradePL } from '../lib/calc';
import { demoTrades } from '../lib/demo';
import { toast, useLocal } from '../lib/store';
import { accountName, uid, weekStartISO, type Account, type GuardSettings, type Trade } from '../lib/types';
import { Badge, btnDanger, btnGhost, btnPrimary, Card, Confirm, Empty, Field, Modal, PageHeader, inputCls } from '../components/ui';

export default function Portfolio({ accounts, setAccounts, trades, setTrades, startBalance, setStartBalance }: {
  accounts: Account[]; setAccounts: (a: Account[]) => void; trades: Trade[]; setTrades: (t: Trade[]) => void; startBalance: number; setStartBalance: (n: number) => void;
}) {
  const [erase, setErase] = useState(false);
  const [open, setOpen] = useState(false);
  const [bal, setBal] = useState(startBalance);
  const [form, setForm] = useState({ name: '', broker: '', currency: '$', balance: 10000 });
  const stats = calcStats(trades);
  const totalPL = stats.totalPL;
  const dd = maxDrawdown(trades, startBalance);
  const [guards, setGuards] = useLocal<GuardSettings>('dadafx.guards', { enabled: false, dailyMax: 200, weeklyMax: 500 });
  const usage = useMemo(() => {
    const day = new Date().toISOString().slice(0, 10);
    const ws = weekStartISO();
    const dayPL = trades.filter(t => t.exit != null && t.date.slice(0, 10) === day).reduce((a, t) => a + (tradePL(t) ?? 0), 0);
    const weekPL = trades.filter(t => t.exit != null && t.date.slice(0, 10) >= ws).reduce((a, t) => a + (tradePL(t) ?? 0), 0);
    return { dayPL, weekPL };
  }, [trades]);

  const add = () => {
    if (!form.name) { toast.err('Give the account a name.'); return; }
    setAccounts([...accounts, { id: uid(), ...form, balance: Number(form.balance), startBalance: Number(form.balance) }]);
    toast.ok('Account added.');
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Capital overview" title="My Portfolio" sub="Track balances across prop, live and demo accounts."
        right={<>
          <button className={btnGhost} onClick={() => { setBal(startBalance); setOpen(true); }}>Starting balance</button>
          <button className={btnPrimary} onClick={() => setOpen(true)}>+ Account</button>
        </>} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          ['Total balance', fmtMoney(startBalance + totalPL), totalPL > 0 ? 'text-emerald-600 dark:text-emerald-400' : totalPL < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'],
          ['Floating / closed P/L', `${totalPL >= 0 ? '+' : ''}${fmtMoney(totalPL)}`, totalPL > 0 ? 'text-emerald-600 dark:text-emerald-400' : totalPL < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'],
          ['Drawdown', fmtMoney(dd), dd < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'],
          ['Accounts', String(accounts.length || 1), 'text-slate-900 dark:text-white'],
        ].map(([l, v, c]) => (
          <Card key={l}><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{l}</p><p className={`font-display text-2xl font-extrabold num mt-1 ${c}`}>{v}</p></Card>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Portfolio settings">
        <Field label="Main starting balance (used for equity curve)">
          <div className="flex gap-2">
            <input type="number" className={`${inputCls} num`} value={bal} onChange={e => setBal(Number(e.target.value))} />
            <button className={btnPrimary} onClick={() => { setStartBalance(bal); toast.ok('Starting balance saved.'); setOpen(false); }}>Save</button>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <Field label="Account name"><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. FTMO 100k" /></Field>
          <Field label="Broker"><input className={inputCls} value={form.broker} onChange={e => setForm({ ...form, broker: e.target.value })} placeholder="e.g. IC Markets" /></Field>
          <Field label="Currency symbol"><input className={inputCls} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} /></Field>
          <Field label="Balance"><input type="number" className={`${inputCls} num`} value={form.balance} onChange={e => setForm({ ...form, balance: Number(e.target.value) })} /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className={btnGhost} onClick={() => setOpen(false)}>Close</button>
          <button className={btnPrimary} onClick={add}>Add account</button>
        </div>
      </Modal>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white">Loss-limit guard</h2>
            <p className="text-xs text-slate-500">Warns you before revenge trading. Banner appears on the dashboard.</p>
          </div>
          <button onClick={() => { setGuards({ ...guards, enabled: !guards.enabled }); toast.ok(guards.enabled ? 'Guard off.' : 'Guard on — trade safe.'); }}
            className={`h-8 px-4 rounded-full text-xs font-extrabold transition ${guards.enabled ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
            {guards.enabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Daily max loss ($)"><input type="number" className={`${inputCls} num`} value={guards.dailyMax} onChange={e => setGuards({ ...guards, dailyMax: Number(e.target.value) })} /></Field>
          <Field label="Weekly max loss ($)"><input type="number" className={`${inputCls} num`} value={guards.weeklyMax} onChange={e => setGuards({ ...guards, weeklyMax: Number(e.target.value) })} /></Field>
        </div>
        {guards.enabled && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            {[['Today used', usage.dayPL, guards.dailyMax], ['This week used', usage.weekPL, guards.weeklyMax]].map(([l, pl, max]: any) => {
              const used = Math.min(100, Math.max(0, (-Number(pl) / Number(max)) * 100));
              const bad = Number(pl) <= -Number(max);
              return (
                <div key={l as string} className={`rounded-xl border px-3 py-2 ${bad ? 'border-red-400 bg-red-50 dark:bg-red-950/40' : 'border-slate-200 dark:border-slate-700'}`}>
                  <p className="text-[11px] font-bold text-slate-500">{l}: <span className={`num ${Number(pl) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtMoney(Number(pl))}</span></p>
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 mt-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${bad ? 'bg-red-500' : used > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(3, used)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card pad={false}>
        <div className="px-4 sm:px-5 pt-4">
          <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white">Performance by account</h2>
          <p className="text-xs text-slate-500">Which account actually makes money — from your trade tags.</p>
        </div>
        {(() => {
          const m = new Map<string, { pl: number; n: number; w: number }>();
          for (const t of trades.filter(t => t.exit != null)) {
            const k = accountName(t.accountId);
            const e = m.get(k) ?? { pl: 0, n: 0, w: 0 };
            const pl = tradePL(t) ?? 0;
            e.pl += pl; e.n++;
            if (pl > 0) e.w++;
            m.set(k, e);
          }
          const rows = [...m.entries()].sort((a, b) => b[1].pl - a[1].pl);
          if (!rows.length) return <p className="px-5 pb-5 text-sm text-slate-400">Tag trades to accounts in the ticket to rank them here.</p>;
          return (
            <div className="overflow-x-auto">
              <table className="ledger w-full text-sm min-w-[520px]">
                <thead><tr><th className="!pl-4 sm:!pl-5">Account</th><th className="text-right">Trades</th><th className="text-right">Win rate</th><th className="text-right !pr-4 sm:!pr-5">Net P/L</th></tr></thead>
                <tbody>
                  {rows.map(([k, v]) => (
                    <tr key={k}>
                      <td className="!pl-4 sm:!pl-5 font-extrabold">{k}</td>
                      <td className="text-right num">{v.n}</td>
                      <td className="text-right num font-bold">{v.n ? ((v.w / v.n) * 100).toFixed(1) : '0.0'}%</td>
                      <td className={`text-right num font-extrabold !pr-4 sm:!pr-5 ${v.pl > 0 ? 'text-emerald-600' : v.pl < 0 ? 'text-red-600' : 'text-slate-400'}`}>{v.pl >= 0 ? '+' : ''}{fmtMoney(v.pl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </Card>

      <Card>
        <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white">Data tools</h2>
        <p className="text-xs text-slate-500 mt-0.5">Explore with samples, or wipe the slate clean. Use sidebar Backup first — erase cannot be undone.</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button className={btnGhost} onClick={() => { setTrades([...demoTrades(), ...trades]); toast.ok('14 sample trades added — delete them anytime.'); }}>Load demo trades</button>
          <button className={btnDanger} onClick={() => setErase(true)}>Erase everything</button>
        </div>
      </Card>
      <Confirm open={erase} onClose={() => setErase(false)} title="Erase everything?" body="All trades, journal entries, notes, goals and settings on THIS link will be permanently deleted." onYes={() => {
        Object.keys(localStorage).filter(k => k.startsWith('dadafx.')).forEach(k => localStorage.removeItem(k));
        location.reload();
      }} />

      <Card pad={false}>
        {accounts.length === 0 ? <Empty icon="💼" title="One master balance for now" hint={`Your equity curve uses the starting balance of ${fmtMoney(startBalance)}. Add sub-accounts (challenges, live, demo) to organise them here.`} />
        : <div className="divide-y divide-slate-100 dark:divide-slate-800">{accounts.map(a => (
          <div key={a.id} className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1"><p className="font-semibold text-sm text-slate-900 dark:text-white">{a.name} <Badge>{a.currency}</Badge></p><p className="text-xs text-slate-500">{a.broker || 'No broker set'}</p></div>
            <p className="num font-bold">{fmtMoney(a.balance, a.currency)}</p>
            <button className="text-xs font-semibold text-red-600 hover:underline" onClick={() => setAccounts(accounts.filter(x => x.id !== a.id))}>Remove</button>
          </div>))}</div>}
      </Card>
    </div>
  );
}
