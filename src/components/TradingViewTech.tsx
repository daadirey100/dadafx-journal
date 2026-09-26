import { memo, useEffect, useRef } from 'react';

function TradingViewTech({ symbol, interval = '1M' }: { symbol: string; interval?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '<div class="tradingview-widget-container__widget"></div>';
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js';
    s.async = true;
    s.innerHTML = JSON.stringify({
      colorTheme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      displayMode: 'multiple',
      isTransparent: false,
      locale: 'en',
      interval,
      disableInterval: false,
      width: '100%',
      height: 400,
      symbol,
      showIntervalTabs: true,
    });
    el.appendChild(s);
    return () => { el.innerHTML = ''; };
  }, [symbol, interval]);
  return <div ref={ref} className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700" />;
}
export default memo(TradingViewTech);
