import { useEffect, useRef } from 'react';

// Official MetaQuotes/Tradays Economic Calendar widget — the same real-time
// data that powers MetaTrader. Script-injected, no API key required.
function EconomicCalendarWidget() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://www.tradays.com/c/js/widgets/calendar/widget.js?v=15';
    script.type = 'text/javascript';
    script.async = true;
    script.dataset.type = 'calendar-widget';
    script.innerHTML = `{"width":"100%","height":"100%","mode":"2","fw":"react"}`;
    container.current?.appendChild(script);

    return () => { script.remove(); };
  }, []);

  return (
    <div ref={container} className="h-full w-full">
      <div id="economicCalendarWidget" className="h-full w-full" />
      <div className="ecw-copyright text-center text-[11px] text-slate-400 pb-2">
        <a href="https://www.metatrader.com/?utm_source=calendar.widget&utm_medium=link&utm_term=economic.calendar&utm_content=visit.mql5.calendar&utm_campaign=202.calendar.widget" rel="noopener nofollow" target="_blank">MetaTrader World Markets</a>
      </div>
    </div>
  );
}

export default EconomicCalendarWidget;