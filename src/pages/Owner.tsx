import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Badge, Card, DivBars, Glyph, PageHeader, Sparkline, StatCard } from '../components/ui';
import { calcStats } from '../lib/calc';
import type { Trade } from '../lib/types';

const OWNER = 'daadirey100@gmail.com';

export default function Owner({ trades, onGo }: { trades: Trade[]; onGo: (p:string)=>void }) {
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(()=>{ supabase.auth.getUser().then(({data})=> setMe(data.user?.email ?? null)); },[]);

  const isOwner = !!me && me.toLowerCase() === OWNER.toLowerCase();

  const refresh = async () => {
    setLoading(true); setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin-stats', { body: {} });
      if(error) throw error;
      if((data as any)?.error) throw new Error((data as any).error);
      setData(data);
    } catch(e:any){
      setErr(e?.message ?? String(e));
    } finally{ setLoading(false); }
  };
  // oxlint-disable-next-line react(set-state-in-effect)
  useEffect(()=>{ if(isOwner) refresh(); else setLoading(false); }, [isOwner]);

  const localStats = calcStats(trades);
  const localTop = (()=> {
    const m = new Map<string, number>();
    for(const t of trades) if(t.exit!=null) m.set(t.pair, (m.get(t.pair)??0)+1);
    return [...m.entries()].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value).slice(0,5);
  })();

  if(!isOwner){
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Owner only" title="Owner Dashboard" sub={`This pulse is for ${OWNER} only. You are signed in as ${me ?? '—'}.`} />
        <Card><p className="text-sm text-slate-500">Sign in with <b className="text-slate-800 dark:text-white">{OWNER}</b> to see global totals. Your trades are still private by RLS — owner only sees aggregates.</p></Card>
        <Card>
          <h3 className="font-display font-extrabold">Your local pulse (fallback)</h3>
          <div className="grid sm:grid-cols-3 gap-3 mt-3">
            <StatCard label="Your trades" value={String(localStats.total)} sub={`${localStats.winRate.toFixed(1)}% WR`} tone={localStats.winRate>=50?'up':'down'} icon="book" />
            <StatCard label="Net P/L" value={`${localStats.totalPL>=0?'+':''}$${localStats.totalPL.toFixed(0)}`} tone={localStats.totalPL>=0?'up':'down'} icon="chart" />
            <StatCard label="Avg rating" value={trades.length ? (trades.reduce((a,t)=>a+t.rating,0)/trades.length).toFixed(1)+' ★' : '—'} tone="brand" icon="star" />
          </div>
          <div className="mt-4"><h4 className="text-xs font-bold text-slate-400 mb-2">Your top pairs</h4><DivBars data={localTop} /></div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Owner pulse — aggregates only, no raw trades" title="Owner Dashboard"
        sub={<>Signed in as <b>{me}</b> · Live from <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">admin-stats</code> edge function (service-role, RLS bypass, aggregates only).</>}
        right={<button onClick={refresh} className="h-10 px-4 rounded-xl bg-white border font-bold text-sm flex items-center gap-2"><Glyph name="refresh" className="w-4 h-4" />Refresh</button>}
      />

      {loading ? <Card><p className="text-sm text-slate-400 animate-pulse py-8 text-center">Loading owner pulse…</p></Card>
      : err ? <Card><p className="text-sm text-red-600 font-bold">⚠ {err}</p><p className="text-xs text-slate-500 mt-1">Deploy the function: <code className="bg-slate-100 px-1 rounded">supabase functions deploy admin-stats --no-verify-jwt</code> and set <code className="bg-slate-100 px-1 rounded">OWNER_EMAIL=daadirey100@gmail.com</code> in function secrets. Falling back to local stats below.</p><div className="grid sm:grid-cols-3 gap-3 mt-3">
            <StatCard label="Your trades" value={String(localStats.total)} sub="local fallback" icon="book" />
            <StatCard label="Brokers (you)" value={String(localTop.length)} sub="local" icon="link" />
            <StatCard label="Ask owner" value="—" sub="deploy admin-stats" icon="shield" />
          </div></Card>
      : data ? <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total users" value={String(data.totals.totalUsers)} sub={`${data.totals.active7d} active 7d`} tone="brand" icon="shield" />
          <StatCard label="Journalers" value={String(data.totals.journalUsers)} sub={`${data.totals.journalTrades} trades`} tone={data.totals.journalTrades>0?'up':'neutral'} icon="book" />
          <StatCard label="Broker connects" value={String(data.totals.brokerConnections)} sub={`${data.totals.distinctBrokerUsers} users`} tone="brand" icon="link" />
          <StatCard label="Broker trades" value={String(data.totals.brokerTrades)} sub={`avg ${data.love.avgTradesPerJournaler}/user`} tone="up" icon="chart" />
        </div>

        <Card pad={false} className="overflow-hidden">
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display font-extrabold">Registered users — emails</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{data.users?.length ?? 0} accounts</span>
              <button onClick={()=>{
                const rows = [['email','created_at','last_sign_in_at'], ...(data.users??[]).map((u:any)=>[u.email, u.created_at, u.last_sign_in_at||''])];
                const csv = rows.map((r:any)=>r.map((c:any)=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
                const blob = new Blob([csv], {type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`dadafx-users-${new Date().toISOString().slice(0,10)}.csv`; a.click();
              }} className="h-8 px-3 rounded-lg border text-xs font-bold hover:border-indigo-300">Export CSV</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="ledger w-full text-xs min-w-[640px]">
              <thead><tr><th className="!pl-4">Email</th><th>Joined</th><th>Last active</th><th>Status</th></tr></thead>
              <tbody>
                {(data.users as any[] ?? []).slice(0,100).map((u:any)=>(
                  <tr key={u.id}>
                    <td className="!pl-4 font-bold num truncate max-w-[260px]">{u.email}</td>
                    <td className="num text-slate-500">{new Date(u.created_at).toLocaleDateString()} <span className="text-[10px]">{new Date(u.created_at).toLocaleTimeString()}</span></td>
                    <td className="num text-slate-500">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : '—'}</td>
                    <td><Badge tone={u.email_confirmed_at ? 'green' : 'amber'}>{u.email_confirmed_at ? 'confirmed' : 'pending'}</Badge></td>
                  </tr>
                ))}
                {(!data.users || data.users.length===0) && <tr><td colSpan={4} className="py-8 text-center text-slate-400">No users yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[11px] text-slate-400">Owner-only — aggregates via service-role, RLS bypass. Emails shown here are never exposed to other traders.</p>
        </Card>

        <div className="grid lg:grid-cols-2 gap-3">
          <Card>
            <h3 className="font-display font-extrabold">Brokers they love <Badge tone="indigo">{data.love.mostConnected}</Badge></h3>
            <p className="text-xs text-slate-500 mt-1">By connections count — Custom API = any broker</p>
            <div className="mt-3"><DivBars data={Object.entries(data.byProvider as Record<string,number>).map(([label,value])=>({label,value}))} /></div>
            <div className="mt-3 flex flex-wrap gap-1.5">{Object.entries(data.byStatus as Record<string,number>).map(([k,v])=> <Badge key={k} tone={k==='connected'?'green':k==='error'?'red':'gray'}>{k}: {v}</Badge>)}</div>
          </Card>
          <Card>
            <h3 className="font-display font-extrabold">Pairs they trade</h3>
            <p className="text-xs text-slate-500 mt-1">Top 5 from broker_trades ledger</p>
            <div className="mt-3">
              {data.topPairs?.length ? <DivBars data={data.topPairs.map((p:any)=>({label:p.pair, value:p.count}))} /> : <p className="text-xs text-slate-400 py-6 text-center">No broker trades yet — journal trades are in journal_store.</p>}
            </div>
            <button onClick={()=>onGo('analytics')} className="mt-3 text-xs font-bold text-indigo-600 hover:underline">Open Analytics →</button>
          </Card>
        </div>

        <Card>
          <h3 className="font-display font-extrabold">What they love (signals)</h3>
          <div className="grid sm:grid-cols-3 gap-3 mt-3 text-xs">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3"><p className="font-bold text-slate-400 uppercase text-[10px]">Most connected broker</p><p className="font-extrabold text-lg">{data.love.mostConnected}</p></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3"><p className="font-bold text-slate-400 uppercase text-[10px]">Avg trades / journaler</p><p className="font-extrabold text-lg num">{data.love.avgTradesPerJournaler}</p></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3"><p className="font-bold text-slate-400 uppercase text-[10px]">Updated</p><p className="font-bold num text-xs">{new Date(data.at).toLocaleString()}</p></div>
          </div>
        </Card>

        <div className="grid lg:grid-cols-2 gap-3">
          <Card>
            <h3 className="font-display font-extrabold">Growth — last 30 days</h3>
            <p className="text-xs text-slate-500">Signups per day</p>
            <div className="mt-2">
              {data.dailySignups ? <Sparkline points={data.dailySignups.map((d:any)=>d.count)} height={90} stroke="#4f46e5" /> : <p className="text-xs text-slate-400">No data</p>}
            </div>
            <div className="flex gap-1 mt-1 text-[10px] num text-slate-400">
              <span>{data.dailySignups?.[0]?.date}</span><span className="ml-auto">{data.dailySignups?.[data.dailySignups.length-1]?.date}</span>
            </div>
            <p className="text-xs text-slate-500 mt-3">Trades logged per day</p>
            <div className="mt-2"><Sparkline points={data.dailyTrades?.map((d:any)=>d.count) ?? []} height={90} stroke="#059669" /></div>
          </Card>
          <Card>
            <h3 className="font-display font-extrabold">Feature adoption</h3>
            <p className="text-xs text-slate-500">Distinct users who touched each store key</p>
            <div className="mt-3">
              {data.featureAdoption ? <DivBars data={data.featureAdoption.map((f:any)=>({label:f.feature, value:f.users}))} /> : <p className="text-xs text-slate-400">No data</p>}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Keys: trades/daily/notes/watchlist/backtests/accounts — shows what they actually use.</p>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          <Card>
            <h3 className="font-display font-extrabold">Top strategies they trade</h3>
            <div className="mt-3">{data.topStrategies?.length ? <DivBars data={data.topStrategies.map((s:any)=>({label:s.label, value:s.count}))} /> : <p className="text-xs text-slate-400 py-6 text-center">No strategies yet</p>}</div>
          </Card>
          <Card>
            <h3 className="font-display font-extrabold">Costliest mistakes (global)</h3>
            <div className="mt-3">{data.topMistakes?.length ? <DivBars data={data.topMistakes.map((m:any)=>({label:m.label, value:m.count}))} /> : <p className="text-xs text-slate-400 py-6 text-center">No mistakes logged yet — good discipline?</p>}</div>
          </Card>
        </div>

        <Card>
          <div className="flex items-center justify-between">
            <h3 className="font-display font-extrabold">Owner tools</h3>
            <Badge tone="indigo">CSV export</Badge>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={()=>{
              const rows = [['date','signups'], ...(data.dailySignups??[]).map((r:any)=>[r.date, r.count])];
              const csv = rows.map(r=>r.join(',')).join('\n');
              const blob = new Blob([csv], {type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`dadafx-signups-${new Date().toISOString().slice(0,10)}.csv`; a.click();
            }} className="h-9 px-3 rounded-lg border text-xs font-bold hover:border-indigo-300">Export signups CSV</button>
            <button onClick={()=>{
              const rows = [['date','trades'], ...(data.dailyTrades??[]).map((r:any)=>[r.date, r.count])];
              const csv = rows.map(r=>r.join(',')).join('\n');
              const blob = new Blob([csv], {type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`dadafx-trades-${new Date().toISOString().slice(0,10)}.csv`; a.click();
            }} className="h-9 px-3 rounded-lg border text-xs font-bold hover:border-indigo-300">Export trades CSV</button>
            <button onClick={refresh} className="h-9 px-3 rounded-lg bg-indigo-600 text-white text-xs font-extrabold">Refresh pulse</button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Add page-view tracking next to rank the 17 tools — I’ll wire <code className="bg-slate-100 px-1 rounded">page_views</code> table in one deploy.</p>
        </Card>

        <Card>
          <h3 className="font-display font-extrabold">Recent syncs</h3>
          <div className="overflow-x-auto mt-2">
            <table className="ledger w-full text-xs min-w-[520px]"><thead><tr><th>When</th><th>Provider</th><th>Created</th></tr></thead><tbody>
              {(data.recentSyncs as any[]).slice(0,8).map((r:any,i:number)=>(
                <tr key={i}><td className="num">{new Date(r.created_at).toLocaleString()}</td><td><Badge tone="gray">{r.provider}</Badge></td><td className="num font-bold">{r.records_created}</td></tr>
              ))}
              {(!data.recentSyncs || data.recentSyncs.length===0) && <tr><td colSpan={3} className="py-6 text-center text-slate-400">No syncs yet.</td></tr>}
            </tbody></table>
          </div>
        </Card>
      </> : null}
    </div>
  );
}
