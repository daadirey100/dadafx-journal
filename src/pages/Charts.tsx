import { useEffect, useMemo, useRef, useState } from 'react';
import TradingViewChart from '../components/TradingViewChart';
import TradingViewLibraryChart from '../components/TradingViewLibraryChart';
import TradingViewReplayChart from '../components/TradingViewReplayChart';
import { Card, Glyph, PageHeader } from '../components/ui';
import { PAIRS, type Trade } from '../lib/types';
import { tvSymbol } from '../lib/tv';
import { useLocal } from '../lib/store';
import { SUPABASE_URL } from '../lib/supabase';

export default function Charts() {
  const [watchlist] = useLocal<string[]>('dadafx.watchlist', ['EUR/USD','GBP/USD','XAU/USD']);
  const [trades] = useLocal<Trade[]>('dadafx.trades', []);
  const [pair, setPair] = useState(watchlist[0] ?? 'EUR/USD');
  const [engine, setEngine] = useState<'widget' | 'library'>('widget');
  const [fit, setFit] = useState(false);
  const [interval, setInterval] = useState('60');
  const [studies, setStudies] = useState<string[]>(['RSI@tv-basicstudies']);
  const [showTools, setShowTools] = useState(false);
  const [showJournalOverlay, setShowJournalOverlay] = useState(true);
  const [barReplay, setBarReplay] = useState(false);
  const [replayBars, setReplayBars] = useState(80);
  const [replayTotal] = useState(200);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<0.5|1|2|5|10>(1);
  const [replayStart, setReplayStart] = useState(()=> new Date(Date.now()-30*864e5).toISOString().slice(0,10));
  const replayTimer = useRef<number | null>(null);
  // oxlint-disable-next-line react(set-state-in-effect)
  useEffect(()=>{ if(!barReplay) setReplayPlaying(false); }, [barReplay]);
  useEffect(()=>{
    if(!replayPlaying) return;
    const ms = 800 / replaySpeed;
    replayTimer.current = window.setInterval(()=> setReplayBars(v=> v>=replayTotal ? (setReplayPlaying(false), v) : v+1), ms);
    return ()=>{ if(replayTimer.current) window.clearInterval(replayTimer.current); };
  }, [replayPlaying, replaySpeed, replayTotal]);
  useEffect(()=>()=>{ if(replayTimer.current) window.clearInterval(replayTimer.current); },[]);
  const tv = tvSymbol(pair);
  const toggleStudy = (s: string) => setStudies(p => p.includes(s) ? p.filter(x=>x!==s) : [...p, s]);

  const filteredTrades = useMemo(() => trades.filter(t => t.pair === pair).slice(-20), [trades, pair]);
  const marks = useMemo(() => {
    if (!showJournalOverlay) return [];
    return filteredTrades.map(t => {
      const ts = Math.floor(new Date(t.date).getTime()/1000);
      const exitTs = t.exitAt ? Math.floor(new Date(t.exitAt).getTime()/1000) : ts + 3600;
      // entry mark + exit mark
      return [
        { time: ts, price: t.entry, dir: (t.direction.toLowerCase() as 'buy'|'sell'), label: `${t.direction} ${t.lot} lots @${t.entry}` },
        ...(t.exit != null ? [{ time: exitTs, price: t.exit, dir: (t.direction.toLowerCase() as 'buy'|'sell'), label: `Exit @${t.exit}` }] : []),
      ];
    }).flat();
  }, [filteredTrades, showJournalOverlay]);
  const levels = useMemo(() => {
    if (!showJournalOverlay) return [];
    const out: { price: number; label: string; color: string }[] = [];
    for (const t of filteredTrades.slice(-5)) {
      if (t.stopLoss) out.push({ price: t.stopLoss, label: `SL ${t.pair}`, color: '#ef4444' });
      if (t.takeProfit) out.push({ price: t.takeProfit, label: `TP ${t.pair}`, color: '#22c55e' });
      out.push({ price: t.entry, label: `Entry ${t.direction}`, color: '#6366f1' });
      if (t.exit != null) out.push({ price: t.exit, label: 'Exit', color: '#8b5cf6' });
    }
    return out;
  }, [filteredTrades, showJournalOverlay]);

  return (
    <div className={`${fit ? 'fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 p-2 sm:p-3 flex flex-col' : 'space-y-4'}`}>
      <div className={fit ? 'shrink-0' : ''}>
      <PageHeader
        eyebrow="Live markets — TradingView"
        title="TradingView Charts"
        sub={<>Tap a pair, the chart swaps instantly. TradingView data — no API key needed. Journal trades overlay like TradingView. <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{tv}</span></>}
        right={<>
          <button onClick={()=>setFit(!fit)} className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold hover:border-indigo-400 transition hidden sm:inline-flex items-center gap-1.5">
            <Glyph name={fit ? 'x' : 'chart'} className="w-4 h-4" />{fit ? 'Exit fit' : 'Fit page'}
          </button>
          <a href={`https://www.tradingview.com/symbols/${tv.replace(':','-').replace('/','')}/`} target="_blank" rel="noreferrer" className="hidden sm:inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold hover:border-indigo-400 transition">
            <Glyph name="trend" className="w-4 h-4" /> Open on TradingView ↗
          </a>
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            <button onClick={() => setEngine('widget')} className={`h-8 px-3 rounded-md text-xs font-extrabold transition ${engine==='widget' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Advanced Chart</button>
            <button onClick={() => setEngine('library')} className={`h-8 px-3 rounded-md text-xs font-extrabold transition ${engine==='library' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Library</button>
          </div>
        </>}
      />
      </div>

      {!fit && (
        <Card className="!py-3 text-[13px]">
          <p className="font-extrabold">How to connect your TradingView account</p>
          <ol className="list-decimal ml-5 mt-1.5 space-y-1 text-slate-600 dark:text-slate-300">
            <li>Go to <b>Brokers → TradingView → Generate TradingView token</b> (shown once).</li>
            <li>In TradingView: open chart → <b>Create Alert</b> → check <b>Webhook URL</b> → paste <code className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-1 rounded break-all">{SUPABASE_URL}/functions/v1/broker-sync</code></li>
            <li>Paste the alert JSON from the broker dialog (replace <code className="font-mono text-[11px]">PASTE_TOKEN_HERE</code> with your token). Every alert fires → journal trade → appears below + on chart.</li>
            <li>Or just browse: your TradingView login at <a href="https://www.tradingview.com" target="_blank" rel="noreferrer" className="text-indigo-600 underline">tradingview.com</a> already gives you drawings — this page mirrors how TV sees the pair. Toggle <b>Journal overlay</b> to see your DadaFX trades exactly as TV would draw entry/SL/TP.</li>
          </ol>
        </Card>
      )}

      <Card className={fit ? 'shrink-0' : ''}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Pair</span>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set([...watchlist, ...PAIRS])].slice(0,16).map(p => (
              <button key={p} onClick={() => setPair(p)} className={`h-8 px-3 rounded-lg text-xs font-bold border transition ${pair===p ? 'bg-indigo-600 text-white border-indigo-600 shadow' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}>{p}</button>
            ))}
          </div>
          <select value={pair} onChange={e => setPair(e.target.value)} className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold ml-auto">
            {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[11px] font-bold text-slate-400">Tools</span>
          <select value={interval} onChange={e=>setInterval(e.target.value)} className="h-8 px-2 rounded-lg border bg-white dark:bg-slate-900 text-xs font-bold">
            {['1','5','15','60','240','D','W'].map(i=> <option key={i} value={i}>{i==='1'?'1m':i==='5'?'5m':i==='15'?'15m':i==='60'?'1H':i==='240'?'4H':i==='D'?'1D':'1W'}</option>)}
          </select>
          {[
            ['RSI','RSI@tv-basicstudies'],
            ['MACD','MACD@tv-basicstudies'],
            ['BB','BB@tv-basicstudies'],
            ['MA','MASimple@tv-basicstudies'],
            ['Volume','Volume@tv-basicstudies'],
          ].map(([label, id])=>(
            <button key={id} onClick={()=>toggleStudy(id)} className={`h-8 px-2.5 rounded-lg text-xs font-bold border ${studies.includes(id) ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-800' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}>{label}</button>
          ))}
          <button onClick={()=>setShowTools(!showTools)} className={`h-8 px-2.5 rounded-lg text-xs font-bold border ${showTools ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-900'}`}>{showTools ? 'Tools on' : 'Tools off'}</button>
          <button onClick={()=>setShowJournalOverlay(!showJournalOverlay)} className={`h-8 px-2.5 rounded-lg text-xs font-bold border ${showJournalOverlay ? 'bg-violet-600 text-white border-violet-600' : 'bg-white dark:bg-slate-900'}`}>{showJournalOverlay ? 'Journal overlay ON' : 'Journal off'}</button>
          <button onClick={()=>setBarReplay(!barReplay)} className={`h-8 px-2.5 rounded-lg text-xs font-bold border ${barReplay ? 'bg-[#00E676] text-black border-[#00E676]' : 'bg-white dark:bg-slate-900'}`}>{barReplay ? 'Bar Replay ON' : 'Bar Replay'}</button>
          <span className="text-[11px] text-slate-400 ml-auto">Interval + indicators → live{filteredTrades.length ? ` · ${filteredTrades.length} journal trades for ${pair}` : ''}</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">Watchlist stars above · <b>Library</b> = TradingView engine with your entries as TV would draw them (pins + SL/TP lines) · <b>Advanced Chart</b> = TradingView widget (symbol search, drawings inside widget).</p>
      </Card>

      {engine === 'widget' ? (
        <Card pad={false} className={`overflow-hidden flex flex-col ${fit ? 'flex-1 min-h-0' : ''}`}>
          {barReplay && (
            <div className="px-3 py-2.5 bg-[#080B12] border-b border-white/10 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-[0.14em] text-[#00E676]"><span className="w-2 h-2 rounded-full bg-[#00E676] animate-pulse" /> BAR REPLAY</span>
              <input type="date" value={replayStart} onChange={e=>setReplayStart(e.target.value)} className="h-7 rounded-lg bg-white/5 border border-white/10 px-2 text-xs font-mono" title="Replay from" />
              <button onClick={()=>setReplayPlaying(p=>!p)} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${replayPlaying?'bg-amber-500 text-black':'bg-white text-black'}`}>{replayPlaying?'❚❚':'▶'}</button>
              <button onClick={()=>setReplayBars(v=>Math.max(10,v-1))} className="h-7 px-2 rounded-full bg-white/5 border border-white/10 text-xs">◀ 1</button>
              <button onClick={()=>setReplayBars(v=>Math.min(replayTotal,v+1))} className="h-7 px-2 rounded-full bg-white/5 border border-white/10 text-xs">1 ▶</button>
              <input type="range" min={10} max={replayTotal} value={replayBars} onChange={e=>setReplayBars(Number(e.target.value))} className="flex-1 accent-white h-1 min-w-[120px] max-w-[260px]" />
              <span className="text-[11px] font-mono text-white/60">{replayBars}/{replayTotal} bars • {replayStart}</span>
              <div className="flex gap-1">{([0.5,1,2,5,10] as const).map(s=><button key={s} onClick={()=>setReplaySpeed(s)} className={`px-2 py-1 rounded-full text-[10px] font-bold border ${replaySpeed===s?'bg-white text-black':'bg-white/5 border-white/10 text-white/40'}`}>{s}x</button>)}</div>
              <button onClick={()=>setReplayBars(10)} className="h-7 px-2 rounded-full bg-white/5 border border-white/10 text-xs">⟲ Start</button>
              <button onClick={()=>setReplayBars(replayTotal)} className="h-7 px-2 rounded-full bg-white/5 border border-white/10 text-xs">End ⟲</button>
              <button onClick={()=>setBarReplay(false)} className="h-7 px-2 rounded-full bg-red-500 text-white text-xs font-bold">Exit Replay ✕</button>
            </div>
          )}
          <div className={`${fit ? 'flex-1 min-h-0 p-1' : 'p-2'}`} style={fit ? {height:'100%'} : {height: fit ? '100%' : 'min(78vh, 760px)'}}>
            {barReplay ? <TradingViewReplayChart symbol={tv} interval={interval} startDate={replayStart} visibleBars={replayBars} totalBars={replayTotal} /> : <TradingViewChart key={`${tv}-${interval}-${studies.join(',')}-${showTools}`} symbol={tv} interval={interval} studies={studies} showTools={showTools} />}
          </div>
          <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 shrink-0">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 live-dot" />LIVE TradingView</span>
            <span>·</span>
            <span>Allow symbol change inside chart</span>
            <span className="ml-auto num font-bold">{pair} → {tv}</span>
            {fit && <button onClick={()=>setFit(false)} className="ml-2 text-xs font-bold text-indigo-600 hover:underline">Exit fit ✕</button>}
          </div>
        </Card>
      ) : (
        <Card pad={false} className={`overflow-hidden flex flex-col ${fit ? 'flex-1 min-h-0' : ''}`}>
          <div className={`${fit ? 'flex-1 min-h-0 p-1' : 'p-2'}`} style={fit ? {height:'100%'} : {height: 'min(78vh, 760px)'}}>
            <TradingViewLibraryChart key={`${tv}-${marks.length}-${levels.length}`} symbol={tv} marks={marks} levels={levels} />
          </div>
          <p className="px-3 py-2 text-[11px] text-slate-400 shrink-0">Full engine — drawings, indicators & templates. Demo feed; some symbols need pro data. {showJournalOverlay && filteredTrades.length > 0 && `· Showing ${filteredTrades.length} journal trades as TradingView would (entry pins + SL/TP).`} {fit && <button onClick={()=>setFit(false)} className="ml-2 font-bold text-indigo-600 hover:underline">Exit fit ✕</button>}</p>
        </Card>
      )}

      {showJournalOverlay && filteredTrades.length > 0 && !fit && (
        <Card>
          <h3 className="font-extrabold text-sm">How TradingView sees {pair} in your journal — {filteredTrades.length} trade{filteredTrades.length>1?'s':''}</h3>
          <div className="grid gap-2 mt-2">
            {filteredTrades.slice(-6).reverse().map(t => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                <span className={`px-2 py-0.5 rounded-full text-white font-extrabold text-[11px] ${t.direction==='Buy'?'bg-emerald-600':'bg-red-600'}`}>{t.direction}</span>
                <span className="font-mono font-bold num">{t.entry} → {t.exit ?? '—'}</span>
                <span className="text-slate-500">{new Date(t.date).toLocaleDateString()} · {t.strategy}</span>
                <span className="ml-auto font-mono num">{t.source ? `via ${t.source}` : ''}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Toggle <b>Journal overlay</b> above to hide/show these on the Library chart — pins at entry/exit + colored SL/TP/entry lines, exactly as TradingView draws positions.</p>
        </Card>
      )}

      {!fit && <Card className="!py-3 text-center text-[11px] text-slate-400">
        TradingView widget needs internet · Free tier · Not a broker · Your trades still journal here. Connect TradingView via Brokers → TradingView to push alerts.
      </Card>}
    </div>
  );
}
