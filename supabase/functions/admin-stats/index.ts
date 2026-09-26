// admin-stats — owner-only aggregated pulse for DadaFX.
// Returns total users, active, broker breakdown, trades, and "what they love".
// Owner gating: OWNER_EMAIL env (comma-separated) or first user is owner.
// Reads via SERVICE_ROLE so RLS is bypassed — keep JWT verification ON.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OWNER_EMAIL = (Deno.env.get('OWNER_EMAIL') ?? 'daadirey100@gmail.com').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s=200) => new Response(JSON.stringify(b), {status:s, headers:{'Content-Type':'application/json', ...corsHeaders}});

serve(async (req)=>{
  if(req.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});

  if(req.method !== 'POST') return json({error:'POST only'},405);
  try{ await req.json(); }catch{ /* ignore body — endpoint needs POST only */ }
  const auth = req.headers.get('Authorization') ?? '';
  const userClient = createClient(URL, ANON, {global:{headers:{Authorization: auth}}});
  const {data:{user}} = await userClient.auth.getUser();
  if(!user) return json({error:'Sign in required'},401);

  const email = (user.email ?? '').toLowerCase();
  const isOwner = OWNER_EMAIL.includes(email);
  if(!isOwner) return json({error:'Owner only — set OWNER_EMAIL to your email in function secrets'},403);

  const service = createClient(URL, SERVICE);

  try {
  // --- users (keep full list for owner table) ---
    let allUsersList: any[] = [];
    let totalUsers = 0;
    let active7d = 0;
    try {
      let page=1; const perPage=1000;
      let all:any[]=[];
      while(true){
        const {data, error} = await service.auth.admin.listUsers({page, perPage});
        if(error) throw error;
        const users = (data as any).users ?? [];
        all.push(...users);
        if(users.length < perPage) break;
        page++; if(page>10) break;
      }
      allUsersList = all;
      totalUsers = all.length;
      const cut = Date.now() - 7*864e5;
      active7d = all.filter((u:any)=> u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() > cut).length;
    } catch { /* keep 0 */ }

    // --- brokers ---
    const {data: conns} = await service.from('broker_connections').select('provider,status,created_at,user_id').limit(5000);
    const byProvider: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const distinctUsers = new Set<string>();
    for(const c of conns ?? []){
      byProvider[c.provider] = (byProvider[c.provider]??0)+1;
      byStatus[c.status] = (byStatus[c.status]??0)+1;
      distinctUsers.add(c.user_id);
    }

    // --- trades (broker_trades ledger) ---
    const {count: brokerTrades} = await service.from('broker_trades').select('id', {count:'exact', head:true});
    // --- journal_store trades (local journal) — sum array lengths for key='dadafx.trades'
    let journalTrades = 0;
    let journalUsers = 0;
    try {
      const {data: rows} = await service.from('journal_store').select('user_id,data').eq('key','dadafx.trades').limit(5000);
      journalUsers = new Set((rows ?? []).map((r:any)=>r.user_id)).size;
      for(const r of rows ?? []){
        const arr = (r as any).data;
        if(Array.isArray(arr)) journalTrades += arr.length;
      }
    } catch { /* ignore */ }

    // --- recent sync logs for "love" (most active) ---
    const {data: logs} = await service.from('broker_sync_logs').select('provider,records_created,created_at').eq('status','success').order('created_at',{ascending:false}).limit(100);

    // --- top pairs from broker_trades (if exists) ---
    let topPairs: {pair:string, count:number}[] = [];
    try {
      const {data: pairs} = await service.from('broker_trades').select('pair').limit(2000);
      const m = new Map<string, number>();
      for(const r of pairs ?? []) m.set((r as any).pair, (m.get((r as any).pair)??0)+1);
      topPairs = [...m.entries()].map(([pair,count])=>({pair,count})).sort((a,b)=>b.count-a.count).slice(0,5);
    } catch { /* ignore */ }

    // --- growth last 30d (signups per day) ---
    let dailySignups: {date:string, count:number}[] = [];
    let dailyTrades: {date:string, count:number}[] = [];
    let featureAdoption: {feature:string, users:number}[] = [];
    let topStrategies: {label:string, count:number}[] = [];
    let topMistakes: {label:string, count:number}[] = [];
    try {
      const {data: users} = await service.auth.admin.listUsers({page:1, perPage:1000});
      const allUsers = (users as any).users ?? [];
      const dayKey = (iso:string)=> iso.slice(0,10);
      const ms30 = Date.now() - 30*864e5;
      const signupMap = new Map<string, number>();
      for(let i=0;i<30;i++){
        const d = new Date(ms30 + i*864e5).toISOString().slice(0,10);
        signupMap.set(d,0);
      }
      for(const u of allUsers){
        const d = dayKey(u.created_at ?? '');
        if(signupMap.has(d)) signupMap.set(d, (signupMap.get(d)??0)+1);
      }
      dailySignups = [...signupMap.entries()].map(([date,count])=>({date,count}));

      // monthly trades from journal_store + broker_trades
      const {data: tradeRows} = await service.from('journal_store').select('data,updated_at').eq('key','dadafx.trades').limit(5000);
      const tradeMap = new Map<string, number>();
      for(let i=0;i<30;i++){
        const d = new Date(ms30 + i*864e5).toISOString().slice(0,10);
        tradeMap.set(d,0);
      }
      const stratMap = new Map<string, number>();
      const mistakeMap = new Map<string, number>();
      for(const r of tradeRows ?? []){
        const arr = (r as any).data as any[];
        if(!Array.isArray(arr)) continue;
        for(const t of arr){
          // daily trades by trade.date
          const d = String(t.date ?? '').slice(0,10);
          if(tradeMap.has(d)) tradeMap.set(d, (tradeMap.get(d)??0)+1);
          if(t.strategy) stratMap.set(t.strategy, (stratMap.get(t.strategy)??0)+1);
          const m = String(t.mistakes ?? '').split(',')[0].trim();
          if(m) mistakeMap.set(m, (mistakeMap.get(m)??0)+1);
        }
      }
      dailyTrades = [...tradeMap.entries()].map(([date,count])=>({date,count}));
      topStrategies = [...stratMap.entries()].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count).slice(0,5);
      topMistakes = [...mistakeMap.entries()].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count).slice(0,5);

      // feature adoption: distinct users per key
      const keys = ['dadafx.trades','dadafx.daily','dadafx.notes','dadafx.watchlist','dadafx.backtests','dadafx.accounts'];
      const feat: {feature:string, users:number}[] = [];
      for(const k of keys){
        const {data: rows} = await service.from('journal_store').select('user_id').eq('key',k).limit(5000);
        const u = new Set((rows ?? []).map((r:any)=>r.user_id)).size;
        feat.push({feature: k.replace('dadafx.',''), users: u});
      }
      featureAdoption = feat.sort((a,b)=>b.users-a.users);
    } catch { /* ignore */ }

    return json({
      ok:true,
      at: new Date().toISOString(),
      owner: email,
      totals: {
        totalUsers,
        active7d,
        brokerConnections: conns?.length ?? 0,
        distinctBrokerUsers: distinctUsers.size,
        brokerTrades: brokerTrades ?? 0,
        journalTrades,
        journalUsers,
      },
      byProvider,
      byStatus,
      topPairs,
      dailySignups,
      dailyTrades,
      featureAdoption,
      topStrategies,
      topMistakes,
      users: allUsersList.map((u:any)=> ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
        provider: u.app_metadata?.provider ?? 'email',
      })).sort((a:any,b:any)=> new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      recentSyncs: logs ?? [],
      love: {
        mostConnected: Object.entries(byProvider).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? '-',
        avgTradesPerJournaler: journalUsers ? +(journalTrades/journalUsers).toFixed(1) : 0,
      }
    });
  } catch(e){
    return json({error: String((e as Error)?.message ?? e).slice(0,300)},500);
  }
});
