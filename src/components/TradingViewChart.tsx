import { memo, useEffect, useRef, useState } from 'react';

// Live TradingView Advanced Chart (needs internet).
// Symbol map lives in lib/tv.ts so this file only exports components.

function TradingViewChart({ symbol, interval = 'D', studies = [], showTools = false }: { symbol: string; interval?: string; studies?: string[]; showTools?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const studiesKey = studies.join(',');
  const [err, setErr] = useState('');
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    const dark = document.documentElement.classList.contains('dark');
    script.onerror = () => setErr('TradingView widget failed — check internet/CORS and retry.');
    const t = window.setTimeout(()=>{ if(el && !el.querySelector('iframe')) setErr('TradingView slow — retry in 5s.'); }, 8000);
    script.innerHTML = JSON.stringify({
      autosize: true, symbol, interval, timezone: 'Etc/UTC', theme: dark ? 'dark' : 'light',
      style: '1', locale: 'en', allow_symbol_change: true, calendar: false, details: showTools,
      hide_side_toolbar: !showTools, hide_top_toolbar: false, hide_legend: false, hide_volume: false,
      hotlist: false, save_image: true, withdateranges: true, compareSymbols: [], studies, watchlist: [],
      support_host: 'https://www.tradingview.com',
      backgroundColor: dark ? '#0F0F0F' : '#ffffff',
      gridColor: dark ? 'rgba(242, 242, 242, 0.2)' : 'rgba(46, 46, 46, 0.06)',
    });
    el.appendChild(script);
    return () => { window.clearTimeout(t); el.innerHTML=''; setErr(''); };
  }, [symbol, interval, studiesKey, studies, showTools]);
  if(err) return <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-6 text-center"><p className="text-sm font-bold text-amber-700 dark:text-amber-300">{err}</p><div className="mt-2 flex justify-center gap-2"><button onClick={()=>setErr('')} className="h-8 px-3 rounded-full bg-white border text-xs font-bold">Retry</button><a href={`https://www.tradingview.com/symbols/${symbol.replace(':','-')}/`} target="_blank" rel="noopener" className="h-8 px-3 rounded-full bg-[#131722] text-white text-xs font-bold inline-flex items-center">Open TradingView ↗</a></div></div>;
  return <div ref={ref} className="tradingview-widget-container rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700" style={{ height: '100%', width: '100%', minHeight: 480 }} />;
}

export default memo(TradingViewChart);
