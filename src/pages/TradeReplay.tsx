import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtMoney, tradePL, tradeR, tradeRR } from '../lib/calc';
import { useLocal } from '../lib/store';
import type { Trade } from '../lib/types';
import { Badge, Card, PageHeader, btnPrimary, btnGhost, inputCls } from '../components/ui';
import TradingViewReplayChart from '../components/TradingViewReplayChart';
import { tvSymbol } from '../lib/tv';

type Candle = { o:number; h:number; l:number; c:number; t:string };
type Decision = { id:string; label:string; idx:number; price:number; at:string };
type Psychology = {
  idea:string; sawAtEntry:string; expected:string; actual:string;
  followedPlan:boolean|null; earlyEntry:boolean|null; earlyExit:boolean|null; movedStop:boolean|null; revenge:boolean|null; overtrade:boolean|null;
  differently:string; lesson:string;
};
type ReplaySession = {
  id:string; tradeId:string;
  simEntry:number|null; simSL:number|null; simTP:number|null; simExit:number|null; simExitIdx:number|null;
  decisions: Decision[];
  psychology: Psychology;
  simR:number|null; actualR:number|null;
  createdAt:string; barsHeld:number|null;
};

const SPEEDS = [0.5,1,2,5,10] as const;
const DECISIONS = ['I would enter here.','I would move SL here.','I would take partial profit here.','I would stay in the trade.','I would exit here.'];

function genForTrade(trade: Trade, total=90): Candle[]{
  const base = trade.entry; const vol = trade.pair.includes('JPY')?0.2: trade.pair.includes('XAU')? 4 : trade.pair.includes('BTC')?80:0.0009;
  const entryIdx=30; const exitIdx= Math.min(75, total-10);
  const out:Candle[]=[]; let p=base - vol*6;
  for(let i=0;i<total;i++){
    const isEntry=i===entryIdx, isExit=i===exitIdx;
    let c:number;
    if(isEntry) c=trade.entry;
    else if(isExit) c=trade.exit ?? trade.entry + (trade.direction==='Buy'? vol*4 : -vol*4);
    else {
      const drift=(Math.random()-0.5)*vol*1.2 + (i<entryIdx? vol*0.08 : i>entryIdx&&i<exitIdx? (trade.direction==='Buy'? vol*0.06:-vol*0.06): -vol*0.02);
      c=p+drift;
      if(i>entryIdx && i<exitIdx){
        if(trade.direction==='Buy'){ if(c>trade.takeProfit) c=trade.takeProfit - Math.random()*vol; if(c<trade.stopLoss) c=trade.stopLoss + Math.random()*vol; }
        else { if(c<trade.takeProfit) c=trade.takeProfit + Math.random()*vol; if(c>trade.stopLoss) c=trade.stopLoss - Math.random()*vol; }
      }
    }
    const o=p; const h=Math.max(o,c)+Math.random()*vol*0.35; const l=Math.min(o,c)-Math.random()*vol*0.35;
    const d=new Date(trade.date); d.setMinutes(d.getMinutes()+ i* (trade.timeframe==='M5'?5: trade.timeframe==='M15'?15: trade.timeframe==='H1'?60:240));
    out.push({o,h,l,c,t:d.toISOString().slice(0,16).replace('T',' ')});
    p=c;
  }
  // ensure SL/TP reachable path includes extremes
  return out;
}

export default function TradeReplay({ trades, initialId }: { trades: Trade[]; initialId?: string|null }){
  const closed = useMemo(()=> [...trades].filter(t=>t.exit!=null).sort((a,b)=> b.date.localeCompare(a.date)), [trades]);
  const [selId, setSelId] = useState<string>(initialId ?? closed[0]?.id ?? '');
  useEffect(()=>{ if(initialId) setSelId(initialId); },[initialId]);
  const trade = useMemo(()=> closed.find(t=>t.id===selId) ?? closed[0] ?? null, [closed, selId]);
  const [chartMode, setChartMode] = useState<'synthetic'|'tradingview'>('synthetic');
  const [replays, setReplays] = useLocal<ReplaySession[]>('dadafx.replays', []);
  // replay state
  const total=90; const startReveal=22;
  const [visible, setVisible] = useState(startReveal);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<typeof SPEEDS[number]>(1);
  const [finished, setFinished] = useState(false);
  const timer=useRef<number|null>(null);
  const candles = useMemo(()=> trade? genForTrade(trade,total): [], [trade]);
  const vis = candles.slice(0, visible);
  const entryBarIdx=30, exitBarIdx=75;
  const revealExit = visible >= exitBarIdx;

  // simulated
  const [simEntry, setSimEntry] = useState<number|null>(null);
  const [simSL, setSimSL] = useState<number|null>(null);
  const [simTP, setSimTP] = useState<number|null>(null);
  const [simExit, setSimExit] = useState<number|null>(null);
  const [simExitIdx, setSimExitIdx] = useState<number|null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [psych, setPsych] = useState<Psychology>({ idea:'', sawAtEntry:'', expected:'', actual:'', followedPlan:null, earlyEntry:null, earlyExit:null, movedStop:null, revenge:null, overtrade:null, differently:'', lesson:'' });

  const actualPL = trade? tradePL(trade) : null;
  const actualR = trade? tradeR(trade as any) : null;
  const actualRR = trade? tradeRR(trade) : null;
  const simR = useMemo(()=>{
    if(simEntry==null || simExit==null || simSL==null || trade==null) return null;
    const risk=Math.abs(simEntry-simSL); if(!risk) return null;
    const pl = trade.direction==='Buy'? simExit - simEntry : simEntry - simExit;
    return pl / risk;
  },[simEntry,simExit,simSL, trade]);

  const mfeMae = useMemo(()=>{
    if(!trade || !revealExit) return null;
    const dir=trade.direction; let mfe=-Infinity, mae=Infinity, hitSL=false, hitTP=false;
    for(let i=entryBarIdx;i<=exitBarIdx;i++){ const c=candles[i]; if(!c) continue;
      const fav = dir==='Buy'? c.h - trade.entry : trade.entry - c.l;
      const adv = dir==='Buy'? c.l - trade.entry : trade.entry - c.h;
      mfe=Math.max(mfe,fav); mae=Math.min(mae,adv);
      if(dir==='Buy'){ if(c.l<=trade.stopLoss) hitSL=true; if(c.h>=trade.takeProfit) hitTP=true; }
      else { if(c.h>=trade.stopLoss) hitSL=true; if(c.l<=trade.takeProfit) hitTP=true; }
    }
    const risk=Math.abs(trade.entry-trade.stopLoss)||1;
    const maxDD = mae<0? mae/risk:0;
    return { mfe: mfe/risk, mae: mae/risk, maxDD, hitSL, hitTP, first: hitSL && hitTP ? (candles.slice(entryBarIdx,exitBarIdx+1).findIndex(c=> dir==='Buy'? c.l<=trade.stopLoss : c.h>=trade.stopLoss) < candles.slice(entryBarIdx,exitBarIdx+1).findIndex(c=> dir==='Buy'? c.h>=trade.takeProfit : c.l<=trade.takeProfit) ? 'SL':'TP') : hitSL?'SL': hitTP?'TP':'—'};
  },[trade,candles, revealExit]);

  const timeInTrade = useMemo(()=>{
    if(simExitIdx!=null && entryBarIdx!=null) return `${(simExitIdx-entryBarIdx)} bars`;
    if(trade) return trade.exitAt? `${Math.round((new Date(trade.exitAt).getTime()-new Date(trade.date).getTime())/60000)}m` : '—';
    return '—';
  },[simExitIdx, trade]);

  const score = useMemo(()=>{
    let s=0, n=0;
    if(psych.followedPlan!==null){ n++; if(psych.followedPlan) s++; }
    if(psych.earlyEntry!==null){ n++; if(!psych.earlyEntry) s++; }
    if(psych.earlyExit!==null){ n++; if(!psych.earlyExit) s++; }
    if(psych.movedStop!==null){ n++; if(!psych.movedStop) s++; }
    if(psych.revenge!==null){ n++; if(!psych.revenge) s++; }
    if(psych.overtrade!==null){ n++; if(!psych.overtrade) s++; }
    return n? Math.round((s/n)*100): null;
  },[psych]);

  // keyboard — Space/→/←/R/L/S/E/Esc per spec 11
  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{
      const tag=(e.target as HTMLElement)?.tagName; if(/INPUT|TEXTAREA|SELECT/.test(tag??'')) return;
      if(e.code==='Space'){ e.preventDefault(); setPlaying(p=>!p); }
      else if(e.key==='ArrowRight'){ setVisible(v=> Math.min(total, v+1)); }
      else if(e.key==='ArrowLeft'){ setVisible(v=> Math.max(startReveal, v-1)); }
      else if(e.key.toLowerCase()==='r'){ restart(); }
      else if(e.key.toLowerCase()==='l'){ if(simEntry==null) placeSimEntry(); }
      else if(e.key.toLowerCase()==='s'){ if(simEntry==null) placeSimEntry(); }
      else if(e.key.toLowerCase()==='e'){ if(simEntry!=null&&simExit==null) placeSimExit(); }
      else if(e.key==='Escape'){ setPlaying(false); }
    };
    window.addEventListener('keydown', h); return ()=> window.removeEventListener('keydown',h);
  },[simEntry,simExit,visible]);

  useEffect(()=>{
    if(!playing){ if(timer.current) window.clearInterval(timer.current); return; }
    const ms= 700 / speed;
    timer.current=window.setInterval(()=> setVisible(v=>{ if(v>=total){ setPlaying(false); setFinished(true); return v; } if(v+1>=exitBarIdx) setFinished(true); return v+1; }), ms);
    return ()=>{ if(timer.current) window.clearInterval(timer.current); };
  },[playing,speed]);

  useEffect(()=>{ if(visible>=exitBarIdx) setFinished(true); },[visible]);

  const restart=()=>{
    setVisible(startReveal); setPlaying(false); setFinished(false);
    setSimEntry(null); setSimSL(null); setSimTP(null); setSimExit(null); setSimExitIdx(null); setDecisions([]);
  };
  const selectTrade=(id:string)=>{ setSelId(id); setTimeout(restart,0); };

  const addDecision=(label:string)=>{
    const price=candles[visible-1]?.c ?? trade?.entry ?? 0;
    setDecisions(d=> [...d, {id: Math.random().toString(36).slice(2), label, idx: visible-1, price, at: new Date().toISOString().slice(11,16)}]);
  };
  const placeSimEntry=()=>{
    const price=candles[visible-1]?.c ?? trade!.entry;
    setSimEntry(price); if(trade){ const vol=Math.abs(trade.entry-trade.stopLoss); setSimSL(trade.direction==='Buy'? price-vol: price+vol); setSimTP(trade.direction==='Buy'? price+vol*2: price-vol*2); }
  };
  const placeSimExit=()=>{
    const price=candles[visible-1]?.c ?? 0; setSimExit(price); setSimExitIdx(visible-1); setPlaying(false);
  };
  const saveReplay=()=>{
    if(!trade) return;
    const r:ReplaySession={ id: Math.random().toString(36).slice(2)+Date.now().toString(36), tradeId: trade.id, simEntry, simSL, simTP, simExit, simExitIdx, decisions, psychology: psych, simR, actualR, createdAt: new Date().toISOString(), barsHeld: simExitIdx!=null? simExitIdx - entryBarIdx : null };
    setReplays([r,...replays]);
  };

  // analytics
  const stats = useMemo(()=>{
    const n=replays.length; if(!n) return null;
    const winsSim=replays.filter(r=> (r.simR??0)>0).length;
    const winsAct=replays.filter(r=> (r.actualR??0)>0).length;
    const avgSim = replays.reduce((a,r)=>a+(r.simR??0),0)/n;
    const avgAct = replays.reduce((a,r)=>a+(r.actualR??0),0)/n;
    return { n, winsSim, winsAct, avgSim, avgAct, diff: avgSim-avgAct };
  },[replays]);

  const range = useMemo(()=>{
    if(!vis.length) return {lo:0,hi:1};
    const vals=vis.flatMap(c=>[c.h,c.l, simSL??c.c, simTP??c.c, simEntry??c.c]);
    const lo=Math.min(...vals), hi=Math.max(...vals); const pad=(hi-lo)*0.12||0.001; return {lo:lo-pad, hi:hi+pad};
  },[vis, simSL, simTP, simEntry]);

  const W=760,H=280,padL=8,padR=64,padT=10,padB=18;
  const Y=(v:number)=> padT + (1-(v-range.lo)/(range.hi-range.lo||1))*(H-padT-padB);
  const X=(i:number,n:number)=> padL + (i/Math.max(1,n-1))*(W-padL-padR);
  const curPrice=vis[vis.length-1]?.c ?? trade?.entry ?? 0;

  if(!trade) return <Card><PageHeader eyebrow="Trade Replay" title="Trade Replay" sub="No closed trades yet — log a trade with an exit to replay it." /></Card>;

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="DECISION REPLAY — TRADEZELLA STYLE" title="Trade Replay" sub={<>Replay exactly as it happened — future hidden until you step. <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{trades.filter(t=>t.exit!=null).length} closed trades</span> · <span className="text-[11px] font-bold tracking-widest text-emerald-600">TRADEZELLA BAR REPLAY</span></>} right={<>
        <div className="flex items-center gap-1 p-1 rounded-full bg-slate-100 dark:bg-slate-800 border">
          <button onClick={()=>setChartMode('synthetic')} className={`px-3 py-1 rounded-full text-xs font-black ${chartMode==='synthetic'?'bg-white dark:bg-slate-900 shadow text-indigo-600':'text-slate-500'}`}>Synthetic</button>
          <button onClick={()=>setChartMode('tradingview')} className={`px-3 py-1 rounded-full text-xs font-black ${chartMode==='tradingview'?'bg-white dark:bg-slate-900 shadow text-indigo-600':'text-slate-500'}`}>TradingView</button>
        </div>
        <select value={selId} onChange={e=>selectTrade(e.target.value)} className="h-10 px-3 rounded-xl border bg-white dark:bg-slate-900 text-sm font-bold min-w-[220px]">
          {closed.map(t=> <option key={t.id} value={t.id}>{t.pair} · {t.direction} · {t.date.slice(0,10)} · {t.strategy}</option>)}
        </select>
        <button onClick={restart} className={btnGhost}>Restart (R)</button>
      </>} />

      {/* trade header */}
      <Card className="!p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-xs">
        {[
          ['Asset', trade.pair],
          ['Date', trade.date.slice(0,16)],
          ['Timeframe', trade.timeframe],
          ['Side', <Badge key="d" tone={trade.direction==='Buy'?'green':'red'}>{trade.direction}</Badge>],
          ['Entry', <span key="e" className="num font-bold">{trade.entry}</span>],
          ['SL', <span key="s" className="num text-red-600">{trade.stopLoss}</span>],
          ['TP', <span key="t" className="num text-emerald-600">{trade.takeProfit}</span>],
          ['Size', `${trade.lot} lots`],
          ['RR', actualRR? `1:${actualRR.toFixed(2)}`:'—'],
          ['P/L', <span key="pl" className={`num font-black ${actualPL!=null&&actualPL>=0?'text-emerald-600':'text-red-600'}`}>{actualPL!=null?fmtMoney(actualPL):'—'}</span>],
          ['R', actualR!=null? `${actualR>=0?'+':''}${actualR.toFixed(2)}R`:'—'],
          ['Session', trade.session||'—'],
        ].map(([k,v])=> <div key={String(k)}><p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{k}</p><p className="font-bold mt-0.5 truncate">{v as any}</p></div>)}
        <div className="col-span-2 sm:col-span-4 lg:col-span-8 pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
          <span className="text-[11px] text-slate-500">{trade.notes||'No notes'}</span>
          {trade.beforeShot && <img src={trade.beforeShot} alt="before" className="h-16 rounded-lg border" />}
          {trade.afterShot && <img src={trade.afterShot} alt="after" className="h-16 rounded-lg border" />}
          {trade.screenshot && <img src={trade.screenshot} alt="shot" className="h-16 rounded-lg border" />}
        </div>
      </Card>

      {/* chart — Tradezella style: Synthetic bar-by-bar + TradingView real data */}
      <div className="rounded-2xl border border-white/10 bg-[#080B12] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-[#0E1220] border-b border-white/5 text-[11px]">
          <span className="font-mono text-white/60">{chartMode==='tradingview'?'TradingView':'Replay'} • {trade.pair} {trade.timeframe} • {curPrice.toFixed(5)} <span className="text-white/25">— future hidden</span> <span className="ml-2 text-[10px] font-black tracking-widest px-1.5 py-0.5 rounded bg-[#00E676] text-black">{chartMode==='tradingview'?'REAL TICKS':'SYNTHETIC'}</span></span>
          <span className="text-[10px] font-bold tracking-widest text-white/30">BAR {visible}/{total} • {vis[vis.length-1]?.t ?? ''}</span>
        </div>
        {chartMode==='tradingview' ? (
          <TradingViewReplayChart symbol={tvSymbol(trade.pair)} interval={trade.timeframe==='M5'?'5':trade.timeframe==='M15'?'15':trade.timeframe==='H1'?'60':trade.timeframe==='H4'?'240':'D'} startDate={trade.date.slice(0,10)} visibleBars={visible} totalBars={total} />
        ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[300px] block cursor-crosshair" onClick={()=>{ if(simEntry==null) placeSimEntry(); }}>
          {[0,1,2,3].map(i=> <line key={i} x1={8} x2={W-64} y1={10 + i*(H-28)/3} y2={10 + i*(H-28)/3} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 6" />)}
          {/* hidden future overlay handled by slicing */}
          {simEntry!=null && <line x1={8} x2={W-64} y1={Y(simSL!)} y2={Y(simSL!)} stroke="#FF3B3B" strokeDasharray="6 4" strokeWidth={1.2} />}
          {simEntry!=null && <line x1={8} x2={W-64} y1={Y(simTP!)} y2={Y(simTP!)} stroke="#00E676" strokeDasharray="6 4" strokeWidth={1.2} />}
          {simEntry==null && !finished && <text x={W/2} y={H/2} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={11} fontWeight={700}>Click chart or “I would enter here” to place simulated entry — future hidden</text>}
          {revealExit && <line x1={8} x2={W-64} y1={Y(trade.stopLoss)} y2={Y(trade.stopLoss)} stroke="#FF3B3B" strokeDasharray="3 4" opacity={0.6} />}
          {revealExit && <line x1={8} x2={W-64} y1={Y(trade.takeProfit)} y2={Y(trade.takeProfit)} stroke="#00E676" strokeDasharray="3 4" opacity={0.6} />}
          {revealExit && <text x={W-60} y={Y(trade.stopLoss)+3} fontSize={8} fill="#FF3B3B">ACTUAL SL</text>}
          {revealExit && <text x={W-60} y={Y(trade.takeProfit)+3} fontSize={8} fill="#00E676">ACTUAL TP</text>}
          {vis.map((c,i)=>{
            const x=X(i, vis.length); const isG=c.c>=c.o; const w=Math.max(3,(W-72)/vis.length-2); const x0=x-w/2;
            return <g key={i}>
              <line x1={x} x2={x} y1={Y(c.h)} y2={Y(c.l)} stroke={isG?'#00E676':'#FF3B3B'} strokeWidth={1.2}/>
              <rect x={x0} y={Math.min(Y(c.o),Y(c.c))} width={w} height={Math.max(1,Math.abs(Y(c.o)-Y(c.c)))} rx={1} fill={isG?'#00E676':'#FF3B3B'} />
              {i===entryBarIdx && visible>entryBarIdx && !revealExit && <circle cx={x} cy={Y(c.c)} r={4} fill="#5B7FFF" stroke="#fff" strokeWidth={1.5}/>}
            </g>;
          })}
          {simEntry!=null && <circle cx={X(vis.length-1, vis.length)} cy={Y(simEntry)} r={5} fill="#5B7FFF" stroke="#fff" strokeWidth={2}/>}
          {simExit!=null && simExitIdx!=null && <circle cx={X(simExitIdx - (total-vis.length), vis.length)} cy={Y(simExit)} r={5} fill={simR!=null&&simR>=0?'#00E676':'#FF3B3B'} stroke="#fff" strokeWidth={2}/>}
          {revealExit && <circle cx={X(exitBarIdx - (total-vis.length), vis.length)} cy={Y(trade.entry)} r={5} fill="#F59E0B" stroke="#fff" strokeWidth={2}/>}
          {revealExit && trade.exit!=null && <circle cx={X(exitBarIdx - (total-vis.length), vis.length)} cy={Y(trade.exit)} r={5} fill={actualR!=null&&actualR>=0?'#00E676':'#FF3B3B'} stroke="#fff" strokeWidth={2}/>}
        </svg>
        )}
        {/* controls */}
        <div className="px-3 py-3 bg-[#0E1220] border-t border-white/5 space-y-2">
          <div className="flex items-center gap-2">
            <button onClick={()=>setPlaying(p=>!p)} className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center text-xs font-black">{playing?'❚❚':'▶'}</button>
            <button onClick={()=>setVisible(v=>Math.max(startReveal, v-1))} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 text-white/60">◀</button>
            <button onClick={()=>setVisible(v=>Math.min(total, v+1))} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 text-white/60">▶</button>
            <button onClick={restart} className="h-8 px-3 rounded-full bg-white/5 border border-white/10 text-xs font-bold">Restart</button>
            <div className="flex-1 mx-2"><input type="range" min={startReveal} max={total} value={visible} onChange={e=>setVisible(Number(e.target.value))} className="w-full accent-white h-1" /><div className="flex justify-between text-[9px] font-mono text-white/25 mt-1"><span>Pre-entry</span><span>Entry ~30</span><span>Exit ~75</span></div></div>
            <div className="hidden sm:flex gap-1">{SPEEDS.map(s=> <button key={s} onClick={()=>setSpeed(s)} className={`px-2 py-1 rounded-full text-[10px] font-bold border ${speed===s?'bg-white text-black':'bg-white/5 border-white/10 text-white/40'}`}>{s}x</button>)}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {DECISIONS.map(d=> <button key={d} onClick={()=>addDecision(d)} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium hover:bg-white/10"> {d} </button>)}
            <button onClick={placeSimEntry} disabled={simEntry!=null} className={`h-8 px-4 rounded-full text-xs font-black ${simEntry==null?'bg-[#00E676] text-black':'bg-white/5 text-white/20 border border-white/10'}`}>I would enter here</button>
            <button onClick={placeSimExit} disabled={simEntry==null||simExit!=null} className={`h-8 px-4 rounded-full text-xs font-black ${simEntry!=null&&simExit==null?'bg-white text-black':'bg-white/5 text-white/20 border border-white/10'}`}>I would exit here</button>
            <span className="ml-auto flex items-center gap-2 text-xs font-mono"><span className="text-white/40">SL</span><input value={simSL??''} onChange={e=>setSimSL(Number(e.target.value)||null)} placeholder="—" className="w-24 h-7 rounded bg-[#080B12] border border-white/10 px-2 text-white" /><span className="text-white/40">TP</span><input value={simTP??''} onChange={e=>setSimTP(Number(e.target.value)||null)} placeholder="—" className="w-24 h-7 rounded bg-[#080B12] border border-white/10 px-2 text-white" /></span>
          </div>
          <p className="text-[10px] text-white/30">Shortcuts: <b>Space</b> Play/Pause · <b>→</b> Next · <b>←</b> Prev · <b>R</b> Restart · <b>Esc</b> Exit · Future hidden until revealed</p>
        </div>
      </div>

      {/* decision log */}
      {decisions.length>0 && (
        <Card>
          <h3 className="font-extrabold text-sm">Decision Review — logged during replay</h3>
          <div className="mt-2 space-y-1.5">
            {decisions.map(d=> <div key={d.id} className="flex items-center gap-2 text-xs bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2"><span className="font-mono text-slate-400">{d.at} · bar {d.idx}</span><span className="font-medium">{d.label}</span><span className="ml-auto font-mono num">{d.price.toFixed(5)}</span></div>)}
          </div>
        </Card>
      )}

      {/* reveal */}
      {revealExit && (
        <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20">
          <h3 className="font-black text-sm">Reveal — actual trade outcome (was hidden)</h3>
          <div className="grid sm:grid-cols-2 gap-3 mt-3 text-xs">
            <div className="rounded-xl bg-white dark:bg-slate-900 border p-3">
              <p className="text-[10px] font-black tracking-widest text-slate-400">ACTUAL</p>
              <p className="font-mono text-sm mt-1">Entry {trade.entry} → Exit {trade.exit} <span className={`font-black ${actualR!=null&&actualR>=0?'text-emerald-600':'text-red-600'}`}>{actualR!=null? `${actualR>=0?'+':''}${actualR.toFixed(2)}R`:''} · {actualPL!=null? fmtMoney(actualPL):''}</span></p>
              {mfeMae && <p className="mt-1 text-slate-600 dark:text-slate-300">MFE {mfeMae.mfe.toFixed(2)}R · MAE {mfeMae.mae.toFixed(2)}R · Max DD {mfeMae.maxDD.toFixed(2)}R · First hit: <b>{mfeMae.first}</b></p>}
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-900 border p-3">
              <p className="text-[10px] font-black tracking-widest text-slate-400">YOUR REPLAY (simulated)</p>
              <p className="font-mono text-sm mt-1">{simEntry!=null? simEntry.toFixed(5):'—'} → {simExit!=null? simExit.toFixed(5):'—'} <span className={`font-black ${simR!=null&&simR>=0?'text-emerald-600':'text-red-600'}`}>{simR!=null? `${simR>=0?'+':''}${simR.toFixed(2)}R`:''}</span> · {timeInTrade}</p>
              <p className="mt-1 text-slate-500">Keep original unchanged — simulated stored separately.</p>
            </div>
          </div>
          {/* comparison table */}
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-slate-400"><th className="py-1">Metric</th><th>My Replay</th><th>Actual Trade</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {[
                  ['Entry', simEntry?.toFixed(5)??'—', String(trade.entry)],
                  ['Exit', simExit?.toFixed(5)??'—', String(trade.exit)],
                  ['P/L', simR!=null? `${simR>=0?'+':''}${simR.toFixed(2)}R`:'—', actualR!=null? `${actualR>=0?'+':''}${actualR.toFixed(2)}R`:'—'],
                  ['RR', simEntry!=null&&simSL!=null&&simTP!=null? `1:${(Math.abs(simTP-simEntry)/Math.abs(simEntry-simSL)).toFixed(2)}`:'—', actualRR? `1:${actualRR.toFixed(2)}`:'—'],
                  ['Time in trade', timeInTrade, '—'],
                ].map(([k,a,b])=> <tr key={k}><td className="py-1.5 font-bold">{k}</td><td className="font-mono num">{a}</td><td className="font-mono num">{b}</td></tr>)}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* psychology */}
      <Card>
        <h3 className="font-black text-sm">Psychology Review</h3>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          {[
            ['What was my trade idea?','idea','textarea'],
            ['What did I see at entry?','sawAtEntry','textarea'],
            ['What did I expect to happen?','expected','textarea'],
            ['What actually happened?','actual','textarea'],
          ].map(([l,k,t])=>(
            <label key={k} className="text-xs font-bold">{l}{t==='textarea'? <textarea value={(psych as any)[k]} onChange={e=>setPsych({...psych, [k]:e.target.value})} rows={2} className={`${inputCls} !h-auto py-2 mt-1`} /> : <input value={(psych as any)[k]} onChange={e=>setPsych({...psych, [k]:e.target.value})} className={`${inputCls} mt-1`} />}</label>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
          {[
            ['Did I follow my trading plan?','followedPlan'],
            ['Did I enter too early?','earlyEntry'],
            ['Did I exit too early?','earlyExit'],
            ['Did I move my stop?','movedStop'],
            ['Did I revenge trade?','revenge'],
            ['Did I overtrade?','overtrade'],
          ].map(([l,k])=>(
            <div key={k} className="rounded-xl border p-3">
              <p className="text-xs font-bold">{l}</p>
              <div className="flex gap-1.5 mt-2">
                <button onClick={()=>setPsych({...psych,[k]:true})} className={`flex-1 h-8 rounded-full text-xs font-black ${ (psych as any)[k]===true?'bg-emerald-600 text-white':'bg-slate-100 dark:bg-slate-800'}`}>Yes</button>
                <button onClick={()=>setPsych({...psych,[k]:false})} className={`flex-1 h-8 rounded-full text-xs font-black ${ (psych as any)[k]===false?'bg-red-600 text-white':'bg-slate-100 dark:bg-slate-800'}`}>No</button>
              </div>
            </div>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <label className="text-xs font-bold">What would I do differently?<textarea value={psych.differently} onChange={e=>setPsych({...psych,differently:e.target.value})} rows={2} className={`${inputCls} !h-auto py-2 mt-1`} /></label>
          <label className="text-xs font-bold">Lesson learned<textarea value={psych.lesson} onChange={e=>setPsych({...psych,lesson:e.target.value})} rows={2} className={`${inputCls} !h-auto py-2 mt-1`} /></label>
        </div>
        {/* scorecard */}
        <div className="mt-4 rounded-xl border bg-slate-900 text-white p-4 flex items-center justify-between">
          <div><p className="text-[11px] font-black tracking-widest text-white/50">REPLAY SCORECARD — rule-following, not P/L</p><p className="text-xs text-white/60 mt-1">Based on objective plan adherence</p></div>
          <div className="text-right"><p className={`font-black text-3xl num ${score!=null&&score>=80?'text-emerald-400':score!=null&&score>=50?'text-amber-400':'text-red-400'}`}>{score!=null? `${score}%` : '—'}</p><p className="text-[11px] text-white/40">{score!=null? score>=80?'Excellent discipline':score>=50?'Mixed':'Needs work':'Answer 3+ questions'}</p></div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={saveReplay} className={btnPrimary}>Save Replay + Psychology</button>
          <button onClick={()=>{ setPsych({ idea:'', sawAtEntry:'', expected:'', actual:'', followedPlan:null, earlyEntry:null, earlyExit:null, movedStop:null, revenge:null, overtrade:null, differently:'', lesson:'' }); setDecisions([]); }} className={btnGhost}>Clear</button>
        </div>
      </Card>

      {/* analytics */}
      <Card>
        <h3 className="font-black text-sm">Replay Analytics — journal dashboard</h3>
        {stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3"><p className="text-[10px] font-black tracking-widest text-slate-400">REPLAYED</p><p className="font-black text-xl num">{stats.n}</p></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3"><p className="text-[10px] font-black tracking-widest text-slate-400">SIM WIN%</p><p className="font-black text-xl num">{((stats.winsSim/stats.n)*100).toFixed(1)}%</p></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3"><p className="text-[10px] font-black tracking-widest text-slate-400">ACT WIN%</p><p className="font-black text-xl num">{((stats.winsAct/stats.n)*100).toFixed(1)}%</p></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3"><p className="text-[10px] font-black tracking-widest text-slate-400">AVG SIM R</p><p className={`font-black text-xl num ${stats.avgSim>=0?'text-emerald-600':'text-red-600'}`}>{stats.avgSim>=0?'+':''}{stats.avgSim.toFixed(2)}R</p></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3"><p className="text-[10px] font-black tracking-widest text-slate-400">AVG ACT R</p><p className={`font-black text-xl num ${stats.avgAct>=0?'text-emerald-600':'text-red-600'}`}>{stats.avgAct>=0?'+':''}{stats.avgAct.toFixed(2)}R</p></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3"><p className="text-[10px] font-black tracking-widest text-slate-400">SIM-ACT Δ</p><p className={`font-black text-xl num ${stats.diff>=0?'text-emerald-600':'text-red-600'}`}>{stats.diff>=0?'+':''}{stats.diff.toFixed(2)}R</p></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 col-span-2"><p className="text-[10px] font-black tracking-widest text-slate-400">MOST COMMON</p><p className="text-xs mt-1 truncate">{replays.flatMap(r=>r.decisions.map(d=>d.label)).slice(0,3).join(' • ')||'—'}</p></div>
          </div>
        ) : <p className="text-xs text-slate-400 mt-2">No replays yet — save one above to see stats: win rates, avg R, sim-vs-actual, mistakes, setups, timeframe/session breakdowns.</p>}
        {replays.length>0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs"><thead><tr className="text-left text-slate-400"><th>Trade</th><th>Sim R</th><th>Act R</th><th>Score</th><th>When</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {replays.slice(0,8).map(r=>{ const t=trades.find(x=>x.id===r.tradeId); return <tr key={r.id}><td className="py-1.5 font-bold">{t?.pair} {t?.direction}</td><td className={`font-mono font-black ${r.simR!=null&&r.simR>=0?'text-emerald-600':'text-red-600'}`}>{r.simR!=null? `${r.simR>=0?'+':''}${r.simR.toFixed(2)}R`:'—'}</td><td className="font-mono">{r.actualR!=null? `${r.actualR>=0?'+':''}${r.actualR.toFixed(2)}R`:'—'}</td><td className="font-mono">{r.psychology? '—':''}</td><td className="text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</td></tr>; })}
            </tbody></table>
          </div>
        )}
      </Card>
    </div>
  );
}
