import { useEffect, useState } from 'react';
import { Glyph } from '../components/ui';

function MiniEquity() {
  const pts = [0, 4, 3, 7, 6, 10, 9, 13, 12, 16, 15, 21];
  const w = 520, h = 130;
  const X = (i: number) => 8 + (i / (pts.length - 1)) * (w - 16);
  const Y = (v: number) => h - 10 - (v / 22) * (h - 20);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(0)},${Y(p).toFixed(0)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 120 }} aria-hidden>
      <defs>
        <linearGradient id="land-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.22} />
          <stop offset="100%" stopColor="#059669" stopOpacity={0.03} />
        </linearGradient>
        <linearGradient id="land-l" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4f46e5" /><stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(f => <line key={f} x1={8} x2={w - 8} y1={h * f} y2={h * f} stroke="#94a3b8" strokeOpacity={0.3} />)}
      <path d={`${line} L${w - 8},${h} L8,${h} Z`} fill="url(#land-a)" />
      <path d={line} fill="none" stroke="url(#land-l)" strokeWidth={3} strokeLinecap="round" />
      <circle cx={X(pts.length - 1)} cy={Y(pts[pts.length - 1])} r={5} fill="#059669" stroke="#fff" strokeWidth={2.5} />
    </svg>
  );
}

function MiniHeat() {
  const vals = [2.1, 1.2, -1.4, 3.2, 0.8, -0.5, 1.8, 0, 2.6, -2.2, 1.1, 0.4, 3.8, -0.8];
  return (
    <div className="grid grid-cols-7 gap-1">
      {vals.map((v, i) => (
        <div key={i} className="h-9 rounded-md flex items-center justify-center text-[10px] font-extrabold num"
          style={{ background: v > 0 ? `rgba(5,150,105,${0.12 + 0.3 * Math.min(1, v / 4)})` : v < 0 ? `rgba(220,38,38,${0.12 + 0.3 * Math.min(1, -v / 4)})` : 'rgba(148,163,184,.15)', color: v > 0 ? '#047857' : v < 0 ? '#b91c1c' : '#94a3b8' }}>
          {v === 0 ? '·' : `${v > 0 ? '+' : ''}${v}R`}
        </div>
      ))}
    </div>
  );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-[300px] sm:w-[340px] lg:w-full lg:max-w-none">
      {/* outer phone chrome — hidden on desktop lg, shown mobile/tablet for that native feel */}
      <div className="absolute -inset-3 rounded-[2.2rem] bg-slate-900/90 shadow-2xl hidden max-lg:block" aria-hidden />
      <div className="absolute inset-0 rounded-[2rem] border-[10px] border-slate-900 shadow-2xl hidden max-lg:block pointer-events-none" aria-hidden />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-slate-900 rounded-b-2xl hidden max-lg:block" aria-hidden />
      <div className={`relative ${'max-lg:rounded-[1.7rem] max-lg:overflow-hidden max-lg:border max-lg:border-white/10'} lg:contents`}>
        {children}
      </div>
    </div>
  );
}

const FEATURES: { icon: string; tint: string; title: string; body: string }[] = [
  { icon: 'book', tint: 'bg-indigo-100 text-indigo-600', title: 'Institutional ledger', body: 'Entry → exit with SL/TP, R-multiple, commissions, before/after shots, emotions, mistakes and plan scoring on every ticket.' },
  { icon: 'chart', tint: 'bg-emerald-100 text-emerald-600', title: 'Analytics that accuse', body: 'Equity trajectory, drawdown drift, R-distribution, Monte Carlo p10/median/p90, hourly edge map, year-in-review and P/L by everything.' },
  { icon: 'bell', tint: 'bg-amber-100 text-amber-600', title: 'Real Meta calendar + News', body: 'Live Tradays/MetaQuotes + ForexLive news feed, countdowns, 15-min phone alerts, and Market News with sentiment & impact.' },
  { icon: 'bank', tint: 'bg-sky-100 text-sky-600', title: 'Prop-firm command', body: 'Named challenges, drawdown guards, payout logs and downloadable funded certificates.' },
  { icon: 'clipboard', tint: 'bg-violet-100 text-violet-600', title: 'Plan enforcer + Kelly', body: 'Your rules checked live, plus Kelly f*, expectancy, risk-of-ruin lab and ½ Kelly sizing for funded accounts.' },
  { icon: 'clock', tint: 'bg-fuchsia-100 text-fuchsia-600', title: 'Sessions + TradingView + streaks', body: 'Live session map, TradingView Advanced + Library (fit page, indicators, tools), Daily streak 🔥, goals and cloud sync.' },
  { icon: 'trend', tint: 'bg-sky-100 text-sky-600', title: 'TradingView fitted', body: 'Full TradingView Advanced + Library engine, interval 1m–1W, RSI/MACD/BB/MA, fit-page fullscreen and watchlist sync.' },
  { icon: 'shield', tint: 'bg-indigo-100 text-indigo-600', title: 'Owner pulse', body: 'For daadirey100@gmail.com — total users, active 7d, registered emails, brokers they love, pairs, strategies, growth 30d and CSV exports.' },
  { icon: 'news', tint: 'bg-amber-100 text-amber-600', title: 'iOS + Android + PWA', body: 'Native iOS (ios/App) + Android APK + PWA Add to Home Screen — one codebase, every phone.' },
];

const FAQS: [string, string][] = [
  ['Is it really free?', 'Yes — every tool, every chart, unlimited trades. No account tiers, no paywalls, no card required.'],
  ['Where is my data stored?', 'In your browser by default (private by design). Sign in free to sync encrypted between your PC, laptop and phone via Supabase cloud.'],
  ['Do I need to install anything?', 'No. It runs in any modern browser, installs as a phone app (PWA), and ships as a native Android APK too.'],
  ['Can I import my broker history?', 'Yes — the journal imports any broker CSV (pair, side, lots, entry, SL, TP, exit auto-detected) and backtests import the same way.'],
  ['Does it work offline?', 'The journal core works offline. Live prices, calendar feeds and cloud sync need internet.'],
  ['How do I install on iPhone?', 'Open in Safari → Share → Add to Home Screen. Or build the native IPA: npm run ios → open in Xcode → TestFlight.'],
  ['How do I install on Android?', 'Tap Install or download the APK — one tap, no Play review wait. PWA also works via Chrome → Add to Home Screen.'],
];

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export default function Landing({ onLaunch }: { onLaunch: () => void }) {
  const [menu, setMenu] = useState(false);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  // oxlint-disable-next-line react(set-state-in-effect)
  useEffect(() => {
    const m = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true || document.referrer.includes('android-app://');
    setIsStandalone(!!m);
    const h = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); };
    window.addEventListener('beforeinstallprompt', h as EventListener);
    return () => window.removeEventListener('beforeinstallprompt', h as EventListener);
  }, []);

  const go = (id: string) => {
    setMenu(false);
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 64;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  const doInstall = async () => {
    if (!deferred) {
      const a = document.createElement('a');
      a.href = '/dadafx-app.apk';
      a.download = 'dadafx-app.apk';
      a.click();
      return;
    }
    await deferred.prompt();
    try { await deferred.userChoice; } catch { /* ignore */ }
    setDeferred(null);
  };

  return (
    <div className="min-h-screen app-bg text-slate-900 antialiased overflow-x-clip">
      {/* nav — 44px min tap, safe-area for notch */}
      <header className="sticky top-0 z-40 bg-white/70 backdrop-blur-xl border-b border-white/60 supports-[backdrop-filter]:bg-white/60" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-[56px] sm:h-16 flex items-center gap-2">
          <img src="/logo.jpeg" alt="DadaFX" className="w-9 h-9 rounded-xl object-cover shadow shrink-0" />
          <span className="font-display font-extrabold tracking-tight whitespace-nowrap text-[15px] sm:text-base">DadaFX<span className="text-slate-400 font-semibold hidden min-[400px]:inline"> Journal</span></span>
          <span className="hidden sm:inline-flex ml-1.5 text-[10px] font-extrabold tracking-widest bg-slate-900 text-white px-1.5 py-0.5 rounded">MOBILE</span>
          <nav className="hidden md:flex items-center gap-5 ml-6 text-sm font-semibold text-slate-500">
            {[['features', 'Features'], ['how', 'How it works'], ['reviews', 'Reviews'], ['pricing', 'Pricing'], ['faq', 'FAQ']].map(([id, l]) => (
              <button key={id} onClick={() => go(id)} className="hover:text-slate-900 transition min-h-[44px] px-1">{l}</button>
            ))}
          </nav>
          <div className="flex-1" />
          {/* desktop app CTAs */}
          <button onClick={doInstall} className="hidden lg:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-black transition">
            <Glyph name="download" className="w-3.5 h-3.5" />{deferred ? 'Install app' : isStandalone ? 'App ✓' : 'Get APK'}
          </button>
          <button onClick={onLaunch} className="btn-brand h-10 sm:h-10 px-3.5 sm:px-5 rounded-xl text-[13px] sm:text-sm font-extrabold whitespace-nowrap text-white min-h-[44px]">Sign in — free</button>
          <button onClick={() => setMenu(!menu)} className="md:hidden w-11 h-11 rounded-xl border border-slate-200 bg-white/70 flex flex-col items-center justify-center gap-1.5 shrink-0" aria-label="Menu">
            <span className={`block w-5 h-0.5 bg-current rounded transition ${menu ? 'translate-y-[5px] rotate-45' : ''}`} />
            <span className={`block w-5 h-0.5 bg-current rounded transition ${menu ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-0.5 bg-current rounded transition ${menu ? '-translate-y-[5px] -rotate-45' : ''}`} />
          </button>
        </div>
        {menu ? (
          <div className="md:hidden border-t border-slate-200/70 px-3 py-2 bg-white/80 backdrop-blur-xl">
            <div className="grid grid-cols-2 gap-1.5">
              {[['features', 'Features'], ['how', 'How it works'], ['reviews', 'Reviews'], ['pricing', 'Pricing'], ['faq', 'FAQ']].map(([id, l]) => (
                <button key={id} onClick={() => go(id)} className="text-left min-h-[44px] px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700">{l}</button>
              ))}
            </div>
            {!isStandalone && (
              <button onClick={doInstall} className="mt-2 w-full min-h-[44px] rounded-xl bg-slate-900 text-white text-sm font-extrabold flex items-center justify-center gap-2">
                <Glyph name="download" className="w-4 h-4" />{deferred ? 'Install DadaFX' : 'Download Android APK'}
              </button>
            )}
          </div>
        ) : null}
      </header>

      {/* hero — mobile-first: text first, phone second, full-width CTAs */}
      <section className="relative overflow-hidden">
        <span className="orb w-[480px] h-[480px] -top-40 -left-40" style={{ background: '#a5b4fc' }} />
        <span className="orb w-[420px] h-[420px] top-28 right-[-140px]" style={{ background: '#e9d5ff', animationDelay: '-5s' }} />
        <span className="orb w-[300px] h-[300px] bottom-[-80px] left-1/3" style={{ background: '#a7f3d0', animationDelay: '-9s' }} />
        <div className="relative max-w-6xl mx-auto px-4 pt-6 sm:pt-10 lg:pt-16 pb-8 sm:pb-12 grid lg:grid-cols-2 gap-6 lg:gap-10 items-start lg:items-center">
          <div className="order-1">
            <p className="inline-flex items-center gap-2 min-h-[32px] px-3.5 rounded-full glass text-[11px] sm:text-xs font-extrabold text-indigo-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 live-dot text-emerald-500 shrink-0" />BUILT BY A TRADER WHO KEPT BLOWING ACCOUNTS
            </p>
            <h1 className="font-display font-extrabold tracking-tight text-[32px] sm:text-5xl lg:text-6xl leading-[1.02] mt-3">
              I finally stopped donating to the market. <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-emerald-600 bg-clip-text text-transparent">This is how.</span>
            </h1>
            <p className="text-slate-600 text-[15px] sm:text-lg mt-3 max-w-xl leading-relaxed">
              No guru course. No signals group. Just a journal that grades every trade, prices every mistake in dollars, and slaps your wrist <b>before</b> you revenge-trade. Works offline. Syncs to every phone.
            </p>

            {/* app badges / social proof — thumb-scannable */}
            <div className="flex items-center gap-2.5 mt-4">
              <div className="flex -space-x-1.5">
                {[0, 1, 2].map(i => <img key={i} src="/logo.jpeg" alt="" className="w-7 h-7 rounded-full border-2 border-white object-cover" />)}
              </div>
              <div className="text-xs">
                <p className="font-extrabold leading-none">4.9★ by prop traders</p>
                <p className="text-slate-500 font-semibold leading-none mt-0.5">FTMO · E8 · FundedNext · PWA + APK</p>
              </div>
              <span className="hidden sm:inline-flex ml-1 text-[10px] font-extrabold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">Free forever</span>
            </div>

            {/* CTAs — full-width on mobile, 48px hit target */}
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2.5 mt-5">
              <button onClick={onLaunch} className="btn-brand min-h-[48px] px-6 rounded-xl font-extrabold text-white text-[15px] flex items-center justify-center gap-2 shadow-lg">
                Start journaling — free <span className="opacity-80">→</span>
              </button>
              <button onClick={doInstall} className="min-h-[48px] px-5 rounded-xl font-extrabold border-2 border-slate-900 bg-white text-slate-900 flex items-center justify-center gap-2 hover:bg-slate-50 transition">
                <Glyph name="download" className="w-4 h-4" />{deferred ? 'Install app' : isStandalone ? 'App installed ✓' : 'Install APK'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:flex gap-2 mt-2.5">
              <a href="https://app-murex-iota-40.vercel.app" target="_blank" rel="noreferrer" className="min-h-[44px] px-4 rounded-xl font-bold border border-slate-300 bg-white/70 backdrop-blur hover:border-indigo-300 transition inline-flex items-center justify-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-md bg-black text-white flex items-center justify-center text-[11px] font-extrabold shrink-0"></span>iOS — Add to Home Screen
              </a>
              <button onClick={() => go('features')} className="min-h-[44px] px-4 rounded-xl font-bold border border-slate-300 bg-white/70 backdrop-blur hover:border-indigo-300 transition text-sm">See the tools</button>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500 mt-2.5 bg-white/60 backdrop-blur rounded-xl px-3 py-2 border border-white/60">
              <b>iPhone:</b> Safari → Share → <b>Add to Home Screen</b>. <b>Android:</b> Chrome → Install. APK also works: <a href="/dadafx-app.apk" download className="underline font-bold text-indigo-600">dadafx-app.apk</a> · <code className="bg-slate-100 px-1 rounded">orientation: portrait</code> · standalone.
            </p>

            <div className="flex gap-4 mt-5">
              {[['23', 'pro tools'], ['∞', 'trades, free'], ['0$', 'fees, ever']].map(([a, b]) => (
                <div key={b} className="flex-1 sm:flex-none rounded-2xl bg-white/70 border border-white/60 px-3 py-2.5 text-center shadow-sm">
                  <p className="font-display font-extrabold text-xl sm:text-2xl num leading-none">{a}</p>
                  <p className="text-slate-500 text-[11px] font-extrabold uppercase tracking-wider mt-0.5">{b}</p>
                </div>
              ))}
            </div>
          </div>

          {/* phone mock — on mobile looks like actual phone, on desktop glass card */}
          <div className="order-2 relative lg:pl-2">
            <p className="font-hand text-amber-600/90 text-xl sm:text-2xl absolute -top-6 right-2 sm:right-4 rotate-[4deg] hidden lg:block z-10">← my actual dashboard, no mock numbers</p>
            <PhoneFrame>
              <div className="glass lg:rounded-2xl rounded-[1.7rem] shadow-2xl overflow-hidden bg-white/80">
                <div className="flex items-center gap-1.5 px-3 sm:px-4 h-11 border-b border-slate-200/70 bg-white/60">
                  <span className="w-3 h-3 rounded-full bg-red-400/80" /><span className="w-3 h-3 rounded-full bg-amber-400/80" /><span className="w-3 h-3 rounded-full bg-emerald-400/80" />
                  <span className="ml-2 text-[11px] font-bold text-slate-500 truncate">app.dadafx · dashboard</span>
                  <span className="ml-auto text-[10px] font-extrabold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5 shrink-0">● LIVE</span>
                </div>
                <div className="p-3 sm:p-4 grid grid-cols-3 gap-1.5 sm:gap-2">
                  {([['Balance', '$108,450', '+8.4%'], ['Win rate', '68.4%', '33W / 15L'], ['Profit factor', '2.45', '∞ potential']] as [string, string, string][]).map(([l, v, s]) => (
                    <div key={l} className="rounded-xl bg-white/80 border border-white/70 p-2 sm:p-2.5 shadow-sm">
                      <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">{l}</p>
                      <p className="font-display font-extrabold num text-sm sm:text-[15px] mt-0.5 leading-none">{v}</p>
                      <p className="text-[10px] font-bold text-emerald-600 leading-none mt-1">{s}</p>
                    </div>
                  ))}
                </div>
                <div className="px-3 sm:px-4 pb-1"><MiniEquity /></div>
                <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-1.5">
                  {([
                    ['EUR/USD', 'BUY', '+$1,530', true],
                    ['GBP/JPY', 'SELL', '−$600', false],
                    ['XAU/USD', 'BUY', '+$4,400', true],
                  ] as [string, string, string, boolean][]).map(([p, s, v, w]) => (
                    <div key={p} className="flex items-center gap-2 text-xs rounded-xl bg-white/70 border border-white/60 px-2.5 py-2 shadow-sm">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${w ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <b className="text-[13px]">{p}</b>
                      <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${s === 'BUY' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{s}</span>
                      <span className={`ml-auto num font-extrabold text-[13px] ${w ? 'text-emerald-600' : 'text-red-600'}`}>{v}</span>
                    </div>
                  ))}
                </div>
                {/* thumb bar hint inside phone */}
                <div className="hidden max-lg:flex items-center justify-around border-t border-slate-200/60 bg-white/70 px-2 py-2">
                  {['grid', 'book', 'plus', 'calendar', 'chart'].map((ic, i) => (
                    <span key={ic} className={`w-9 h-9 rounded-xl flex items-center justify-center ${i === 2 ? 'bg-slate-900 text-white -mt-3 shadow-lg' : 'text-slate-400'}`}><Glyph name={ic} className="w-4 h-4" /></span>
                  ))}
                </div>
              </div>
            </PhoneFrame>
            {/* floating badges — hide on very small to avoid overlap */}
            <div className="absolute -left-1 sm:-left-4 top-10 sm:top-16 rounded-2xl glass px-3 py-2 shadow-xl rotate-[-3deg] hidden sm:flex flex-col">
              <p className="text-[10px] font-bold text-slate-400 uppercase leading-none">Plan score</p>
              <p className="font-display font-extrabold text-emerald-600 num leading-none mt-1">100% ✓</p>
              <p className="font-hand text-emerald-600/80 text-base leading-none mt-0.5">finally listened</p>
            </div>
            <div className="absolute -right-1 sm:-right-4 bottom-10 sm:bottom-16 rounded-2xl glass px-3 py-2 shadow-xl rotate-[2deg] hidden sm:flex flex-col">
              <p className="text-[10px] font-bold text-slate-400 uppercase leading-none">Guard</p>
              <p className="font-display font-extrabold text-emerald-600 text-sm leading-none mt-1">Within limits</p>
              <p className="font-hand text-emerald-600/80 text-base leading-none mt-0.5">no 2am trades 🎉</p>
            </div>
          </div>
        </div>
      </section>

      {/* install strip — mobile nudge */}
      <section className="border-y border-slate-200/70 bg-white/60 backdrop-blur sticky top-[56px] sm:top-16 z-30 lg:static">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3 overflow-x-auto scrollbar-none">
          <span className="hidden sm:inline text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-400 whitespace-nowrap">On your phone in 10s:</span>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold whitespace-nowrap"><span className="w-6 h-6 rounded-lg bg-black text-white flex items-center justify-center text-[11px]"></span> iOS PWA</span>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold whitespace-nowrap"><span className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center"><Glyph name="download" className="w-3.5 h-3.5" /></span> Android APK</span>
          <span className="text-slate-300">·</span>
          <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-400 whitespace-nowrap">FTMO · E8 · 5%ers · XAU · NY</span>
          <button onClick={doInstall} className="ml-auto hidden sm:inline-flex min-h-[36px] px-3 rounded-xl bg-slate-900 text-white text-xs font-extrabold shrink-0">Install now</button>
        </div>
      </section>

      {/* features — 1 col mobile, touch-friendly */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-10 sm:py-16">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-indigo-600">What's inside</p>
        <h2 className="font-display font-extrabold tracking-tight text-[28px] sm:text-5xl mt-2 max-w-2xl leading-[1.05]">Every tool I wish someone handed me in year one.</h2>
        <p className="font-hand text-xl sm:text-2xl text-slate-400 mt-1.5 rotate-[-0.8deg]">yes, I actually use all 17 of these 👇</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="glass rounded-2xl p-4 sm:p-5 card-lift">
              <span className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-sm ${f.tint}`}><Glyph name={f.icon} className="w-5 h-5" /></span>
              <h3 className="font-display font-extrabold text-[17px] mt-3 leading-tight">{f.title}</h3>
              <p className="text-[13.5px] text-slate-600 mt-1 leading-relaxed">{f.body}</p>
              {i === 0 ? (
                <div className="mt-3 space-y-1">
                  {([['London Breakout', '+2.5R', true], ['NY Reversal', '−1.0R', false]] as [string, string, boolean][]).map(([s, r, w]) => (
                    <div key={s} className="flex justify-between text-xs rounded-xl bg-white/70 px-2.5 py-2"><span className="font-bold">{s}</span><span className={`num font-extrabold ${w ? 'text-emerald-600' : 'text-red-600'}`}>{r}</span></div>
                  ))}
                </div>
              ) : null}
              {i === 1 ? <div className="mt-3"><MiniHeat /></div> : null}
            </div>
          ))}
        </div>
      </section>

      {/* how */}
      <section id="how" className="border-y border-slate-200/70 bg-white/40 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-10 sm:py-16">
          <h2 className="font-display font-extrabold tracking-tight text-[26px] sm:text-4xl text-center leading-tight">How I stopped gambling<br className="sm:hidden" /> (steal the routine)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 sm:mt-8">
            {[
              ['01', 'Log in 20 seconds', 'Pair, side, lots, entry, SL, TP — P/L, R-multiple and plan score calculate themselves.'],
              ['02', 'Review the truth', 'Heatmaps, leaderboards and the mistake coach show exactly where your money leaks.'],
              ['03', 'Get funded & paid', 'Prop tracker, payout log and certificates carry you from challenge to withdrawal.'],
            ].map(([n, t, b]) => (
              <div key={n} className="glass rounded-2xl p-5 sm:p-6 text-left sm:text-center">
                <p className="font-display font-extrabold text-4xl bg-gradient-to-r from-indigo-600 to-emerald-600 bg-clip-text text-transparent num">{n}</p>
                <h3 className="font-display font-extrabold text-[17px] mt-2">{t}</h3>
                <p className="text-[13.5px] text-slate-600 mt-1 leading-relaxed">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* reviews */}
      <section id="reviews" className="max-w-6xl mx-auto px-4 py-10 sm:py-16">
        <h2 className="font-display font-extrabold tracking-tight text-[26px] sm:text-4xl text-center leading-tight">Messages that keep me building</h2>
        <p className="text-center text-slate-500 text-[13px] sm:text-sm mt-1.5">Real words from traders using the journal (names shortened, pride intact).</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 sm:mt-8">
          {[
            ['“The plan score ended my revenge trading in two weeks. My September is my best month ever.”', 'Brian K.', 'FTMO 100k funded'],
            ['“I found out Asian session was eating 40% of my profits. I just stopped trading it.”', 'Amina D.', 'E8 50k'],
            ['“Backtest lab + replay is unfair advantage. Passed Phase 1 in 19 days.”', 'Samuel O.', 'FundedNext Stellar'],
          ].map(([q, n, r]) => (
            <figure key={n} className="glass rounded-2xl p-5">
              <p className="text-amber-500 text-sm tracking-widest">★★★★★</p>
              <blockquote className="text-[13.5px] text-slate-700 mt-2 leading-relaxed">{q}</blockquote>
              <figcaption className="mt-3 text-sm font-extrabold">{n} <span className="block text-xs font-semibold text-slate-500">{r}</span></figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="border-y border-slate-200/70 bg-white/40 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-10 sm:py-16 text-center">
          <h2 className="font-display font-extrabold tracking-tight text-[28px] sm:text-4xl">One plan: free forever</h2>
          <p className="font-hand text-xl sm:text-2xl text-slate-400 mt-1">no pitch coming, I promise — just take it 🤝</p>
          <div className="glass rounded-3xl p-5 sm:p-8 mt-5 sm:mt-6 !border-indigo-200 text-left sm:text-center" style={{ boxShadow: '0 20px 60px -20px rgba(79,70,229,.35)' }}>
            <p className="font-display font-extrabold text-5xl sm:text-6xl num text-center">$0</p>
            <p className="text-slate-500 text-sm mt-1 text-center">forever · no card · no tiers</p>
            <ul className="text-[13.5px] text-left max-w-sm mx-auto mt-5 space-y-2.5 text-slate-700">
              {['Unlimited trades, screenshots & backtests', 'All 17 pro tools + all charts', 'Cloud sync across PC, laptop & phone', 'CSV import/export + full backups', 'Native Android + iOS (PWA + IPA) — get it on any phone'].map(x => (
                <li key={x} className="flex gap-2.5"><span className="text-emerald-600 font-extrabold mt-0.5">✓</span><span>{x}</span></li>
              ))}
            </ul>
            <button onClick={onLaunch} className="btn-brand min-h-[48px] w-full sm:w-auto px-8 rounded-xl font-extrabold mt-6 text-white text-[15px]">Claim your journal</button>
            <div className="flex flex-wrap justify-center gap-3 mt-4">
              <button onClick={doInstall} className="inline-flex items-center gap-2 text-[13px] font-extrabold text-indigo-600 hover:underline min-h-[44px]">
                <Glyph name="download" className="w-4 h-4" />{deferred ? 'Install PWA' : 'Android APK'} ↗
              </button>
              <span className="text-slate-300 hidden sm:inline">·</span>
              <a href="https://app-murex-iota-40.vercel.app" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-slate-700 hover:underline min-h-[44px]">
                <span className="w-5 h-5 rounded-md bg-black text-white flex items-center justify-center text-[11px] shrink-0"></span>iOS PWA ↗
              </a>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 text-center">iOS native IPA: <code className="bg-slate-100 px-1 rounded">npm run ios && npx cap open ios</code> → TestFlight.</p>
          </div>
        </div>
      </section>

      {/* faq — bigger hit area for thumbs */}
      <section id="faq" className="max-w-3xl mx-auto px-4 py-10 sm:py-16">
        <h2 className="font-display font-extrabold tracking-tight text-[28px] sm:text-4xl text-center">Questions</h2>
        <div className="space-y-2.5 mt-6">
          {FAQS.map(([q, a]) => (
            <details key={q} className="glass rounded-2xl px-4 sm:px-5 py-3.5 sm:py-4 group">
              <summary className="font-bold cursor-pointer list-none flex justify-between items-center gap-3 min-h-[28px] text-[15px]">{q}<span className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center text-lg leading-none group-open:rotate-45 transition shrink-0">+</span></summary>
              <p className="text-[13.5px] text-slate-600 mt-2 leading-relaxed pr-1">{a}</p>
            </details>
          ))}
        </div>
        <div className="text-center mt-8 sm:mt-10">
          <div className="grid grid-cols-1 sm:flex sm:flex-wrap justify-center gap-2.5">
            <button onClick={onLaunch} className="btn-brand min-h-[48px] px-8 rounded-xl font-extrabold text-white">Start free — 30 seconds</button>
            <button
              onClick={async () => {
                const url = window.location.href;
                const text = 'DadaFX Journal — the free trading journal that grades your discipline. I use it daily.';
                if (navigator.share) {
                  try { await navigator.share({ title: 'DadaFX Journal', text, url }); } catch { /* dismissed */ }
                } else {
                  try { await navigator.clipboard.writeText(`${text} ${url}`); } catch { /* ignore */ }
                }
              }}
              className="min-h-[48px] px-6 rounded-xl font-bold border-2 border-slate-200 bg-white hover:border-indigo-300 transition"
            >
              ♥ Tell a trader
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2.5">Your future funded self says thanks.</p>
        </div>
      </section>

      {/* founder note */}
      <section className="max-w-3xl mx-auto px-4 pb-28 sm:pb-6">
        <div className="glass rounded-3xl p-5 sm:p-8 relative overflow-hidden">
          <span className="font-display font-extrabold text-7xl text-indigo-200/60 absolute -top-2 left-4 select-none">”</span>
          <p className="text-slate-700 leading-relaxed text-[14px] sm:text-[15px] relative">
            Hey — I'm Dada. I blew two funded accounts in 2024 doing the same dumb things: no stop journaling, revenge trading London open, lying to myself in Excel. So I built the journal that wouldn't let me lie — plan scores, loss guards, a coach that prices my mistakes. If it saves you even one blown account, it did its job.
          </p>
          <p className="font-hand text-2xl sm:text-3xl text-amber-600 mt-3 rotate-[-1deg] inline-block">— trade well, Dada ✍️</p>
        </div>
      </section>

      <footer className="border-t border-slate-200/70 pb-24 sm:pb-0" style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}>
        <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 flex flex-col sm:flex-row items-center gap-2 sm:gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-2 font-display font-extrabold text-slate-900"><img src="/logo.jpeg" alt="DadaFX" className="w-7 h-7 rounded-lg object-cover" />DadaFX Journal</span>
          <span className="sm:ml-auto text-center">Made with ☕ in Nairobi (UTC+3) · private by design · v3.11 · PWA + APK + IPA</span>
        </div>
      </footer>

      {/* mobile sticky thumb bar — only when not installed */}
      {!isStandalone && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-white/85 backdrop-blur-xl border-t border-slate-200/70 shadow-[0_-8px_24px_-12px_rgba(15,23,42,.2)]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="px-3 py-2.5 flex gap-2">
            <button onClick={onLaunch} className="flex-1 btn-brand min-h-[48px] rounded-xl font-extrabold text-white text-[15px] flex items-center justify-center gap-1.5">
              Start free <span className="opacity-80">→</span>
            </button>
            <button onClick={doInstall} className="min-h-[48px] px-4 rounded-xl bg-slate-900 text-white font-extrabold text-sm flex items-center gap-1.5 shrink-0">
              <Glyph name="download" className="w-4 h-4" />{deferred ? 'Install' : 'APK'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
