import { memo, useEffect, useRef } from 'react';
import { tvSymbol } from '../lib/tv';

// Live price card via TradingView's official single-quote widget.
// Free, no API key, auto-updating in real time.

function LiveQuote({ pair, onRemove }: { pair: string; onRemove: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.innerHTML = '';
    const dark = document.documentElement.classList.contains('dark');
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol: tvSymbol(pair),
      width: '100%',
      colorTheme: dark ? 'dark' : 'light',
      isTransparent: false,
      locale: 'en',
    });
    host.appendChild(script);
    return () => { host.innerHTML = ''; };
  }, [pair]);

  return (
    <div className="relative group">
      <button
        onClick={onRemove}
        title={`Remove ${pair}`}
        className="absolute -top-2 -right-2 z-10 w-7 h-7 rounded-full bg-red-500 text-white text-xs font-extrabold flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition"
      >×</button>
      <div className="rounded-2xl overflow-hidden border border-white/60 dark:border-white/10 glass card-lift">
        <div ref={ref} style={{ minHeight: 154 }} className="[&_iframe]:!min-h-[154px]" />
      </div>
    </div>
  );
}

export default memo(LiveQuote);