import { memo, useEffect, useRef, useState } from 'react';

declare global { interface Window { TradingView?: any } }

const LIB_URL = 'https://charting-library.tradingview-widget.com/charting_library/charting_library.standalone.js';
const FEED_URL = 'https://s3.tradingview.com/external-embedding/embed-widget-tradingview-datafeed.js';

let libLoader: Promise<void>|null=null;
function loadLib():Promise<void>{
  if(typeof window!=='undefined' && window.TradingView?.widget && (window.TradingView as any).TradingViewDatafeed) return Promise.resolve();
  if(!libLoader){
    const load=(src:string)=> new Promise<void>((res,rej)=>{
      if(document.querySelector(`script[src="${src}"]`)) return res();
      const s=document.createElement('script'); s.src=src; s.async=true; s.onload=()=>res(); s.onerror=()=>rej(new Error(src)); document.head.appendChild(s);
    });
    libLoader=load(FEED_URL).then(()=>load(LIB_URL)).then(()=>{ if(!window.TradingView?.widget) throw new Error('widget missing'); });
  }
  return libLoader;
}

function tfRes(tf:string){
  if(tf==='1'||tf==='5'||tf==='15') return tf;
  if(tf==='60') return '60';
  if(tf==='240') return '240';
  if(tf==='D') return 'D';
  return '60';
}
function tfMins(res:string){
  if(res==='1') return 1;
  if(res==='5') return 5;
  if(res==='15') return 15;
  if(res==='60') return 60;
  if(res==='240') return 240;
  if(res==='D') return 1440;
  return 60;
}

export default memo(function TradingViewReplayChart({ symbol, interval='60', startDate, visibleBars, totalBars }:{
  symbol:string; interval?:string; startDate:string; visibleBars:number; totalBars:number;
}){
  const libRef=useRef<HTMLDivElement>(null);
  const widgetRef=useRef<any>(null);
  const [libFailed, setLibFailed]=useState(false);
  const cutoffRef=useRef<number>(0);
  const cutoff = new Date(startDate + 'T00:00:00Z').getTime() + visibleBars * tfMins(interval) * 60*1000;
  cutoffRef.current=cutoff;

  // try Library true replay (hides future bars at datafeed)
  useEffect(()=>{
    if(libFailed) return;
    let alive=true; let widget:any=null;
    loadLib().then(()=>{
      if(!alive || !libRef.current) return;
      const BaseFeed = new (window.TradingView as any).TradingViewDatafeed();
      const replayFeed:any = {
        onReady: (cb:any)=> (BaseFeed as any).onReady(cb),
        searchSymbols: (...a:any[])=> (BaseFeed as any).searchSymbols(...a),
        resolveSymbol: (...a:any[])=> (BaseFeed as any).resolveSymbol(...a),
        getBars: (sym:any,res:string,params:any,onHist:any,onErr:any)=>{
          (BaseFeed as any).getBars(sym,res,params,(bars:any[],meta:any)=>{
            const cut=cutoffRef.current;
            const filtered=bars.filter((b:any)=> b.time <= cut);
            onHist(filtered, meta);
          }, onErr);
        },
        subscribeBars: (sym:any,res:string,cb:any,uid:string,reset:any)=>{
          const wrapped=(bar:any)=>{ if(bar.time <= cutoffRef.current) cb(bar); };
          return (BaseFeed as any).subscribeBars(sym,res,wrapped,uid,reset);
        },
        unsubscribeBars: (...a:any[])=> (BaseFeed as any).unsubscribeBars(...a),
      };
      widget = new window.TradingView.widget({
        symbol, interval: tfRes(interval), container: libRef.current!,
        datafeed: replayFeed,
        library_path: 'https://charting-library.tradingview-widget.com/charting_library/',
        locale:'en', theme: document.documentElement.classList.contains('dark')?'dark':'light',
        autosize:true, disabled_features:['use_localstorage_for_settings'], enabled_features:['study_templates'],
      });
      widgetRef.current=widget;
      widget.onChartReady(()=>{
        if(!alive) return;
        try{
          const chart=widget.activeChart();
          const from = new Date(startDate+'T00:00:00Z').getTime()/1000;
          const to = cutoff/1000;
          chart.setVisibleRange({from,to});
        }catch{}
      });
    }).catch(()=>{ if(alive) setLibFailed(true); });
    return ()=>{ alive=false; try{widget?.remove();}catch{}; };
  },[symbol, interval, startDate, libFailed]);

  // update range when scrubbing (true Bar Replay)
  useEffect(()=>{
    const w=widgetRef.current; if(!w || libFailed) return;
    try{
      const chart=w.activeChart();
      const from = new Date(startDate+'T00:00:00Z').getTime()/1000;
      const to = cutoff/1000;
      chart.setVisibleRange({from,to});
      chart.resetData();
    }catch{}
  },[cutoff, startDate, libFailed]);

  // fallback widget (always works) — hidden when Library succeeds
  const fallbackRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!libFailed) return;
    const el=fallbackRef.current; if(!el) return;
    el.innerHTML='<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
    const s=document.createElement('script');
    s.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    s.async=true;
    const dark=document.documentElement.classList.contains('dark');
    s.innerHTML=JSON.stringify({ autosize:true, symbol, interval, timezone:'Etc/UTC', theme: dark?'dark':'light', style:'1', locale:'en', allow_symbol_change:false, calendar:false, details:false, hide_side_toolbar:true, hide_top_toolbar:false, hide_legend:false, hide_volume:false, save_image:true, withdateranges:true, range:'12M', support_host:'https://www.tradingview.com', backgroundColor: dark?'#0A0E1A':'#ffffff', gridColor: dark?'rgba(255,255,255,0.06)':'rgba(46,46,46,0.06)' });
    el.appendChild(s);
    return ()=>{ el.innerHTML=''; };
  },[symbol, interval, libFailed]);

  const hiddenPct = Math.max(0, 100 - (visibleBars/totalBars)*100);
  return (
    <div className="relative" style={{height:420}}>
      {/* Library true replay */}
      <div ref={libRef} style={{height:'100%', width:'100%', display: libFailed?'none':'block'}} className="rounded-xl overflow-hidden border border-white/10 bg-[#0A0E1A]" />
      {/* fallback widget */}
      {libFailed && <div ref={fallbackRef} style={{height:'100%', width:'100%'}} className="rounded-xl overflow-hidden border border-white/10" />}
      {/* cut overlay for fallback — no datafeed filter in fallback, so we dim future */}
      {libFailed && hiddenPct>1 && (
        <div className="pointer-events-none absolute top-0 bottom-0 right-0 border-l-2 border-[#00E676]/60 bg-[#080B12]/35 backdrop-blur-[0.5px] flex items-start justify-center pt-10" style={{width:`${hiddenPct}%`}}>
          <span className="text-[9px] font-black tracking-[0.16em] text-white/50 bg-black/40 border border-white/10 rounded-full px-2 py-1">FUTURE CUT • {totalBars-visibleBars} bars</span>
        </div>
      )}
      {libFailed && <div className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-[#00E676] shadow-[0_0_8px_#00E676]" style={{left:`${(visibleBars/totalBars)*100}%`}} />}
      {/* badges */}
      <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2">
        <span className="bg-white text-black text-[10px] font-black tracking-widest px-2 py-1 rounded-full border border-black/10">● BAR REPLAY {libFailed?'• FALLBACK':''}</span>
        <span className="bg-[#00E676] text-black text-[10px] font-black tracking-widest px-2 py-1 rounded-full">{visibleBars}/{totalBars} • {new Date(cutoff).toISOString().slice(0,10)}</span>
      </div>
    </div>
  );
});
