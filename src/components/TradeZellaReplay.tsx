import { useEffect, useMemo, useRef, useState } from 'react';
import { PAIRS, TIMEFRAMES, type BacktestTrade, type Direction } from '../lib/types';
import { uid } from '../lib/types';
import TradingViewReplayChart from './TradingViewReplayChart';
import { tvSymbol } from '../lib/tv';

type Candle = { o: number; h: number; l: number; c: number };

function hashSeed(s: string){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return (h>>>0)/4294967295; }
function genCandles(n: number, base: number, vol: number, seedKey=''): Candle[] {
  const out: Candle[] = [];
  let p = base;
  // deterministic when seedKey provided (for past dates), so 2019 replay is reproducible
  const rnd = seedKey ? (()=>{ let a=hashSeed(seedKey); return ()=>{ a=(a*1664525+1013904223)%1; return a; }; })() : Math.random;
  for (let i = 0; i < n; i++) {
    const r1 = typeof rnd==='function'? (rnd as any)() : Math.random();
    const r2 = typeof rnd==='function'? (rnd as any)() : Math.random();
    const r3 = typeof rnd==='function'? (rnd as any)() : Math.random();
    const r4 = typeof rnd==='function'? (rnd as any)() : Math.random();
    const drift = (r1 - 0.48) * vol;
    const o = p;
    const c = o + drift + (r2 - 0.5) * vol * 0.5;
    const h = Math.max(o, c) + r3 * vol * 0.4;
    const l = Math.min(o, c) - r4 * vol * 0.4;
    out.push({ o, h, l, c });
    p = c;
  }
  return out;
}

const SPEEDS = [0.5, 1, 2, 4] as const;

export default function TradeZellaReplay({
  onSave,
  onClose,
}: {
  onSave: (r: BacktestTrade) => void;
  onClose: () => void;
}) {
  const [pair, setPair] = useState(PAIRS[0]);
  const [tf, setTf] = useState('M15');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<'replay' | 'tv'>('replay');
  const [total, setTotal] = useState(120);
  const [visible, setVisible] = useState(30);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const timer = useRef<number | null>(null);

  // trade construction
  const [direction, setDirection] = useState<Direction | null>(null);
  const [entryIdx, setEntryIdx] = useState<number | null>(null);
  const [entryPrice, setEntryPrice] = useState<number | null>(null);
  const [sl, setSl] = useState(0);
  const [tp, setTp] = useState(0);
  const [exitIdx, setExitIdx] = useState<number | null>(null);
  const [exitPrice, setExitPrice] = useState<number | null>(null);

  // pro features
  const [showEMA, setShowEMA] = useState(true);
  const [showVol, setShowVol] = useState(true);
  const [showHTF, setShowHTF] = useState(false);
  const [drawMode, setDrawMode] = useState<'none'|'hLine'|'trend'>('none');
  const [drawings, setDrawings] = useState<{id:string; type:'hLine'; y:number}[]>([]);
  const [pauseAtSLTP, setPauseAtSLTP] = useState(true);

  // journaling
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [planChecks, setPlanChecks] = useState([false, false, false, false]);

  const basePrice = useMemo(() => {
    if (pair.includes('JPY')) return 150;
    if (pair === 'XAU/USD') return 2650;
    if (pair === 'BTC/USD') return 68000;
    if (pair === 'US30') return 41000;
    if (pair === 'NAS100') return 17500;
    return 1.085;
  }, [pair]);
  const vol = useMemo(() => (basePrice > 1000 ? basePrice * 0.003 : basePrice > 100 ? basePrice * 0.004 : 0.0008), [basePrice]);

  const candles = useMemo(() => genCandles(total, basePrice, vol, `${pair}-${startDate}-${tf}`), [total, basePrice, vol, pair, startDate, tf]);
  const visCandles = candles.slice(0, visible);
  // oxlint-disable-next-line react(purity)
  const volumes = useMemo(()=> candles.map((_,i)=> 0.6 + (hashSeed(`${pair}-${i}`)*0.7)), [candles, pair]);
  const ema = (period:number, data:number[])=>{ const k=2/(period+1); let e=data[0]; return data.map(v=> e=v*k+e*(1-k)); };
  const closes = visCandles.map(c=>c.c);
  const ema20 = useMemo(()=> showEMA ? ema(20, closes) : [], [closes, showEMA]);
  const ema50 = useMemo(()=> showEMA ? ema(50, closes) : [], [closes, showEMA]);
  // HTF aggregation (4x)
  const htfCandles = useMemo(()=>{ if(!showHTF) return []; const out:Candle[]=[]; for(let i=0;i<visCandles.length;i+=4){ const g=visCandles.slice(i,i+4); if(!g.length) continue; out.push({o:g[0].o, h:Math.max(...g.map(x=>x.h)), l:Math.min(...g.map(x=>x.l)), c:g[g.length-1].c}); } return out; },[visCandles, showHTF]);

  // MFE/MAE & hold
  const mfeMae = useMemo(()=>{
    if(entryIdx==null || entryPrice==null) return null;
    let mfe=-Infinity, mae=Infinity;
    for(let i=entryIdx;i<visible;i++){ const c=candles[i].c; const pnl=direction==='Buy'?c-entryPrice:entryPrice-c; mfe=Math.max(mfe,pnl); mae=Math.min(mae,pnl); }
    const risk=Math.abs(entryPrice-(sl||entryPrice));
    return { mfe: risk?mfe/risk:0, mae: risk?mae/risk:0, bars: visible-entryIdx };
  },[entryIdx, entryPrice, visible, candles, direction, sl]);

  const priceRange = useMemo(() => {
    const slice = visCandles.length ? visCandles : candles.slice(0, 30);
    const vals = slice.flatMap(c => [c.h, c.l, sl || c.c, tp || c.c, entryPrice ?? c.c, exitPrice ?? c.c]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.12 || vol;
    return { lo: lo - pad, hi: hi + pad };
  }, [visCandles, candles, sl, tp, entryPrice, exitPrice, vol]);

  const curCandlePrice = visCandles[visCandles.length - 1]?.c ?? basePrice;

  // playback
  useEffect(() => {
    if (!playing) return;
    const interval = 900 / speed;
    timer.current = window.setInterval(() => {
      setVisible(v => {
        if (v >= total) { setPlaying(false); return v; }
        // pause at SL/TP hit
        if(pauseAtSLTP && entryPrice!=null && direction){
          const c=candles[v]?.c; if(c!=null){
            const hitSL = direction==='Buy'? c<=sl : c>=sl;
            const hitTP = direction==='Buy'? c>=tp : c<=tp;
            if((hitSL||hitTP) && v>=(entryIdx??0)+1){ setPlaying(false); return v+1; }
          }
        }
        return v + 1;
      });
    }, interval);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [playing, speed, total, pauseAtSLTP, entryPrice, direction, sl, tp, entryIdx, candles]);

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  const canEnter = entryIdx == null;
  const canExit = entryIdx != null && exitIdx == null;

  const doEntry = (dir: Direction) => {
    const idx = visible - 1;
    const price = candles[idx].c;
    const risk = vol * 8;
    const reward = risk * 2;
    setDirection(dir);
    setEntryIdx(idx);
    setEntryPrice(price);
    setSl(dir === 'Buy' ? price - risk : price + risk);
    setTp(dir === 'Buy' ? price + reward : price - reward);
    setExitIdx(null);
    setExitPrice(null);
  };
  const doExit = () => {
    if (entryIdx == null) return;
    const idx = visible - 1;
    setExitIdx(idx);
    setExitPrice(candles[idx].c);
    setPlaying(false);
  };
  const resultR = useMemo(() => {
    if (entryPrice == null || exitPrice == null || direction == null) return null;
    const risk = Math.abs(entryPrice - sl);
    if (risk === 0) return 0;
    const pl = direction === 'Buy' ? exitPrice - entryPrice : entryPrice - exitPrice;
    return pl / risk;
  }, [entryPrice, exitPrice, direction, sl]);

  const save = () => {
    if (direction == null || entryPrice == null || exitPrice == null) return;
    const r: BacktestTrade = {
      id: uid(),
      date: startDate,
      pair,
      direction,
      entry: Number(entryPrice.toFixed(5)),
      stopLoss: Number(sl.toFixed(5)),
      takeProfit: Number(tp.toFixed(5)),
      exit: Number(exitPrice.toFixed(5)),
      lot: 1,
      resultR: Math.round((resultR ?? 0) * 100) / 100,
      strategy: 'Trade Replay',
      session: 'Replay',
      setup: tags.join(', '),
      timeframe: tf,
      notes,
    };
    onSave(r);
  };

  // chart geometry
  const W = 720, H = 260, padL = 8, padR = 64, padT = 12, padB = 18;
  const Y = (v: number) => padT + (1 - (v - priceRange.lo) / (priceRange.hi - priceRange.lo || 1)) * (H - padT - padB);
  const X = (i: number, n: number) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#080B12] text-white">
      {/* top bar */}
      <div className="h-[56px] shrink-0 flex items-center justify-between px-4 border-b border-white/10 bg-[#0E1220]">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">✕</button>
          <span className="text-[11px] font-black tracking-[0.16em] text-white/40">TRADE REPLAY LAB</span>
          <span className="hidden sm:inline text-[11px] font-bold text-white/20">›</span>
          <span className="hidden sm:inline text-[12px] font-bold">Make Backtest</span>
          <span className="hidden md:inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest px-2 py-1 rounded-full bg-[#00E676]/10 border border-[#00E676]/15 text-[#00E676]">● REPLAY</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center p-1 rounded-full bg-white/5 border border-white/10">
            <button onClick={() => setMode('replay')} className={`px-3 py-1 rounded-full text-xs font-black ${mode==='replay'?'bg-white text-black':'text-white/50'}`}>Replay</button>
            <button onClick={() => setMode('tv')} className={`px-3 py-1 rounded-full text-xs font-black ${mode==='tv'?'bg-white text-black':'text-white/50'}`}>TradingView</button>
          </div>
          <a href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol(pair))}`} target="_blank" rel="noopener" className="hidden md:inline-flex h-8 items-center gap-1.5 rounded-full bg-[#131722] border border-white/10 px-3 text-xs font-bold text-white hover:bg-white hover:text-black">↗ TradingView.com</a>
          <select value={pair} onChange={e => setPair(e.target.value)} className="h-8 rounded-lg bg-white/5 border border-white/10 text-xs font-bold px-2">
            {PAIRS.map(p => <option key={p} value={p} className="text-black">{p}</option>)}
          </select>
          <select value={tf} onChange={e => setTf(e.target.value)} className="h-8 rounded-lg bg-white/5 border border-white/10 text-xs font-bold px-2">
            {TIMEFRAMES.map(t => <option key={t} value={t} className="text-black">{t}</option>)}
          </select>
          <select value={total} onChange={e=>{setTotal(Number(e.target.value)); setVisible(30);}} className="hidden sm:block h-8 rounded-lg bg-white/5 border border-white/10 text-xs font-bold px-2">
            <option value={120}>120 bars</option><option value={500}>500 bars</option><option value={1500}>1500 bars</option><option value={3000}>3000 bars (5y D1)</option><option value={5000}>5000 bars (10y+)</option>
          </select>
          <input type="date" value={startDate} min="2000-01-01" max={new Date().toISOString().slice(0,10)} onChange={e => setStartDate(e.target.value)} className="h-8 rounded-lg bg-white/5 border border-white/10 text-xs font-mono px-2" />
        </div>
      </div>

      <div className="flex-1 grid lg:grid-cols-[1fr_340px] overflow-hidden">
        {/* chart */}
        <div className="flex flex-col min-w-0 bg-[#0A0E1A] p-3 sm:p-4 overflow-auto">
          {/* info bar + pro toggles */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-black">{pair}</span>
              <span className="text-[11px] font-mono text-white/40">{curCandlePrice.toFixed(pair.includes('JPY') ? 2 : pair.includes('XAU') || pair.includes('US30') || pair.includes('NAS') || pair.includes('BTC') ? 2 : 5)}</span>
              {resultR != null && <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${resultR >= 0 ? 'bg-[#00E676]/10 border-[#00E676]/15 text-[#00E676]' : 'bg-[#FF3B3B]/10 border-[#FF3B3B]/15 text-[#FF3B3B]'}`}>{resultR >= 0 ? '+' : ''}{resultR.toFixed(2)}R</span>}
              {mfeMae && <span className="hidden sm:inline text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">MFE {mfeMae.mfe.toFixed(2)}R • MAE {mfeMae.mae.toFixed(2)}R • {mfeMae.bars} bars</span>}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={()=>setShowEMA(v=>!v)} className={`px-2 py-1 rounded-full text-[10px] font-bold border ${showEMA?'bg-[#5B7FFF] text-white border-[#5B7FFF]':'bg-white/5 border-white/10 text-white/40'}`}>EMA 20/50</button>
              <button onClick={()=>setShowVol(v=>!v)} className={`px-2 py-1 rounded-full text-[10px] font-bold border ${showVol?'bg-white text-black border-white':'bg-white/5 border-white/10 text-white/40'}`}>VOL</button>
              <button onClick={()=>setShowHTF(v=>!v)} className={`px-2 py-1 rounded-full text-[10px] font-bold border ${showHTF?'bg-amber-500 text-black border-amber-500':'bg-white/5 border-white/10 text-white/40'}`}>HTF x4</button>
              <span className="w-px h-4 bg-white/10" />
              <button onClick={()=>setDrawMode(m=>m==='hLine'?'none':'hLine')} className={`px-2 py-1 rounded-full text-[10px] font-bold border ${drawMode==='hLine'?'bg-amber-500 text-black border-amber-500':'bg-white/5 border-white/10 text-white/40'}`}>— H Line</button>
              <span className="text-[10px] font-mono text-white/30 hidden sm:inline">{tf} • {visible}/{total}</span>
            </div>
          </div>
          {showHTF && htfCandles.length>0 && (
            <div className="mb-3 rounded-xl border border-amber-500/15 bg-amber-500/5 px-3 py-2">
              <div className="text-[10px] font-black tracking-widest text-amber-400">HIGHER TIMEFRAME x4 — {htfCandles.length} HTF candles</div>
              <div className="mt-1.5 flex items-end gap-1 h-14">{htfCandles.map((c,i)=>{const isG=c.c>=c.o; const h=40+hashSeed(`${pair}-htf-${i}`)*40; return <div key={i} className={`flex-1 rounded-sm ${isG?'bg-[#00E676]/60':'bg-[#FF3B3B]/60'}`} style={{height: `${h}%`}} />})}</div>
            </div>
          )}

          {mode === 'tv' ? (
            <div className="rounded-xl border border-white/10 overflow-hidden bg-[#080B12] flex flex-col">
              <TradingViewReplayChart symbol={tvSymbol(pair)} interval={tf === 'M5' ? '5' : tf === 'M15' ? '15' : tf === 'H1' ? '60' : tf === 'H4' ? '240' : 'D'} startDate={startDate} visibleBars={visible} totalBars={total} />
              {/* native TradingView bar-replay controls */}
              <div className="px-3 py-2.5 bg-[#0E1220] border-y border-white/5 flex items-center gap-2">
                <button onClick={()=>setPlaying(p=>!p)} className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center text-[12px] font-black">{playing?'❚❚':'▶'}</button>
                <button onClick={()=>setVisible(v=>Math.max(1,v-1))} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 text-white/60">◀◀</button>
                <button onClick={()=>setVisible(v=>Math.min(total,v+1))} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 text-white/60">▶▶</button>
                <div className="flex-1 mx-2"><input type="range" min={1} max={total} value={visible} onChange={e=>setVisible(Number(e.target.value))} className="w-full accent-white h-1" /></div>
                <div className="hidden sm:flex gap-1">{([0.5,1,2,4] as const).map(s=><button key={s} onClick={()=>setSpeed(s)} className={`px-2 py-1 rounded-full text-[10px] font-bold border ${speed===s?'bg-white text-black':'bg-white/5 border-white/10 text-white/40'}`}>{s}x</button>)}</div>
              </div>
              {/* TradingView backtesting toolbar */}
              <div className="px-3 py-3 bg-[#0E1220] border-t border-white/5 space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-black tracking-widest text-white/60">
                  <span className="w-2 h-2 rounded-full bg-[#00E676] animate-pulse" /> TRADINGVIEW BACKTESTING TOOLS
                  <span className="ml-auto text-[10px] font-mono text-white/30">{tvSymbol(pair)} • {tf}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-white/40">
                  Use <b className="text-white">Long/Short Position</b> + <b className="text-white">Trend Line</b> tools in the TradingView toolbar (top left of chart). Right-click the position tool to set entry, SL, TP — then read prices and enter them below to save as a professional backtest.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <label className="text-[10px] font-bold text-white/40">Entry <input type="number" step="0.00001" value={entryPrice ?? ''} onChange={e=>{const v=Number(e.target.value); setEntryPrice(v||null); if(v && direction==null) setDirection('Buy');}} placeholder="1.08500" className="mt-1 w-full h-8 rounded-lg bg-[#080B12] border border-white/10 px-2 text-xs font-mono text-white" /></label>
                  <label className="text-[10px] font-bold text-white/40">Stop Loss <input type="number" step="0.00001" value={sl || ''} onChange={e=>setSl(Number(e.target.value))} placeholder="1.08300" className="mt-1 w-full h-8 rounded-lg bg-[#080B12] border border-white/10 px-2 text-xs font-mono text-white" /></label>
                  <label className="text-[10px] font-bold text-white/40">Take Profit <input type="number" step="0.00001" value={tp || ''} onChange={e=>setTp(Number(e.target.value))} placeholder="1.08900" className="mt-1 w-full h-8 rounded-lg bg-[#080B12] border border-white/10 px-2 text-xs font-mono text-white" /></label>
                  <label className="text-[10px] font-bold text-white/40">Exit <input type="number" step="0.00001" value={exitPrice ?? ''} onChange={e=>setExitPrice(Number(e.target.value) || null)} placeholder="1.08700" className="mt-1 w-full h-8 rounded-lg bg-[#080B12] border border-white/10 px-2 text-xs font-mono text-white" /></label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={()=>setDirection('Buy')} className={`h-8 px-4 rounded-full text-xs font-black ${direction==='Buy'?'bg-[#00E676] text-black':'bg-white/5 border border-white/10 text-white/60'}`}>Buy</button>
                  <button onClick={()=>setDirection('Sell')} className={`h-8 px-4 rounded-full text-xs font-black ${direction==='Sell'?'bg-[#FF3B3B] text-white':'bg-white/5 border border-white/10 text-white/60'}`}>Sell</button>
                  <button onClick={()=>{const v=Number(entryPrice); if(v) setEntryPrice(v);}} className="h-8 px-3 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-white/60">Use chart price</button>
                  <span className={`ml-auto text-xs font-black px-3 py-1.5 rounded-full border ${resultR!=null && resultR>=0?'bg-[#00E676]/10 border-[#00E676]/20 text-[#00E676]': resultR!=null?'bg-[#FF3B3B]/10 border-[#FF3B3B]/20 text-[#FF3B3B]':'bg-white/5 border-white/10 text-white/30'}`}>{resultR!=null?`${resultR>=0?'+':''}${resultR.toFixed(2)}R`:'— R'}</span>
                </div>
                <p className="text-[10px] text-white/25">Tip: Draw on TradingView → copy prices here → <b className="text-white/60">Save Backtest → Journal</b> (right sidebar) uses same professional fields: rating, commission, mistakes, screenshots.</p>
              </div>
              <div className="px-3 py-2 bg-[#0E1220] border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-white/30">
                <span>Live via https://www.tradingview.com • {tvSymbol(pair)}</span>
                <a href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol(pair))}`} target="_blank" rel="noopener" className="text-white/60 hover:text-white underline">Open full TradingView ↗</a>
              </div>
            </div>
          ) : (
          <div className="rounded-xl border border-white/10 bg-[#080B12] overflow-hidden">
            <svg onClick={e=>{
              if(drawMode!=='hLine') return;
              const rect=(e.currentTarget as SVGElement).getBoundingClientRect();
              const yPct=(e.clientY-rect.top)/rect.height;
              const price=(priceRange as any).hi - yPct*((priceRange as any).hi-(priceRange as any).lo);
              setDrawings(d=>[...d,{id:uid(), type:'hLine', y:price}]);
            }} viewBox={`0 0 ${W} ${H}`} className={`w-full block ${drawMode==='hLine'?'cursor-crosshair':'cursor-default'}`} style={{height: showVol? 300 : 260}}>
              {/* grid */}
              {[0, 1, 2, 3].map(i => <line key={i} x1={padL} x2={W - padR} y1={padT + (i * (H - padT - padB)) / 3} y2={padT + (i * (H - padT - padB)) / 3} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 6" />)}
              {/* SL/TP */}
              {entryIdx != null && <line x1={padL} x2={W - padR} y1={Y(sl)} y2={Y(sl)} stroke="#FF3B3B" strokeDasharray="6 4" strokeWidth={1.2} />}
              {entryIdx != null && <line x1={padL} x2={W - padR} y1={Y(tp)} y2={Y(tp)} stroke="#00E676" strokeDasharray="6 4" strokeWidth={1.2} />}
              {entryIdx != null && <text x={W - padR + 4} y={Y(sl) + 3} fontSize={9} fill="#FF3B3B" fontWeight={700}>SL</text>}
              {entryIdx != null && <text x={W - padR + 4} y={Y(tp) + 3} fontSize={9} fill="#00E676" fontWeight={700}>TP</text>}
              {entryIdx != null && <text x={W - padR + 4} y={Y(entryPrice!)+3} fontSize={9} fill="#5B7FFF" fontWeight={700}>ENTRY</text>}
              {exitIdx != null && <text x={W - padR + 4} y={Y(exitPrice!)+3} fontSize={9} fill={resultR!=null && resultR>=0?'#00E676':'#FF3B3B'} fontWeight={700}>EXIT</text>}

              {/* EMA lines */}
              {showEMA && ema20.length>1 && <path d={ema20.map((v,i)=>`${i?'L':'M'}${X(i,visCandles.length).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')} fill="none" stroke="#5B7FFF" strokeWidth={1.2} opacity={0.9} />}
              {showEMA && ema50.length>1 && <path d={ema50.map((v,i)=>`${i?'L':'M'}${X(i,visCandles.length).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')} fill="none" stroke="#F59E0B" strokeWidth={1.1} opacity={0.85} />}

              {/* drawings */}
              {drawings.map(d=> <g key={d.id}><line x1={padL} x2={W-padR} y1={Y(d.y)} y2={Y(d.y)} stroke="#EAB308" strokeDasharray="4 4" strokeWidth={1} /><text x={W-padR+4} y={Y(d.y)+3} fontSize={8} fill="#EAB308" fontWeight={700}>{d.y.toFixed(5)}</text><text x={W-padR+4} y={Y(d.y)-6} fontSize={7} fill="#EAB308" className="cursor-pointer" onClick={()=>setDrawings(s=>s.filter(x=>x.id!==d.id))}>✕</text></g>)}

              {/* candles */}
              {visCandles.map((c, i) => {
                const x = X(i, visCandles.length);
                const isGreen = c.c >= c.o;
                const w = Math.max(3, (W - padL - padR) / visCandles.length - 2);
                const x0 = x - w / 2;
                return (
                  <g key={i}>
                    <line x1={x} x2={x} y1={Y(c.h)} y2={Y(c.l)} stroke={isGreen ? '#00E676' : '#FF3B3B'} strokeWidth={1.2} opacity={0.9} />
                    <rect x={x0} y={Math.min(Y(c.o), Y(c.c))} width={w} height={Math.max(1, Math.abs(Y(c.o)-Y(c.c)))} rx={1} fill={isGreen ? '#00E676' : '#FF3B3B'} />
                    {entryIdx === i && <circle cx={x} cy={Y(c.c)} r={5} fill={direction==='Buy'?'#00E676':'#FF3B3B'} stroke="#fff" strokeWidth={2} />}
                    {exitIdx === i && <circle cx={x} cy={Y(c.c)} r={5} fill={resultR!=null && resultR>=0 ? '#00E676':'#FF3B3B'} stroke="#fff" strokeWidth={2} />}
                  </g>
                );
              })}
              {/* playhead */}
              <line x1={X(visCandles.length-1, visCandles.length)} x2={X(visCandles.length-1, visCandles.length)} y1={padT} y2={H-padB} stroke="rgba(255,255,255,0.9)" strokeWidth={1} opacity={0.7} />
            </svg>
            {/* volume */}
            {showVol && (
              <div className="h-[56px] border-t border-white/5 bg-[#0E1220] px-2 py-1 flex items-end gap-px">
                {visCandles.map((c,i)=>{ const v=volumes[i]??0.5; const isG=c.c>=c.o; return <div key={i} className={`flex-1 rounded-sm ${isG?'bg-[#00E676]/40':'bg-[#FF3B3B]/40'}`} style={{height: `${18+v*38}px`}} />})}
              </div>
            )}

            {/* timeline */}
            <div className="px-3 py-3 border-t border-white/5 bg-[#0E1220] space-y-2">
              <div className="flex items-center gap-2">
                <button onClick={() => setPlaying(p => !p)} className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center text-[12px] font-black shrink-0">{playing ? '❚❚' : '▶'}</button>
                <button onClick={() => setVisible(v => Math.max(1, v-1))} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 text-white/60 flex items-center justify-center text-[10px]">◀◀</button>
                <button onClick={() => setVisible(v => Math.min(total, v+1))} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 text-white/60 flex items-center justify-center text-[10px]">▶▶</button>
                <div className="flex-1 mx-2">
                  <input type="range" min={1} max={total} value={visible} onChange={e => setVisible(Number(e.target.value))} className="w-full accent-white h-1" />
                  <div className="flex justify-between text-[9px] font-mono text-white/25 mt-1"><span>Start</span><span>{startDate}</span><span>{total} bars</span></div>
                </div>
                <div className="hidden sm:flex items-center gap-1">
                  {SPEEDS.map(s => (
                    <button key={s} onClick={() => setSpeed(s)} className={`px-2 py-1 rounded-full text-[10px] font-bold border ${speed===s?'bg-white text-black border-white':'bg-white/5 border-white/10 text-white/40'}`}>{s}x</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button disabled={!canEnter} onClick={() => doEntry('Buy')} className={`h-9 px-4 rounded-full text-xs font-black ${canEnter?'bg-[#00E676] text-black hover:bg-[#00CC6A]':'bg-white/5 text-white/20 border border-white/10'}`}>Buy Long</button>
                <button disabled={!canEnter} onClick={() => doEntry('Sell')} className={`h-9 px-4 rounded-full text-xs font-black ${canEnter?'bg-[#FF3B3B] text-white hover:bg-[#E63535]':'bg-white/5 text-white/20 border border-white/10'}`}>Sell Short</button>
                <button disabled={!canExit} onClick={doExit} className={`h-9 px-4 rounded-full text-xs font-black border ${canExit?'bg-white text-black':'bg-white/5 text-white/20 border-white/10'}`}>Exit Position</button>
                <span className="ml-auto flex items-center gap-2 text-[11px] font-mono">
                  <span className="text-white/40">SL</span><input type="number" step={0.0001} value={sl||''} onChange={e=>setSl(Number(e.target.value))} className="w-24 h-7 rounded bg-white/5 border border-white/10 px-2 text-white text-xs" placeholder="—" />
                  <span className="text-white/40">TP</span><input type="number" step={0.0001} value={tp||''} onChange={e=>setTp(Number(e.target.value))} className="w-24 h-7 rounded bg-white/5 border border-white/10 px-2 text-white text-xs" placeholder="—" />
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold flex-wrap">
                <button onClick={() => entryIdx!=null && setVisible(entryIdx+1)} disabled={entryIdx==null} className="px-2 py-1 rounded-full bg-white/5 border border-white/10 disabled:opacity-30">Jump to Entry</button>
                <button onClick={() => exitIdx!=null && setVisible(exitIdx+1)} disabled={exitIdx==null} className="px-2 py-1 rounded-full bg-white/5 border border-white/10 disabled:opacity-30">Jump to Exit</button>
                <button onClick={()=>setPauseAtSLTP(v=>!v)} className={`px-2 py-1 rounded-full border ${pauseAtSLTP?'bg-amber-500 text-black border-amber-500':'bg-white/5 border-white/10 text-white/40'}`}>Pause at SL/TP {pauseAtSLTP?'●':''}</button>
                <button onClick={()=>{ if(drawings.length) setDrawings([]); }} className="px-2 py-1 rounded-full bg-white/5 border border-white/10">Clear drawings</button>
                <button onClick={()=>{ navigator.clipboard?.writeText(`${pair} ${tf} ${startDate} entry ${entryPrice} SL ${sl} TP ${tp} exit ${exitPrice} R ${resultR}`); }} className="px-2 py-1 rounded-full bg-white text-black">Copy trade</button>
                <span className="ml-auto text-white/30 font-mono">SPACE pause • ← → step • H for H-line</span>
              </div>
            </div>
          </div>
          )}
          <div className="mt-3 flex items-center justify-between text-[11px]">
            {mode==='tv'
              ? <span className="text-white/30">Live TradingView • Use Long/Short Position tool → copy prices below → Save →</span>
              : <span className="text-white/30">Synthetic tick-by-tick demo • Use Buy/Sell to create a real BacktestTrade • Then journal it →</span>}
            <span className="text-white/20 font-mono">{direction ?? 'No position'} {entryPrice!=null?`@ ${entryPrice.toFixed(5)} → ${exitPrice!=null?exitPrice.toFixed(5):'open'}`:''}</span>
          </div>
        </div>

        {/* journal sidebar */}
        <div className="border-l border-white/10 bg-[#0E1220] flex flex-col overflow-hidden">
          <div className="p-4 overflow-auto space-y-4 flex-1">
            <div>
              <div className="text-[10px] font-black tracking-[0.16em] text-white/30">INTEGRATED JOURNALING</div>
              <h3 className="mt-1 font-black text-[14px]">Document Everything</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-white/40">Tag mistakes as you find them, check against your plan, and save — no app switching.</p>
            </div>

            <div className="rounded-xl bg-white/[0.04] border border-white/5 p-3">
              <div className="text-[11px] font-bold">Mistake tags</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['Overtrading','FOMO','Late entry','Revenge','Chased price','No stop'].map(t => (
                  <button key={t} onClick={()=>setTags(s=>s.includes(t)?s.filter(x=>x!==t):[...s,t])} className={`text-[10px] px-2 py-1 rounded-full border font-bold ${tags.includes(t)?'bg-amber-500 text-black border-amber-500':'bg-white/5 border-white/10 text-white/40'}`}>{t}</button>
                ))}
              </div>
              {tags.length>0 && <div className="mt-2 text-[10px] text-white/30">{tags.join(' • ')}</div>}
            </div>

            <div className="rounded-xl bg-white/[0.04] border border-white/5 p-3">
              <div className="text-[11px] font-bold flex items-center justify-between">Trading plan <span className="text-[10px] text-[#00E676]">{planChecks.filter(Boolean).length}/4 checks</span></div>
              <div className="mt-2 space-y-1.5">
                {['Clear H1 trend / bias','Liquidity sweep seen','SL beyond structure','Min 1:2 R:R'].map((c,i)=>(
                  <label key={c} className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={planChecks[i]} onChange={e=>setPlanChecks(p=>p.map((v,idx)=>idx===i?e.target.checked:v))} className="accent-[#00E676]" /><span className={planChecks[i]?'text-white':'text-white/40'}>{c}</span></label>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-white/[0.04] border border-white/5 p-3">
              <div className="text-[11px] font-bold">Notes while you replay</div>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="Entered late, structure broken, should have waited for retest..." className="mt-2 w-full rounded-lg bg-[#080B12] border border-white/10 p-2 text-xs text-white placeholder:text-white/20" />
            </div>

            <div className="rounded-xl bg-[#00E676]/5 border border-[#00E676]/10 p-3">
              <div className="flex items-center justify-between text-[11px]"><span className="font-bold">Trade info</span><span className="font-mono text-white/30">{pair} {tf}</span></div>
              <div className="mt-2 space-y-1 text-[11px] font-mono">
                <div className="flex justify-between"><span className="text-white/40">Entry</span><span>{entryPrice!=null?entryPrice.toFixed(5):'—'} {direction?`(${direction})`:''}</span></div>
                <div className="flex justify-between"><span className="text-white/40">SL / TP</span><span>{sl?sl.toFixed(5):'—'} / {tp?tp.toFixed(5):'—'}</span></div>
                <div className="flex justify-between"><span className="text-white/40">Exit</span><span>{exitPrice!=null?exitPrice.toFixed(5):'—'}</span></div>
                <div className="flex justify-between font-bold"><span className="text-white/40">Result</span><span className={resultR!=null && resultR>=0?'text-[#00E676]':resultR!=null && resultR<0?'text-[#FF3B3B]':'text-white/30'}>{resultR!=null?`${resultR>=0?'+':''}${resultR.toFixed(2)}R`:'—'}</span></div>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-white/10 bg-[#0E1220] space-y-2">
            <button
              disabled={resultR==null}
              onClick={save}
              className={`w-full h-11 rounded-full font-black text-sm ${resultR!=null?'bg-[#00E676] text-black hover:bg-[#00CC6A]':'bg-white/5 text-white/20 border border-white/10'}`}
            >
              Save Backtest → Journal
            </button>
            <button onClick={()=>{setDirection(null);setEntryIdx(null);setEntryPrice(null);setExitIdx(null);setExitPrice(null);setVisible(30);}} className="w-full h-9 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-white/60">Reset Replay</button>
            <p className="text-[10px] text-center text-white/20">Saves to Backtested Trades with tick-by-tick R calculation</p>
          </div>
        </div>
      </div>
    </div>
  );
}
