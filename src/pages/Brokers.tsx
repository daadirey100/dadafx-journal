import { useEffect, useState } from 'react';
import { supabase, SUPABASE_URL } from '../lib/supabase';
import { toast } from '../lib/store';
import { PROVIDERS, providerMeta, type ProviderMeta } from '../lib/brokers/registry';
import type { BrokerConnection } from '../lib/brokers/types';
import { Badge, btnGhost, btnPrimary, Card, Confirm, Field, Glyph, Modal, PageHeader, inputCls } from '../components/ui';

interface ConnRow extends BrokerConnection {
  environment?: string | null;
  external_account_id?: string | null;
  created_at?: string;
}
interface AcctRow {
  id: string; connection_id: string; external_account_id: string; account_number: string;
  broker_name: string; currency: string; balance: number; equity: number;
  margin: number; free_margin: number; leverage: number | null;
}
type Step = 'choose' | 'setup' | 'accounts' | 'syncing' | 'done';

function call(action: string, body: Record<string, unknown> = {}) {
  return supabase.functions.invoke('broker-sync', { body: { action, ...body } });
}

const mask = (s?: string | null) => (!s ? '••••' : s.length > 4 ? `••••${s.slice(-4)}` : '••••');

export default function Brokers({ onGo }: { onGo: (p: string) => void }) {
  const [conns, setConns] = useState<ConnRow[]>([]);
  const [accts, setAccts] = useState<AcctRow[]>([]);
  const [livePos, setLivePos] = useState<any[]>([]);
  const [lastLogs, setLastLogs] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [busyAt, setBusyAt] = useState(0);
  const [nowT, setNowT] = useState(Date.now());
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNowT(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);
  const [setup, setSetup] = useState<ProviderMeta | null>(null);
  const [step, setStep] = useState<Step>('choose');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [pairing, setPairing] = useState<{ code: string; until: number } | null>(null);
  const [apiToken, setApiToken] = useState<{ token: string; connectionId: string } | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [foundAccts, setFoundAccts] = useState<any[]>([]);
  const [done, setDone] = useState<{ provider: string; label: string; imported: number; balance: string } | null>(null);
  const [settings, setSettings] = useState<ConnRow | null>(null);
  const [rename, setRename] = useState('');
  const [del, setDel] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await call('list');
    if (error) toast.err(`Broker service unreachable: ${error.message ?? 'deploy the function first (see BROKERS.md)'}`);
    else {
      setConns(((data as any)?.connections ?? []) as ConnRow[]);
      setAccts(((data as any)?.accounts ?? []) as AcctRow[]);
      setLivePos(((data as any)?.positions ?? []) as any[]);
      const m: Record<string, any> = {};
      for (const l of ((data as any)?.lastLogs ?? []) as any[]) m[l.connection_id] = l;
      setLastLogs(m);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!pairing) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pairing]);
  // OAuth landing (?connected= / ?oauth_error=)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    (async () => {
      if (q.get('connected') === 'ctrader') {
        toast.ok('cTrader connected — first sync already ran. ✅');
        await load();
        const { data } = await call('list');
        const list = ((data as any)?.connections ?? []) as ConnRow[];
        const newest = list.filter(c => c.provider === 'ctrader').pop();
        setDone({ provider: 'cTrader', label: newest?.label ?? '', imported: newest?.importedCount ?? 0, balance: '' });
        setStep('done');
      } else if (q.get('oauth_error')) {
        toast.err(`cTrader authorization failed: ${q.get('oauth_error')}`);
      }
      if (q.get('connected') || q.get('oauth_error')) window.history.replaceState(null, '', window.location.pathname);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ago = (iso: string | null | undefined) => {
    if (!iso) return 'never';
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const statusOf = (c: ConnRow): { label: string; tone: 'green' | 'red' | 'amber' | 'gray' | 'blue' } => {
    if (busy === c.id) return { label: 'SYNCING', tone: 'blue' };
    if (c.status === 'error' || c.lastError) return { label: 'ERROR', tone: 'red' };
    const l = lastLogs[c.id];
    if (l && l.status === 'error') return { label: 'NEEDS ATTENTION', tone: 'amber' };
    if (c.status === 'never' && !c.lastSyncAt) return { label: 'DISCONNECTED', tone: 'gray' };
    return { label: 'CONNECTED', tone: 'green' };
  };

  const openWizard = (p?: ProviderMeta) => {
    setDone(null);
    setPairing(null);
    setApiToken(null);
    if (p) {
      setSetup(p);
      const v: Record<string, string> = {};
      for (const f of p.fields) v[f.key] = f.options?.[0] ?? '';
      setVals(v);
      setStep('setup');
    } else {
      setSetup(null);
      setStep('choose');
    }
  };

  const submit = async () => {
    if (!setup) return;
    if (setup.id === 'ctrader') {
      setBusy('connect');
      try {
        const { data, error } = await call('oauth-start', {
          provider: 'ctrader',
          environment: vals.environment || 'demo',
          label: vals.label?.trim() || undefined,
          accountId: vals.accountId?.trim() || undefined,
        });
        if (error) throw error;
        const url = (data as any)?.url as string;
        if (!url) throw new Error((data as any)?.error ?? 'Could not start cTrader authorization.');
        window.location.href = url;
      } catch (e: any) {
        toast.err(e?.message ?? 'Could not start cTrader authorization.');
        setBusy(null);
      }
      return;
    }
    for (const f of setup.fields) {
      if (!f.options && !vals[f.key]?.trim()) { toast.err(`${f.label} is required.`); return; }
    }
    setBusy('connect');
    try {
      const { data, error } = await call('connect', {
        provider: setup.id,
        label: vals.label?.trim() || undefined,
        credentials: Object.fromEntries(setup.fields.filter(f => f.key !== 'label').map(f => [f.key, vals[f.key]])),
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      if (setup.id === 'mt5') {
        const code = (data as any).pairingCode as string;
        if (!code) throw new Error('Pairing service did not return a code.');
        setPairing({ code, until: Date.now() + 10 * 60e3 });
        setNowTick(Date.now());
        toast.ok('Pairing code live for 10 minutes — enter it in the EA.');
      } else if (setup.id === 'custom' || setup.id === 'tradingview') {
        const token = (data as any).bridgeToken as string;
        const connectionId = (data as any).connectionId as string;
        if (!token) throw new Error('Token service did not return a token.');
        setApiToken({ token, connectionId });
        toast.ok('API token created — copy it now, it is never shown again.');
      } else {
        // OANDA: discover accounts → step 4 → initial sync → done.
        const connId = (data as any)?.connection?.id as string;
        const { data: acc } = await call('accounts', { connectionId: connId });
        if ((acc as any)?.error) throw new Error((acc as any).error);
        setFoundAccts(((acc as any)?.accounts ?? []) as any[]);
        setStep('accounts');
        (submit as any)._connId = connId;
      }
      load();
    } catch (e: any) {
      toast.err(e?.message ?? 'Connection failed.');
    } finally {
      setBusy(null);
    }
  };

  const runInitialSync = async () => {
    const connId = (submit as any)._connId as string;
    if (!connId) { setStep('done'); return; }
    setStep('syncing');
    try {
      const { data, error } = await call('sync', { connectionId: connId });
      if (error) throw error;
      const r = (data as any)?.results?.[connId] ?? {};
      if (r.error) throw new Error(r.error);
      if (r.status === 'already_running') {
        toast.info('A sync is already running — grabbing its results…');
        await new Promise(res => setTimeout(res, 4000));
        await load();
      }
      await load();
      const c = conns.find(x => x.id === connId);
      setDone({
        provider: setup?.name ?? 'Broker',
        label: c?.label ?? '',
        imported: r.imported ?? 0,
        balance: '',
      });
      setStep('done');
      toast.ok(`Imported ${r.imported ?? 0} new trades. ✅`);
    } catch (e: any) {
      toast.err(e?.message ?? 'Initial sync failed — retry from Sync now.');
      setStep('done');
    }
  };

  const syncOne = async (id: string) => {
    setBusy(id);
    setBusyAt(Date.now());
    try {
      const { data, error } = await call('sync', { connectionId: id });
      if (error) throw error;
      const r = (data as any)?.results?.[id] ?? {};
      if (r.error) throw new Error(r.error);
      if (r.status === 'already_running') toast.info('Sync already running — results land automatically.');
      else if (r.status === 'throttled') toast.info('Synced moments ago — cooling down for a minute.');
      else if (r.note) toast.info(String(r.note));
      else {
        const errs = Array.isArray(r.errors) ? r.errors.filter(Boolean) : [];
        toast.ok(`Imported ${r.imported ?? 0} new · ${r.skipped ?? 0} already journaled.`);
        if (errs.length) toast.err(errs[0]);
      }
      load();
    } catch (e: any) {
      toast.err(e?.message ?? 'Sync failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Read-only auto-import" title="Broker Connections"
        sub="Connect a platform once — closed trades flow into your journal automatically. Viewing only: no orders, no closes, no money movement. Ever."
        right={<button className={btnPrimary} onClick={() => openWizard()}><Glyph name="plus" className="w-4 h-4" />Connect Broker</button>} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PROVIDERS.map(p => (
          <Card key={p.id} lift>
            <div className="flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center"><Glyph name="link" className="w-5 h-5" /></span>
              <div>
                <h2 className="font-display font-extrabold tracking-tight">{p.name}</h2>
                <p className="text-[11px] text-slate-500">{p.tagline}</p>
              </div>
            </div>
            <button className={btnPrimary + ' w-full mt-3'} onClick={() => openWizard(p)}>Connect {p.name}</button>
          </Card>
        ))}
      </div>

      <h2 className="font-display font-extrabold tracking-tight text-slate-900 dark:text-white pt-1">Connected accounts</h2>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" aria-label="Loading connections">
          {[0, 1, 2].map(i => (
            <Card key={i}>
              <div className="h-5 w-2/3 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
              <div className="h-4 w-1/2 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse mt-2" />
              <div className="h-9 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse mt-3" />
            </Card>
          ))}
        </div>
      )
        : conns.length === 0 ? (
          <Card><p className="text-sm text-slate-400">Nothing connected yet. Hit <b>+ Connect Broker</b> above — your journal stays exactly as it is.</p></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {conns.map(c => {
              const st = statusOf(c);
              const log = lastLogs[c.id];
              const cAccts = accts.filter(a => a.connection_id === c.id);
              const cPos = livePos.filter(p => p.connection_id === c.id);
              return (
                <Card key={c.id} lift>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display font-extrabold tracking-tight">{providerMeta(c.provider).name}</h3>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <p className="text-sm font-bold mt-1">{c.label}</p>
                  <p className="text-xs text-slate-500 num">Account {mask(c.external_account_id ?? cAccts[0]?.external_account_id)}{c.environment ? ` · ${c.environment}` : ''}</p>
                  <p className="text-[11px] text-slate-500 num mt-1">
                    Last sync: {log?.completed_at ? ago(log.completed_at) : c.lastSyncAt ? ago(c.lastSyncAt) : 'never'}
                    {log ? ` · ${log.status === 'success' ? `✓ ${log.records_created} imported` : '✕ failed'}` : ` · ${c.importedCount} imported total`}
                  </p>
                  {cAccts.length > 0 && (
                    <p className="text-[11px] text-slate-500 num mt-1">
                      {cAccts.map(a => `${a.currency} ${Number(a.equity).toLocaleString()}`).join(' · ')}
                    </p>
                  )}
                  {cPos.length > 0 && (
                    <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-300 mt-1">{cPos.length} open position{cPos.length > 1 ? 's' : ''} live</p>
                  )}
                  {c.lastError && <p className="text-[11px] text-red-600 mt-1">⚠ {c.lastError}</p>}
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button className={btnPrimary + ' !h-9 !px-3 !text-xs flex-1'} disabled={busy === c.id} onClick={() => syncOne(c.id)}>
                      <Glyph name="refresh" className={`w-3.5 h-3.5 ${busy === c.id ? 'animate-spin' : ''}`} />{busy === c.id ? `Syncing… ${Math.max(0, Math.floor((nowT - busyAt) / 1000))}s` : 'Sync Now'}
                    </button>
                    <button className={btnGhost + ' !h-9 !px-3 !text-xs'} onClick={() => { setSettings(c); setRename(c.label); }}>Settings</button>
                    <button className="text-xs font-bold text-red-500 hover:underline px-1" onClick={() => setDel(c.id)}>Disconnect</button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

      {/* Connect wizard */}
      <Modal open={!!setup || !!done} onClose={() => { setSetup(null); setStep('choose'); setPairing(null); setApiToken(null); setDone(null); }} title={step === 'choose' ? 'Connect a broker' : step === 'done' && done ? 'Connected' : setup ? `Connect ${setup.name}` : ''} eyebrow={step === 'choose' ? 'Step 1 of 6 · choose' : step === 'setup' ? 'Step 2–3 · instructions + authorize' : step === 'accounts' ? 'Step 4 · accounts' : step === 'syncing' ? 'Step 5 · syncing' : 'Step 6 · done'} wide>
        {step === 'choose' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {PROVIDERS.map(p => (
              <button key={p.id} onClick={() => {
                setSetup(p);
                const v: Record<string, string> = {};
                for (const f of p.fields) v[f.key] = f.options?.[0] ?? '';
                setVals(v);
                setStep('setup');
              }} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 text-left hover:border-indigo-400 transition">
                <p className="font-display font-extrabold">{p.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{p.tagline}</p>
              </button>
            ))}
          </div>
        )}

        {step === 'setup' && setup && (
          <div className="space-y-3">
            {setup.needsBackendSetup && (
              <p className="text-[13px] rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30 px-3.5 py-2.5 text-amber-800 dark:text-amber-200">{setup.needsBackendSetup}</p>
            )}
            {setup.fields.map(f => (
              <Field key={f.key} label={f.label}>
                {f.options ? (
                  <select className={inputCls} value={vals[f.key]} onChange={e => setVals({ ...vals, [f.key]: e.target.value })}>
                    {f.options.map(o => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input className={`${inputCls} ${f.secret ? 'num' : ''}`} type={f.secret ? 'password' : 'text'}
                    autoComplete="off" placeholder={f.placeholder} value={vals[f.key] ?? ''}
                    onChange={e => setVals({ ...vals, [f.key]: e.target.value })} />
                )}
                {f.help && <p className="text-[11px] text-slate-400 mt-1">{f.help}</p>}
              </Field>
            ))}
            {setup.id === 'mt5' && !pairing && (
              <div className="text-[13px] rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 space-y-1.5 text-slate-600 dark:text-slate-300">
                <p className="font-extrabold text-slate-900 dark:text-white">Pairing, not passwords — works for every trader</p>
                <p>1. Click <b>Generate pairing code</b> — 10 minutes, one terminal only, tied to YOUR account.</p>
                <p>2. <a className="font-bold text-indigo-600 hover:underline" href="/DadaFXBridge.mq5" download>Download DadaFXBridge.mq5</a> → compile (F7) → drag onto any chart.</p>
                <p>3. Tools → Options → Expert Advisors → allow WebRequest for:<br /><code className="text-[11px] num break-all select-all">{`${SUPABASE_URL}/functions/v1/broker-sync`}</code></p>
                <p>4. Type the code into the EA. <b>You never see any token.</b> Each terminal syncs only to its owner's journal.</p>
              </div>
            )}
            {(setup.id === 'custom' || setup.id === 'tradingview') && !apiToken && (
              <div className="text-[13px] rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 space-y-1.5 text-slate-600 dark:text-slate-300">
                {setup.id === 'tradingview' ? (
                  <>
                    <p className="font-extrabold text-slate-900 dark:text-white">TradingView webhook → journal</p>
                    <p>TradingView has no trade-history API, so alerts push — not pull — your fills. This is official.</p>
                    <p>1. Click <b>Generate TradingView token</b> — shown <b>once</b>.</p>
                    <p>2. In TradingView: chart → Create Alert → <b>Webhook URL</b>:<br /><code className="text-[11px] num break-all select-all">{`${SUPABASE_URL}/functions/v1/broker-sync`}</code></p>
                    <p>3. Alert message (copy/paste):</p>
                    <code className="block text-[11px] num break-all select-all bg-slate-900 text-emerald-300 rounded-lg p-2.5 whitespace-pre-wrap">{`{
  "action": "tradingview-push",
  "bridgeToken": "PASTE_TOKEN_HERE",
  "deals": [{
    "ticket": "{{strategy.order.id}}-{{timenow}}",
    "symbol": "{{ticker}}",
    "type": 0,
    "volume": 0.1,
    "priceIn": {{close}},
    "priceOut": {{close}},
    "timeIn": ${Math.floor(Date.now()/1000)},
    "timeOut": ${Math.floor(Date.now()/1000)},
    "profit": 0
  }]
}`}</code>
                    <p className="text-[11px]">Use Pine <code>{`strategy()`}</code> or manual alert; replace <code>type 0=buy 1=sell</code>. Duplicates deduped. After alerts fire, trades appear in journal + on the TradingView chart overlay.</p>
                  </>
                ) : (
                  <>
                    <p className="font-extrabold text-slate-900 dark:text-white">One token, any broker</p>
                    <p>1. Click <b>Generate API token</b> — tied to YOUR account, shown <b>once</b>.</p>
                    <p>2. Your bot, EA or script POSTs closed deals to:<br /><code className="text-[11px] num break-all select-all">{`${SUPABASE_URL}/functions/v1/broker-sync`}</code></p>
                    <p>3. Anything speaking HTTPS works: MT4 EAs, DXtrade / Match-Trader scripts, Python bots, Zapier-style webhooks. Duplicates are merged automatically.</p>
                  </>
                )}
              </div>
            )}
            {(setup.id === 'custom' || setup.id === 'tradingview') && apiToken && (
              <div className="rounded-2xl border-2 border-dashed border-emerald-400 dark:border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30 p-5 space-y-3">
                <p className="text-xs font-extrabold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Save this now — it is never shown again</p>
                <p className="font-mono font-extrabold text-lg num break-all select-all">{apiToken.token}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button className={btnGhost + ' !h-9 !text-xs'} onClick={() => { navigator.clipboard?.writeText(apiToken.token); toast.ok('Token copied.'); }}>Copy token</button>
                  <button className={btnGhost + ' !h-9 !text-xs'} onClick={() => {
                    const act = setup.id === 'tradingview' ? 'tradingview-push' : 'custom-push';
                    navigator.clipboard?.writeText(JSON.stringify({
                      action: act,
                      bridgeToken: apiToken.token,
                      account: { login: 'TV', currency: 'USD', balance: 10000, equity: 10000 },
                      deals: [{ ticket: 'tv-1', symbol: 'EUR/USD', type: 0, volume: 0.1, priceIn: 1.0842, priceOut: 1.0882, timeIn: Math.floor(Date.now()/1000)-3600, timeOut: Math.floor(Date.now()/1000), profit: 40 }],
                    }, null, 2));
                    toast.ok('Example request copied — adapt it to your broker.');
                  }}>Copy example request</button>
                  {setup.id === 'tradingview' && (
                    <button className={btnGhost + ' !h-9 !text-xs'} onClick={() => {
                      navigator.clipboard?.writeText(JSON.stringify({
                        action: 'tradingview-push',
                        bridgeToken: apiToken.token,
                        deals: [{ ticket: `{{strategy.order.id}}-{{timenow}}`, symbol: '{{ticker}}', type: 0, volume: 0.1, priceIn: '{{close}}', priceOut: '{{close}}', timeIn: Math.floor(Date.now()/1000), timeOut: Math.floor(Date.now()/1000), profit: 0 }],
                      }, null, 2));
                      toast.ok('TradingView alert JSON copied.');
                    }}>Copy TV alert JSON</button>
                  )}
                  <button className={btnPrimary + ' !h-9 !text-xs'} onClick={() => { load(); setSetup(null); setStep('choose'); setApiToken(null); onGo(setup.id === 'tradingview' ? 'charts' : 'journal'); }}>I've saved it →</button>
                </div>
                <p className="text-[11px] text-slate-500">{setup.id === 'tradingview' ? 'Paste the token into the alert JSON where it says PASTE_TOKEN_HERE. Test the alert once — the trade shows in journal + chart overlay.' : 'Deal fields: ticket, symbol ("EUR/USD"), type 0=buy / 1=sell, volume (lots), priceIn, priceOut, timeIn/timeOut (unix seconds). Optional: sl, tp, profit, commission, swap, account, positions. Max 500 deals per push, one push per minute.'}</p>
              </div>
            )}
            {setup.id === 'mt5' && pairing && (
              <div className="rounded-2xl border-2 border-dashed border-indigo-400 dark:border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/30 p-5 text-center">
                <p className="text-xs font-extrabold uppercase tracking-widest text-indigo-600 dark:text-indigo-300">Type this into the EA within {Math.max(0, Math.floor((pairing.until - nowTick) / 60000))}:{String(Math.max(0, Math.floor((pairing.until - nowTick) / 1000) % 60)).padStart(2, '0')}</p>
                <p className="font-display font-extrabold text-5xl num tracking-[0.2em] mt-1 select-all">{pairing.code}</p>
                <div className="flex justify-center gap-2 mt-3">
                  <button className={btnGhost + ' !h-9 !text-xs'} onClick={() => { navigator.clipboard?.writeText(pairing.code); toast.ok('Code copied.'); }}>Copy code</button>
                  <button className={btnPrimary + ' !h-9 !text-xs'} onClick={() => { load(); toast.info('If paired, the account appears in Connected accounts below.'); }}>I've entered it →</button>
                </div>
              </div>
            )}
            {setup.id === 'ctrader' && (
              <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 px-3.5 py-2.5 text-[13px] text-slate-600 dark:text-slate-300">
                Clicking continue sends you to <b>cTrader.com</b> to log in and press <b>Allow access</b>. No password is ever typed here.
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button className={btnGhost} onClick={() => { setSetup(null); setStep('choose'); setPairing(null); setApiToken(null); }}>Back</button>
              {!pairing && !apiToken && <button className={btnPrimary} onClick={submit} disabled={busy === 'connect'}>{busy === 'connect' ? 'Working…' : setup.id === 'mt5' ? 'Generate pairing code' : setup.id === 'custom' ? 'Generate API token' : setup.id === 'tradingview' ? 'Generate TradingView token' : setup.id === 'ctrader' ? 'Continue with cTrader' : `Connect ${setup.name}`}</button>}
            </div>
            <p className="text-[11px] text-slate-400">Secrets are encrypted server-side and never readable.{setup.docsUrl && <> <a className="underline" href={setup.docsUrl} target="_blank" rel="noreferrer">Official {setup.name} docs →</a></>}</p>
          </div>
        )}

        {step === 'accounts' && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600 dark:text-slate-300">These accounts were discovered — <b>all of them</b> will sync into your journal:</p>
            {foundAccts.length === 0 && <p className="text-sm text-slate-400">No accounts returned. Continue anyway — sync will report the reason.</p>}
            {foundAccts.map((a: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5">
                <span className="font-extrabold">{mask(a.externalId)}</span>
                <span className="text-slate-500">{a.currency} · Bal {Number(a.balance).toLocaleString()}</span>
                <Badge tone="green">WILL SYNC</Badge>
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-1">
              <button className={btnGhost} onClick={() => { setSetup(null); setStep('choose'); }}>Back</button>
              <button className={btnPrimary} onClick={runInitialSync}>Start initial sync →</button>
            </div>
          </div>
        )}

        {step === 'syncing' && (
          <div className="py-10 text-center">
            <p className="font-display font-extrabold text-xl animate-pulse">Pulling your history…</p>
            <p className="text-sm text-slate-500 mt-1">First sync looks back 90 days. Duplicates are impossible by design.</p>
          </div>
        )}

        {step === 'done' && done ? (
          <div className="text-center py-4">
            <p className="text-5xl">✅</p>
            <h3 className="font-display font-extrabold text-2xl mt-2">Your account is connected.</h3>
            <div className="grid grid-cols-2 gap-2 mt-4 text-left">
              {[['Account', `${done.provider}${done.label ? ` · ${done.label}` : ''}`], ['Trades imported', String(done.imported)], ['Last sync', 'Just now'], ['Status', 'Connected']].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{k}</p>
                  <p className="font-display font-extrabold num">{v}</p>
                </div>
              ))}
            </div>
            <div className="flex justify-center gap-2 mt-5">
              <button className={btnGhost} onClick={() => { setDone(null); setSetup(null); setStep('choose'); }}>Close</button>
              <button className={btnPrimary} onClick={() => onGo('journal')}>View journal →</button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Settings */}
      <Modal open={!!settings} onClose={() => setSettings(null)} title={settings ? `${providerMeta(settings.provider).name} settings` : ''} eyebrow="Connection">
        {settings && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[['Account', mask(settings.external_account_id)], ['Environment', settings.environment ?? '—'], ['Added', settings.created_at ? new Date(settings.created_at).toLocaleDateString() : '—'], ['Status', settings.status]].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{k}</p>
                  <p className="font-bold num">{v}</p>
                </div>
              ))}
            </div>
            <Field label="Nickname"><input className={inputCls} value={rename} onChange={e => setRename(e.target.value)} /></Field>
            <div className="flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setSettings(null)}>Close</button>
              <button className={btnPrimary} onClick={async () => {
                const { error } = await call('rename', { connectionId: settings.id, label: rename.trim() });
                if (error) toast.err('Rename failed.');
                else { toast.ok('Renamed.'); setSettings(null); load(); }
              }}>Save name</button>
            </div>
          </div>
        )}
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} title="Disconnect broker?" body="Stored credentials are deleted and auto-import stops. Already-imported trades stay in your journal." onYes={async () => {
        const { error } = await call('disconnect', { connectionId: del });
        if (error) toast.err('Disconnect failed.');
        else { toast.info('Disconnected.'); load(); }
      }} />
    </div>
  );
}
