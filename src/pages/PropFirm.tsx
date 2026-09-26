import { useMemo, useState } from 'react';
import { equityCurve, fmtMoney, maxDrawdown, tradePL } from '../lib/calc';
import { compressImage, toast, useLocal } from '../lib/store';
import { uid, type PropAccount, type Trade } from '../lib/types';
import { btnGhost, btnPrimary, Card, Confirm, Field, Glyph, Modal, PageHeader, inputCls } from '../components/ui';

function Bar({ pct, tone }: { pct: number; tone: 'up' | 'down' | 'brand' }) {
  const c = tone === 'up' ? 'bg-emerald-500' : tone === 'down' ? 'bg-red-500' : 'bg-indigo-500';
  return (
    <div className="h-2.5 rounded-full bg-slate-200/70 dark:bg-slate-800 overflow-hidden mt-2">
      <div className={`h-full rounded-full transition-all ${c}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
    </div>
  );
}

const blank = (name = ''): PropAccount => ({
  id: uid(), name, firm: 'FTMO', size: 100000, phase: 'Phase 1',
  targetPct: 10, dailyMaxPct: 5, totalMaxPct: 10,
});

function migrate(): PropAccount[] {
  try {
    const old = localStorage.getItem('dadafx.prop');
    if (old) {
      const o = JSON.parse(old);
      return [{ ...blank(`${o.firm ?? 'FTMO'} ${o.size ?? 100000}`), firm: o.firm ?? 'FTMO', size: o.size ?? 100000, phase: o.phase ?? 'Phase 1', targetPct: o.targetPct ?? 10, dailyMaxPct: o.dailyMaxPct ?? 5, totalMaxPct: o.totalMaxPct ?? 10 }];
    }
  } catch { /* ignore */ }
  return [{ ...blank('FTMO 100k'), firm: 'FTMO', size: 100000 }];
}

export default function PropFirm({ trades }: { trades: Trade[] }) {
  const [accounts, setAccounts] = useLocal<PropAccount[]>('dadafx.propAccounts', migrate());
  const [activeId, setActiveId] = useLocal<string>('dadafx.propActive', '');
  const [editing, setEditing] = useState<PropAccount | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const [form, setForm] = useState<PropAccount>(blank());
  const [show, setShow] = useState(false);
  const closeForm = () => { setShow(false); setEditing(null); setForm(blank()); };
  const [trader, setTrader] = useLocal('dadafx.traderName', 'FX Trader');
  const [pDate, setPDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pAmt, setPAmt] = useState('');
  const [certView, setCertView] = useState<string | null>(null);

  const active = accounts.find(a => a.id === activeId) ?? accounts[0];
  const s = active ?? blank('—');
  const certs = s.certificates ?? [];
  const patch = (p: Partial<PropAccount>) => setAccounts(accounts.map(a => (a.id === s.id ? { ...a, ...p } : a)));
  const payouts = s.payouts ?? [];
  const paidTotal = payouts.reduce((a, p) => a + p.amount, 0);

  const m = useMemo(() => {
    const closed = trades.filter(t => t.exit != null);
    const pl = closed.reduce((a, t) => a + (tradePL(t) ?? 0), 0);
    const gainPct = s.size > 0 ? (pl / s.size) * 100 : 0;
    const byDay = new Map<string, number>();
    for (const t of closed) {
      const d = t.date.slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + (tradePL(t) ?? 0));
    }
    const worstDay = byDay.size ? Math.min(...byDay.values()) : 0;
    const dailyUse = s.size > 0 ? (Math.abs(Math.min(0, worstDay)) / s.size) * 100 : 0;
    const dd = Math.abs(maxDrawdown(trades, s.size));
    const totalUse = s.size > 0 ? (dd / s.size) * 100 : 0;
    const curve = equityCurve(trades, s.size);
    const cur = curve[curve.length - 1]?.equity ?? s.size;
    return { pl, gainPct, worstDay, dailyUse, totalUse, cur, n: closed.length };
  }, [trades, s.size]);

  const targetHit = m.gainPct >= s.targetPct;
  const dailyOk = m.dailyUse < s.dailyMaxPct;
  const totalOk = m.totalUse < s.totalMaxPct;
  const allOk = targetHit && dailyOk && totalOk;
  const dead = !dailyOk || !totalOk;

  const openNew = () => { setForm(blank(`Challenge ${accounts.length + 1}`)); setEditing(null); setShow(true); };
  const save = () => {
    if (!form.name.trim()) { toast.err('Give the account a name.'); return; }
    if (editing) {
      setAccounts(accounts.map(a => (a.id === editing.id ? { ...form, id: editing.id } : a)));
      toast.ok('Account updated.');
    } else {
      const a = { ...form, id: uid() };
      setAccounts([...accounts, a]);
      setActiveId(a.id);
      toast.ok('Funded account added.');
    }
    closeForm();
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Funded journey" title="Prop-Firm Tracker"
        sub="Name every challenge & funded account — track each against its own rules."
        right={<span className={`inline-flex items-center h-10 px-4 rounded-xl text-sm font-extrabold ${dead ? 'bg-red-500 text-white' : allOk ? 'bg-emerald-500 text-white' : 'bg-indigo-500 text-white'}`}>
          {dead ? '✕ BREACHED' : allOk ? '✓ FUNDED PACE' : '◷ IN PROGRESS'}
        </span>} />

      {/* account picker */}
      <div className="flex flex-wrap gap-1.5">
        {accounts.map(a => (
          <button key={a.id} onClick={() => setActiveId(a.id)}
            className={`h-10 px-4 rounded-xl text-[13px] font-extrabold border transition ${a.id === s.id ? 'bg-indigo-600 text-white border-indigo-600 shadow' : 'bg-white/60 dark:bg-white/5 border-white/60 dark:border-white/10 text-slate-600 dark:text-slate-300'}`}>
            {a.name} <span className="opacity-70 font-bold">· {fmtMoney(a.size).slice(0)}</span>
          </button>
        ))}
        <button onClick={openNew} className="h-10 px-4 rounded-xl text-[13px] font-extrabold border border-dashed border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-300">+ Add funded name</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white">{s.firm} · {s.name} · {s.phase}</h2>
            <span className="flex items-center gap-2">
              <span className="num text-sm font-extrabold text-slate-500">{m.n} trades counted</span>
              <button className="text-xs font-bold text-indigo-600 hover:underline" onClick={() => { setForm({ ...s }); setEditing(s); setShow(true); }}>Edit</button>
              {accounts.length > 1 && <button className="text-xs font-bold text-red-500 hover:underline" onClick={() => setDel(s.id)}>Delete</button>}
            </span>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex justify-between text-sm font-bold"><span>Profit target {s.targetPct}%</span><span className={`num ${targetHit ? 'text-emerald-600' : ''}`}>{m.gainPct.toFixed(2)}% · {m.pl >= 0 ? '+' : ''}{fmtMoney(m.pl)}</span></div>
              <Bar pct={(m.gainPct / s.targetPct) * 100} tone={targetHit ? 'up' : 'brand'} />
              <p className="text-xs text-slate-500 mt-1">{targetHit ? '✓ Target smashed — protect it.' : `${fmtMoney((s.targetPct / 100) * s.size - m.pl)} to go.`}</p>
            </div>
            <div>
              <div className="flex justify-between text-sm font-bold"><span>Daily loss limit {s.dailyMaxPct}%</span><span className={`num ${dailyOk ? '' : 'text-red-600'}`}>worst day {fmtMoney(m.worstDay)} ({m.dailyUse.toFixed(2)}%)</span></div>
              <Bar pct={(m.dailyUse / s.dailyMaxPct) * 100} tone={dailyOk ? (m.dailyUse / s.dailyMaxPct > 0.8 ? 'brand' : 'up') : 'down'} />
            </div>
            <div>
              <div className="flex justify-between text-sm font-bold"><span>Max total drawdown {s.totalMaxPct}%</span><span className={`num ${totalOk ? '' : 'text-red-600'}`}>{m.totalUse.toFixed(2)}% used</span></div>
              <Bar pct={(m.totalUse / s.totalMaxPct) * 100} tone={totalOk ? (m.totalUse / s.totalMaxPct > 0.8 ? 'brand' : 'up') : 'down'} />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-3">Counts all journaled closed trades. Equity now ≈ {fmtMoney(m.cur).slice(0)}.</p>
        </Card>

        <Card>
          <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white mb-2">All funded names</h2>
          {accounts.length === 0 ? <p className="text-sm text-slate-400">No accounts — add your first above.</p> : (
            <div className="space-y-2">
              {accounts.map(a => (
                <button key={a.id} onClick={() => setActiveId(a.id)} className={`w-full text-left rounded-xl border px-3 py-2.5 transition ${a.id === s.id ? 'border-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}>
                  <p className="text-sm font-extrabold flex items-center gap-1.5">{a.name} <span className="text-[10px] font-bold text-slate-400 ml-auto">{a.phase}</span></p>
                  <p className="text-[11px] text-slate-500 num mt-0.5">{a.firm} · {fmtMoney(a.size).slice(0)} · 🎯 {a.targetPct}%</p>
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-extrabold">💰 Payouts <span className="num text-emerald-600">· {fmtMoney(paidTotal)} withdrawn</span></p>
            </div>
            <div className="flex gap-2 mt-2">
              <input type="date" className={`${inputCls} !h-9 !text-xs`} value={pDate} onChange={e => setPDate(e.target.value)} aria-label="Payout date" />
              <input type="number" className={`${inputCls} !h-9 !text-xs num`} value={pAmt} onChange={e => setPAmt(e.target.value)} placeholder="$ amount" aria-label="Payout amount" />
              <button className={btnPrimary + ' !h-9 !px-3 !text-xs shrink-0'} onClick={() => {
                const amt = Number(pAmt);
                if (!(amt > 0)) { toast.err('Enter an amount.'); return; }
                patch({ payouts: [...payouts, { date: pDate, amount: amt }] });
                setPAmt('');
                toast.ok('Payout logged. Enjoy it. 🎉');
              }}>Add</button>
            </div>
            {payouts.length > 0 && (
              <div className="mt-2 space-y-1">
                {[...payouts].reverse().map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs font-bold">
                    <span className="num text-slate-500">{p.date}</span>
                    <span className="num text-emerald-600 ml-auto">+{fmtMoney(p.amount)}</span>
                    <button className="text-red-500 hover:underline" onClick={() => {
                      const rev = [...payouts].reverse();
                      rev.splice(i, 1);
                      patch({ payouts: rev.reverse() });
                    }}>Del</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-3 text-xs text-slate-500 space-y-1 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
            <p>✅ Typical: 10% target · 5% daily · 10% total.</p>
            <p>✅ One card per challenge — switch the active one up top.</p>
          </div>
        </Card>
      </div>

      {/* my certificates vault */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div>
            <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white">My funded certificates</h2>
            <p className="text-xs text-slate-500">Passed? Upload the certificate your firm sends you — pinned to {s.name} forever.</p>
          </div>
          <label className={btnPrimary + ' !h-10 cursor-pointer'}>
            <Glyph name="upload" className="w-4 h-4" />Add certificate
            <input type="file" accept="image/*" className="hidden" onChange={async e => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const src = await compressImage(f);
                patch({ certificates: [...certs, { id: uid(), name: `${s.firm} ${s.phase}`, date: new Date().toISOString().slice(0, 10), src }] });
                toast.ok('Certificate pinned. Congratulations! 🏆');
              } catch { toast.err('Could not read that image.'); }
            }} />
          </label>
        </div>
        {certs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 py-10 text-center">
            <p className="text-4xl">🏆</p>
            <p className="text-sm font-bold mt-2">No certificates yet</p>
            <p className="text-xs text-slate-500 mt-0.5">Pass that challenge, download the firm's certificate, and pin it here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mt-2">
            {certs.map(c => (
              <div key={c.id} className="rounded-2xl overflow-hidden border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20">
                <button onClick={() => setCertView(c.src)} className="block w-full">
                  <img src={c.src} alt={c.name} className="w-full h-40 object-cover" loading="lazy" />
                </button>
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-500 num">{c.date}</p>
                  </div>
                  <button className="text-[11px] font-bold text-red-500 hover:underline shrink-0" onClick={() => {
                    patch({ certificates: certs.filter(x => x.id !== c.id) });
                    toast.info('Certificate removed.');
                  }}>Del</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Modal open={!!certView} onClose={() => setCertView(null)} title="Funded certificate" eyebrow={s.firm} wide>
        {certView && <img src={certView} alt="Funded certificate" className="w-full rounded-xl border" />}
      </Modal>

      {/* certificate */}
      <div className="rounded-3xl overflow-hidden border border-amber-200 dark:border-amber-900 shadow-xl" style={{ background: 'linear-gradient(135deg,#0f172a 0%,#312e81 55%,#0f172a 100%)' }}>
        <div className="px-5 sm:px-10 py-8 text-center relative">
          <div className="absolute inset-3 rounded-2xl border-2 border-amber-400/70 pointer-events-none" />
          <div className="absolute inset-5 rounded-xl border border-amber-400/40 pointer-events-none" />
          <p className="text-[11px] font-extrabold uppercase tracking-[0.3em] text-amber-300">{s.firm} · {s.name}</p>
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-white tracking-tight mt-2">{targetHit ? 'FUNDED TRADER' : 'CHALLENGE IN PROGRESS'}</h2>
          <p className="text-slate-400 text-sm mt-3 uppercase tracking-widest">Awarded to</p>
          <input value={trader} onChange={e => setTrader(e.target.value)} aria-label="Trader name"
            className="mt-1 bg-transparent text-center font-display font-extrabold text-2xl sm:text-3xl text-white focus:outline-none border-b border-dashed border-amber-400/60 pb-1 w-full max-w-md mx-auto" />
          <p className="num text-slate-300 text-sm mt-3">{s.phase} · {fmtMoney(s.size)} account</p>
          <p className={`font-display font-extrabold text-4xl num mt-2 ${targetHit ? 'text-emerald-300' : 'text-amber-300'}`}>{m.gainPct.toFixed(1)}% gain</p>
          <p className="text-slate-500 text-xs mt-2">DadaFX Journal · {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} · payouts {fmtMoney(paidTotal)}</p>
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            <button className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-amber-400 text-slate-900 text-sm font-extrabold hover:bg-amber-300" onClick={() => {
              const c = document.createElement('canvas');
              c.width = 1200; c.height = 850;
              const x = c.getContext('2d')!;
              const g = x.createLinearGradient(0, 0, 1200, 850);
              g.addColorStop(0, '#0f172a'); g.addColorStop(0.55, '#312e81'); g.addColorStop(1, '#0f172a');
              x.fillStyle = g; x.fillRect(0, 0, 1200, 850);
              x.strokeStyle = '#d4af37'; x.lineWidth = 6; x.strokeRect(40, 40, 1120, 770);
              x.lineWidth = 2; x.strokeRect(62, 62, 1076, 726);
              x.textAlign = 'center';
              x.fillStyle = '#d4af37'; x.font = 'bold 40px sans-serif';
              x.fillText(`${s.firm.toUpperCase()} · ${s.name.toUpperCase()}`, 600, 170);
              x.fillStyle = '#ffffff'; x.font = 'bold 68px sans-serif';
              x.fillText(targetHit ? 'FUNDED TRADER' : 'CHALLENGE IN PROGRESS', 600, 290);
              x.fillStyle = '#94a3b8'; x.font = '28px sans-serif'; x.fillText('Awarded to', 600, 365);
              x.fillStyle = '#ffffff'; x.font = 'bold 60px sans-serif'; x.fillText(trader || 'FX Trader', 600, 450);
              x.fillStyle = '#cbd5e1'; x.font = '28px sans-serif';
              x.fillText(`${s.phase} · ${fmtMoney(s.size)} account`, 600, 520);
              x.fillStyle = targetHit ? '#34d399' : '#fbbf24'; x.font = 'bold 52px sans-serif';
              x.fillText(`${m.gainPct.toFixed(1)}% gain`, 600, 610);
              x.fillStyle = '#64748b'; x.font = '26px sans-serif';
              x.fillText(`DadaFX Journal · ${new Date().toLocaleDateString()}`, 600, 700);
              const a = document.createElement('a');
              a.href = c.toDataURL('image/png');
              a.download = 'dadafx-certificate.png';
              a.click();
              toast.ok('Certificate downloaded. Frame it. 🖼️');
            }}><Glyph name="download" className="w-4 h-4" />Download PNG</button>
            <button className="inline-flex items-center h-10 px-4 rounded-xl border border-white/25 text-white text-sm font-bold hover:bg-white/10" onClick={() => {
              const txt = `${targetHit ? 'FUNDED' : 'CHALLENGE'} · ${trader} · ${s.firm} ${s.name} (${s.phase}) · Gain ${m.gainPct.toFixed(1)}% · Paid out ${fmtMoney(paidTotal)} · via DadaFX Journal`;
              navigator.clipboard?.writeText(txt).then(() => toast.ok('Certificate text copied.')).catch(() => toast.err('Copy failed.'));
            }}>Copy text</button>
          </div>
        </div>
      </div>

      <Modal open={show} onClose={closeForm} title={editing ? `Edit ${editing.name}` : 'Add funded account'} eyebrow="Funded account">
        <div className="space-y-3">
          <Field label="Account name"><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. FTMO 100k #1" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Firm"><input className={inputCls} value={form.firm} onChange={e => setForm({ ...form, firm: e.target.value })} placeholder="FTMO, E8, FundedNext…" /></Field>
            <Field label="Phase"><select className={inputCls} value={form.phase} onChange={e => setForm({ ...form, phase: e.target.value })}>
              {['Phase 1', 'Phase 2', 'Funded', 'Evaluation'].map(p => <option key={p}>{p}</option>)}
            </select></Field>
          </div>
          <Field label="Account size ($)"><input type="number" className={`${inputCls} num`} value={form.size} onChange={e => setForm({ ...form, size: Number(e.target.value) })} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Target %"><input type="number" step="0.5" className={`${inputCls} num`} value={form.targetPct} onChange={e => setForm({ ...form, targetPct: Number(e.target.value) })} /></Field>
            <Field label="Daily DD %"><input type="number" step="0.5" className={`${inputCls} num`} value={form.dailyMaxPct} onChange={e => setForm({ ...form, dailyMaxPct: Number(e.target.value) })} /></Field>
            <Field label="Total DD %"><input type="number" step="0.5" className={`${inputCls} num`} value={form.totalMaxPct} onChange={e => setForm({ ...form, totalMaxPct: Number(e.target.value) })} /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button className={btnGhost} onClick={closeForm}>Cancel</button>
            <button className={btnPrimary} onClick={save}>{editing ? 'Save' : 'Add account'}</button>
          </div>
        </div>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} title="Delete account?" body="This funded account card will be removed (your trades stay)." onYes={() => {
        const next = accounts.filter(a => a.id !== del);
        setAccounts(next);
        if (activeId === del) setActiveId(next[0]?.id ?? '');
        toast.info('Account removed.');
      }} />
    </div>
  );
}
