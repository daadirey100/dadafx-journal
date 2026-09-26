import { memo, useEffect, useRef, useState } from 'react';

// Full TradingView Charting Library (advanced charts engine + demo datafeed).
// Needs internet. Falls back to an error note if the library can't load.
declare global {
  interface Window {
    TradingView?: any;
  }
}

const LIB_URL = 'https://charting-library.tradingview-widget.com/charting_library/charting_library.standalone.js';
const FEED_URL = 'https://s3.tradingview.com/external-embedding/embed-widget-tradingview-datafeed.js';

let loader: Promise<void> | null = null;
function loadLibrary(): Promise<void> {
  if (typeof window !== 'undefined' && window.TradingView?.widget && window.TradingView?.TradingViewDatafeed) {
    return Promise.resolve();
  }
  if (!loader) {
    const load = (src: string) =>
      new Promise<void>((res, rej) => {
        if (document.querySelector(`script[src="${src}"]`)) return res();
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => res();
        s.onerror = () => rej(new Error(`failed: ${src}`));
        document.head.appendChild(s);
      });
    loader = load(FEED_URL).then(() => load(LIB_URL)).then(() => {
      if (!window.TradingView?.widget) throw new Error('library missing');
    }).catch(e => { loader = null; throw e; });
  }
  return loader;
}

export interface TvMark { time: number; price: number; dir: 'buy' | 'sell'; label: string }
export interface TvLevel { price: number; label: string; color: string }

function TradingViewLibraryChart({ symbol, marks = [], levels = [] }: { symbol: string; marks?: TvMark[]; levels?: TvLevel[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  useEffect(() => {
    let widget: any = null;
    let alive = true;
    const reset = window.setTimeout(() => { if (alive) setErr(''); }, 0);
    loadLibrary()
      .then(() => {
        if (!alive || !ref.current) return;
        widget = new window.TradingView.widget({
          symbol,
          interval: '60',
          container: ref.current,
          datafeed: new window.TradingView.TradingViewDatafeed(),
          library_path: 'https://charting-library.tradingview-widget.com/charting_library/',
          locale: 'en',
          theme: dark ? 'dark' : 'light',
          autosize: true,
          disabled_features: ['use_localstorage_for_settings'],
          enabled_features: ['study_templates', 'show_symbol_logos'],
        });
        widget.onChartReady(() => {
          if (!alive) return;
          try {
            const chart = widget.activeChart();
            for (const m of marks) {
              chart
                .createExecutionShape()
                .setTime(m.time)
                .setPrice(m.price)
                .setDirection(m.dir)
                .setText(`@${m.price}`)
                .setTooltip(`${m.label} @ ${m.price}`)
                .setTextColor('#ffffff')
                .setArrowColor(m.dir === 'buy' ? '#089981' : '#F23645')
                .setFont('bold 11px Inter, sans-serif');
            }
            for (const l of levels) {
              chart
                .createOrderLine()
                .setText(l.label)
                .setLineColor(l.color)
                .setBodyTextColor('#ffffff')
                .setBodyBackgroundColor(l.color)
                .setPrice(l.price);
            }
          } catch { /* shapes unsupported — chart still usable */ }
        });
      })
      .catch(() => alive && setErr('Chart engine failed to load — check internet/CORS and retry.'));
    return () => {
      alive = false;
      window.clearTimeout(reset);
      try { widget?.remove(); } catch { /* ignore */ }
    };
  }, [symbol, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-6 text-center">
        <p className="text-sm font-bold text-amber-700 dark:text-amber-300">{err}</p>
        <div className="mt-3 flex justify-center gap-2"><button className="h-8 px-4 rounded-full bg-white border text-xs font-bold" onClick={() => { setErr(''); setTick(t=>t+1); }}>Retry</button><a href="https://www.tradingview.com" target="_blank" rel="noopener" className="h-8 px-4 rounded-full bg-[#131722] text-white text-xs font-bold inline-flex items-center">TradingView ↗</a></div>
      </div>
    );
  }
  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F0F0F] flex flex-col" style={{ height: '100%' }}>
      <div ref={ref} style={{ flex: 1, minHeight: 480, width: '100%' }} />
      <p className="px-3 py-2 text-[11px] text-slate-400 shrink-0">Full TradingView engine · indicators, drawings & templates included · demo feed, not all symbols supported.</p>
    </div>
  );
}

export default memo(TradingViewLibraryChart);
