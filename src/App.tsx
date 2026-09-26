import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from './lib/store';
import { APP_TZ_LABEL, fmtAppClock } from './lib/time';
import { btnGhost, Card, Glyph, Modal } from './components/ui';
import AuthGate from './components/AuthGate';
import Tour from './components/Tour';
import { setToastPusher, useLocal, type Toast } from './lib/store';
import { supabase } from './lib/supabase';
import { applyingRemote, friendlySyncError, noteSync, pullMerge, pushAll, pushKey, subscribeRemote } from './lib/cloud';
import { fmtCountdown, sessionStatus, SESSION_DEFS } from './lib/sessions';

function useSyncStat() {
  const [s, setS] = useState<any>(null);
  useEffect(() => {
    const read = () => {
      try { setS(JSON.parse(localStorage.getItem('dadafx.syncstat') ?? 'null')); }
      catch { /* ignore */ }
    };
    read();
    const iv = setInterval(read, 3000);
    window.addEventListener('dadafx:syncstat', read);
    return () => { clearInterval(iv); window.removeEventListener('dadafx:syncstat', read); };
  }, []);
  return s;
}
import { type Account, type BacktestTrade, type Coupon, type DailyEntry, type EconEvent, type NoteItem, type Trade } from './lib/types';
import Analytics from './pages/Analytics';
import BacktestedTrades from './pages/BacktestedTrades';
import Coupons from './pages/Coupons';
import DailyJournal from './pages/DailyJournal';
import Dashboard from './pages/Dashboard';
import Data from './pages/Data';
import EconomicCalendar from './pages/EconomicCalendar';
import Leaderboard from './pages/Leaderboard';
import Mistakes from './pages/Mistakes';
import Notebook from './pages/Notebook';
import Portfolio from './pages/Portfolio';
import PositionCalculator from './pages/PositionCalculator';
import Sessions from './pages/Sessions';
import Goals from './pages/Goals';
import Plan from './pages/Plan';
import PropFirm from './pages/PropFirm';
import Weekly from './pages/Weekly';
import Gallery from './pages/Gallery';
import Targets from './pages/Targets';
import Watchlist from './pages/Watchlist';
import Landing from './pages/Landing';
import Brokers from './pages/Brokers';
import Charts from './pages/Charts';
import MarketNews from './pages/MarketNews';
import Owner from './pages/Owner';
import StatisticsCenter from './pages/StatisticsCenter';
import TradingJournal from './pages/TradingJournal';
import TradeReplay from './pages/TradeReplay';

const GROUPS: { title: string; items: { id: string; label: string; icon: string }[] }[] = [
  { title: 'Overview', items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { id: 'daily', label: 'Daily Journal', icon: 'calendar' },
    { id: 'journal', label: 'Trading Journal', icon: 'book' },
    { id: 'portfolio', label: 'My Portfolio', icon: 'briefcase' },
    { id: 'plan', label: 'Trading Plan', icon: 'clipboard' },
    { id: 'watch', label: 'Watchlist', icon: 'trend' },
    { id: 'targets', label: 'P&L Targets', icon: 'target' },
  ]},
  { title: 'Research & Tools', items: [
    { id: 'notebook', label: 'Notebook', icon: 'pencil' },
    { id: 'brokers', label: 'Brokers', icon: 'link' },
    { id: 'gallery', label: 'Gallery', icon: 'image' },
    { id: 'analytics', label: 'Analytics', icon: 'chart' },
    { id: 'calendar', label: 'Economic Calendar', icon: 'bell' },
    { id: 'news', label: 'Market News', icon: 'news' },
    { id: 'charts', label: 'TradingView', icon: 'chart' },
    { id: 'replay', label: 'Trade Replay', icon: 'bolt' },
    { id: 'sessions', label: 'Trading Sessions', icon: 'clock' },
    { id: 'calc', label: 'Position Calculator', icon: 'calc' },
  ]},
  { title: 'Evaluation', items: [
    { id: 'goals', label: 'Goals', icon: 'star' },
    { id: 'leaders', label: 'Leaderboard', icon: 'shield' },
    { id: 'mistakes', label: 'Mistake Tracker', icon: 'bolt' },
    { id: 'prop', label: 'Prop-Firm Tracker', icon: 'bank' },
    { id: 'weekly', label: 'Weekly Report', icon: 'news' },
    { id: 'backtest', label: 'Backtested Trades', icon: 'flask' },
    { id: 'stats', label: 'Statistics Center', icon: 'bars' },
    { id: 'coupons', label: 'Coupons', icon: 'ticket' },
    { id: 'data', label: 'Backup & Restore', icon: 'download' },
  ]},
  { title: 'Owner', items: [
    { id: 'owner', label: 'Owner Dashboard', icon: 'shield' },
  ]},
];

function CloudStat() {
  const s = useSyncStat();
  if (!s) return <p className="text-[10px] text-slate-400 mt-1">Cloud: waiting for first sync…</p>;
  const t = new Date(s.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return s.ok
    ? <p className="text-[10px] font-bold text-emerald-600 mt-1">✓ Synced {t}</p>
    : <p className="text-[10px] font-bold text-red-600 mt-1" title={s.msg}>⚠ Sync failing since {t} — {s.msg || 'tap Backup to stay safe'}</p>;
}

const seedTrades: Trade[] = [
  { id: 'seed1', date: new Date(Date.now() - 864e5 * 2).toISOString().slice(0, 16), pair: 'EUR/USD', direction: 'Buy', lot: 0.5, entry: 1.0842, stopLoss: 1.0822, takeProfit: 1.0882, exit: 1.0875, riskPct: 1, strategy: 'London Breakout', session: 'London', timeframe: 'H1', setup: 'Break + retest', emotions: 'Calm', mistakes: '', notes: 'Clean breakout, trailed to TP.', rating: 5 },
  { id: 'seed2', date: new Date(Date.now() - 864e5).toISOString().slice(0, 16), pair: 'GBP/USD', direction: 'Sell', lot: 0.3, entry: 1.272, stopLoss: 1.275, takeProfit: 1.266, exit: 1.2745, riskPct: 1, strategy: 'NY Reversal', session: 'New York', timeframe: 'M15', setup: 'Double top', emotions: 'FOMO', mistakes: 'Early entry', notes: 'Entered before confirmation — lesson learned.', rating: 2 },
];

function sessionNow(): { label: string; active: boolean } {
  const h = new Date().getUTCHours();
  if (h >= 12 && h < 16) return { label: 'London / NY Active', active: true };
  if (h >= 7 && h < 12) return { label: 'London Active', active: true };
  if (h >= 12 && h < 21) return { label: 'New York Active', active: true };
  if (h >= 0 && h < 7) return { label: 'Asian Active', active: true };
  return { label: 'Market Quiet', active: false };
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return `${fmtAppClock(now)} ${APP_TZ_LABEL}`;
}

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [dark, setDark] = useLocal('dadafx.dark', false);
  const [trades, setTrades] = useLocal<Trade[]>('dadafx.trades', seedTrades);
  const [entries, setEntries] = useLocal<DailyEntry[]>('dadafx.daily', []);
  const [notes, setNotes] = useLocal<NoteItem[]>('dadafx.notes', [{ id: 'n1', title: 'My playbook — London breakout', body: 'Rules:\n1. Only trade 7–10am London\n2. Wait for H1 break + M15 retest\n3. Max risk 1%\n4. No trades into red news', folder: 'Playbooks', tags: ['london', 'breakout'], updatedAt: new Date().toISOString() }]);
  const [backtests, setBacktests] = useLocal<BacktestTrade[]>('dadafx.backtests', []);
  const [accounts, setAccounts] = useLocal<Account[]>('dadafx.accounts', []);
  const [coupons, setCoupons] = useLocal<Coupon[]>('dadafx.coupons', []);
  const [events, setEvents] = useLocal<EconEvent[]>('dadafx.events', []);
  const [startBalance, setStartBalance] = useLocal('dadafx.balance', 10000);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tradeSignal, setTradeSignal] = useState(0);
  const [gq, setGq] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [gate, setGate] = useState<'landing' | 'auth'>('landing');
  const [auth, setAuth] = useState<any>(null);
  const [remoteBump, setRemoteBump] = useState(0);
  const firstSync = useRef(true);
  const [replayId, setReplayId] = useState<string|null>(null);
  const openReplay = (id:string)=>{ setReplayId(id); setPage('replay'); setMenuOpen(false); };
  const [tour, setTour] = useState(() => {
    try { return !JSON.parse(localStorage.getItem('dadafx.tourDone') ?? 'null'); }
    catch { return true; }
  });
  const closeTour = () => {
    try { localStorage.setItem('dadafx.tourDone', 'true'); } catch { /* ignore */ }
    setTour(false);
  };
  const clock = useClock();
  const session = sessionNow();
  const liveSess = useMemo(() => {
    void clock; // tick each second so session open/close flips live
    const now = new Date();
    for (const id of ['london', 'newyork', 'tokyo', 'sydney']) {
      const def = SESSION_DEFS.find(d => d.id === id)!;
      const st = sessionStatus(def, now);
      if (st.open) return { def, st };
    }
    return null;
  }, [clock]);

  const highToday = useMemo(() => {
    const t = new Date().toISOString().slice(0, 10);
    return events.filter(e => e.date === t && e.impact === 'High').length;
  }, [events]);

  useEffect(() => {
    setToastPusher(t => {
      const id = Math.random().toString(36).slice(2);
      setToasts(prev => [...prev, { ...t, id }]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 2800);
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuth(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuth(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Cloud sync engine: first merge, then live push/pull.
  useEffect(() => {
    if (!auth) return;
    let stop = false;
    let t: ReturnType<typeof setTimeout> | null = null;
    const dirty = new Set<string>();
    const flush = async () => {
      if (applyingRemote || dirty.size === 0) return;
      const keys = [...dirty];
      dirty.clear();
      for (const k of keys) {
        try { await pushKey(k); }
        catch (e) { dirty.add(k); noteSync(false, friendlySyncError(e)); }
      }
    };
    const schedule = () => { if (t) clearTimeout(t); t = setTimeout(flush, 2500); };
    (async () => {
      try {
        const { pulled, pushed } = await pullMerge();
        if (stop) return;
        if (firstSync.current) {
          firstSync.current = false;
          // Reload ONCE to paint fresh cloud data — never loop (storage can be tight).
          if (pulled > 0 && !sessionStorage.getItem('dadafx.rl1')) {
            sessionStorage.setItem('dadafx.rl1', '1');
            location.reload();
            return;
          }
          if (pulled > 0) setRemoteBump(b => b + 1);
          toast.ok(pushed > 0 ? `Uploaded ${pushed} sections to cloud.` : 'Cloud sync on — PC + laptop linked.');
        } else if (pulled || pushed) {
          toast.info(`Cloud sync: ${pulled} in, ${pushed} out.`);
        }
      } catch (e: any) {
        noteSync(false, friendlySyncError(e));
        if (!stop) toast.err('Cloud unreachable — working offline for now.');
      }
    })();
    const unsub = subscribeRemote(() => setRemoteBump(b => b + 1));
    const onDirty = (e: Event) => { dirty.add((e as CustomEvent<string>).detail); schedule(); };
    const iv = setInterval(flush, 15000);
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    // Browser was offline at 01:37-style outages: retry as soon as we're back.
    const onOnline = () => { void flush(); };
    window.addEventListener('dadafx:dirty', onDirty);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('online', onOnline);
    return () => {
      stop = true;
      unsub();
      if (t) clearTimeout(t);
      clearInterval(iv);
      window.removeEventListener('dadafx:dirty', onDirty);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('online', onOnline);
    };
  }, [auth]);

  const go = (p: string) => { setPage(p); setMenuOpen(false); };
  const quickAdd = () => { go('journal'); setTradeSignal(s => s + 1); };



  const searchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    go('journal');
  };

  const searchRef = useRef<HTMLInputElement>(null);
  const firedAlerts = useRef<Set<string>>(new Set());

  // Phone/desktop reminders for 🔔 economic events (fires while the app is open)
  useEffect(() => {
    if (!('Notification' in window)) return;
    const t = setInterval(() => {
      if (Notification.permission !== 'granted') return;
      const now = Date.now();
      for (const e of events) {
        if (!e.notify || firedAlerts.current.has(e.id)) continue;
        const tt = new Date(`${e.date}T${e.time}:00`).getTime();
        if (isNaN(tt)) continue;
        if (tt - now <= 15 * 60000 && tt - now > -60000) {
          firedAlerts.current.add(e.id);
          try {
            new Notification(`${e.flag} ${e.currency} — ${e.title}`, {
              body: `Releases ~${e.time} · Forecast ${e.forecast || '—'} · via DadaFX`,
              tag: e.id,
            });
          } catch { /* ignore */ }
        }
      }
    }, 30000);
    return () => clearInterval(t);
  }, [events]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (page !== 'journal') go('journal');
        setTimeout(() => searchRef.current?.focus(), 50);
      } else if (!typing && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        quickAdd();
      } else if (!typing && e.key === '?') {
        e.preventDefault();
        setShowHelp(true);
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const backupAll = () => {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith('dadafx.')) data[k] = localStorage.getItem(k)!;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dadafx-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    toast.ok('Backup downloaded.');
  };

  const restoreAll = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      Object.entries(data).forEach(([k, v]) => {
        if (k.startsWith('dadafx.') && typeof v === 'string') localStorage.setItem(k, v);
      });
      toast.ok('Backup restored — reloading…');
      setTimeout(() => location.reload(), 800);
    } catch {
      toast.err('Invalid backup file.');
    }
  };

  // Logged-out entry LAST — after every hook, so hook order never changes between renders.
  // Sign-in is required: every account gets its own private cloud journal.
  if (!auth) {
    if (gate === 'landing') return <Landing onLaunch={() => setGate('auth')} />;
    return (
      <div className="relative min-h-screen">
        <button onClick={() => setGate('landing')} className="absolute top-4 left-4 z-10 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white">← Back to site</button>
        <AuthGate />
      </div>
    );
  }

  return (
    <div className="min-h-screen app-bg text-slate-900 dark:text-slate-100">
      {/* Mobile bar */}
      <header className="lg:hidden sticky top-0 z-30 bg-white/60 dark:bg-slate-950/50 backdrop-blur-xl border-b border-white/50 dark:border-white/10 px-4 h-14 flex items-center justify-between">
        <button onClick={() => setMenuOpen(!menuOpen)} className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 font-bold flex items-center justify-center" aria-label="Menu"><span className="space-y-1"><span className="block w-4 h-0.5 bg-current" /><span className="block w-4 h-0.5 bg-current" /><span className="block w-2.5 h-0.5 bg-current" /></span></button>
        <span className="flex items-center gap-2 font-display font-extrabold"><img src="/logo.jpeg" alt="DadaFX" className="w-7 h-7 rounded-lg object-cover shadow-sm" />DadaFX</span>
        <span className="flex items-center gap-2">
          <button onClick={quickAdd} className="btn-brand w-9 h-9 rounded-xl text-white flex items-center justify-center" aria-label="Log trade"><Glyph name="plus" className="w-5 h-5" /></button>
          <button onClick={() => setDark(!dark)} className="w-9 h-9 rounded-xl bg-white/60 dark:bg-white/5 border border-white/60 dark:border-white/10 flex items-center justify-center text-slate-500" aria-label="Dark mode"><Glyph name={dark ? 'sun' : 'moon'} className="w-[18px] h-[18px]" /></button>
        </span>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`fixed lg:sticky lg:top-0 lg:h-screen z-40 inset-y-0 left-0 w-[248px] shrink-0 bg-white/65 dark:bg-slate-950/55 backdrop-blur-2xl border-r border-white/50 dark:border-white/10 flex flex-col transition-transform ${menuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <div className="px-4 h-16 flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800">
            <img src="/logo.jpeg" alt="DadaFX" className="w-9 h-9 rounded-xl object-cover shadow-[var(--shadow-pop)]" />
            <div>
              <p className="font-display font-extrabold leading-none tracking-tight">DadaFX</p>
              <p className="text-[10px] font-bold tracking-[0.16em] text-slate-400 mt-1">INSTITUTIONAL JOURNAL</p>
            </div>
          </div>

          <div className="px-3 pt-3">
            <button onClick={() => go('portfolio')} className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5 hover:border-indigo-300 transition">
              <p className="text-[13px] font-bold text-slate-900 dark:text-white flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />{accounts[0]?.name ?? 'Main Account'}</p>
              <p className="text-[11px] text-slate-500 num mt-0.5">Bal ${(startBalance).toLocaleString()} · {accounts[0]?.broker ?? 'Live'}</p>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
            {GROUPS.map(g => (
              <div key={g.title}>
                <p className="px-2.5 mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">{g.title}</p>
                <div className="space-y-0.5">
                  {g.items.map(n => (
                    <button key={n.id} onClick={() => go(n.id)}
                      className={`w-full flex items-center gap-3 px-3 h-10 rounded-xl text-[13.5px] font-semibold transition ${page === n.id ? 'nav-active' : 'text-slate-500 dark:text-slate-400 hover:bg-white/70 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white'}`}>
                      <Glyph name={n.icon} className="w-[18px] h-[18px] shrink-0" />{n.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-2.5 py-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                <span className="flex items-center gap-1.5 truncate"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-dot text-emerald-500 shrink-0" /><span className="truncate">☁️ {auth.user?.email}</span></span>
                <button onClick={async () => {
                  try { await pushAll(); toast.info('All changes uploaded.'); }
                  catch { toast.err('Some changes may not have uploaded — check connection.'); }
                  sessionStorage.removeItem('dadafx.rl1');
                  supabase.auth.signOut();
                }} className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 ml-1">Out</button>
              </div>
              <CloudStat />
            </div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2.5 py-2">
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Local save active</span>
              <span className="flex items-center gap-2">
                <button onClick={backupAll} className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline" title="Download all data as JSON">Backup</button>
                <label className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer" title="Restore from a backup file">
                  Restore
                  <input type="file" accept="application/json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) restoreAll(f); e.target.value = ''; }} />
                </label>
              </span>
            </div>
            <div className="px-1">
              <button onClick={() => setDark(!dark)} className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 flex items-center justify-center gap-1.5"><Glyph name={dark ? 'sun' : 'moon'} className="w-3.5 h-3.5" />{dark ? 'Light mode' : 'Dark mode'}</button>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center text-sm font-bold shrink-0">Q</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold truncate">FX Trader</p>
                <p className="text-[11px] text-slate-400">VIP Prop Trader</p>
              </div>
            </div>
          </div>
        </aside>
        {menuOpen && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setMenuOpen(false)} />}

        {/* Main column */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Desktop topbar */}
          <header className="hidden lg:flex sticky top-0 z-30 backdrop-blur-xl bg-white/55 dark:bg-slate-950/45 border-b border-white/50 dark:border-white/10">
            <div className="flex items-center gap-2.5 px-6 h-16 w-full max-w-[1280px] mx-auto">
              <img src="/logo.jpeg" alt="DadaFX" className="w-9 h-9 rounded-xl object-cover hidden xl:block shadow-sm" />
              <button onClick={() => go('sessions')} title="Open Trading Sessions" className={`hidden md:inline-flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-bold border transition ${session.active ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-900 dark:text-emerald-300' : 'bg-slate-100 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700'}`}>
                <span className={`w-2 h-2 rounded-full ${session.active ? 'bg-emerald-500 text-emerald-500 live-dot' : 'bg-slate-400'}`} />{session.label}
                {liveSess && <span className="num opacity-80">· closes {fmtCountdown(liveSess.st.msToChange)}</span>}
              </button>
              <span className="hidden md:inline num text-xs font-semibold text-slate-500">{clock}</span>
              <form onSubmit={searchSubmit} className="flex-1 max-w-md relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 flex"><Glyph name="search" className="w-4 h-4" /></span>
                <input ref={searchRef} value={gq} onChange={e => { setGq(e.target.value); }} onFocus={() => { if (page !== 'journal') go('journal'); }}
                  placeholder="Search trades, pairs, setups…" className="w-full h-10 pl-9 pr-16 rounded-xl bg-white/70 dark:bg-slate-950/50 backdrop-blur border border-white/60 dark:border-white/10 shadow-sm text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25 transition" />
                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">Ctrl+K</kbd>
              </form>
              <div className="flex-1" />
              <span className="hidden xl:inline num text-xs font-semibold text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 h-9 items-center md:inline-flex gap-1.5"><Glyph name="calendar" className="w-3.5 h-3.5" />{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              <button onClick={() => setShowHelp(true)} className="w-10 h-10 rounded-xl border border-white/60 dark:border-white/10 bg-white/60 dark:bg-white/5 backdrop-blur text-slate-500 hover:text-slate-900 dark:hover:text-white transition text-sm font-extrabold" title="Keyboard shortcuts (?)">?</button>
              <button onClick={() => go('calendar')} className="relative w-10 h-10 rounded-xl border border-white/60 dark:border-white/10 bg-white/60 dark:bg-white/5 backdrop-blur text-slate-500 hover:text-slate-900 dark:hover:text-white transition flex items-center justify-center" title="Economic calendar" aria-label="Notifications">
                <Glyph name="bell" className="w-[18px] h-[18px]" />{highToday > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-extrabold flex items-center justify-center">{highToday}</span>}
              </button>
              <button onClick={() => go('daily')} className="h-10 px-3.5 rounded-xl bg-white/60 dark:bg-white/5 backdrop-blur border border-white/60 dark:border-white/10 text-[13px] font-bold text-slate-700 dark:text-slate-200 hover:border-indigo-300 transition flex items-center gap-1.5"><Glyph name="plus" className="w-3.5 h-3.5" />New Daily Journal</button>
              <button onClick={quickAdd} className="btn-brand h-10 px-4 rounded-xl text-white text-[13px] font-extrabold flex items-center gap-1.5"><Glyph name="plus" className="w-4 h-4" />Log Trade</button>
            </div>
          </header>

          <main className="flex-1 min-w-0">
            <div className="max-w-[1280px] mx-auto px-3 sm:px-6 pt-4 sm:py-5 pb-28 lg:pb-5 space-y-4">
              {remoteBump > 0 && (
                <button onClick={() => location.reload()} className="w-full rounded-2xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50/80 dark:bg-indigo-950/50 px-4 py-2.5 text-sm font-bold text-indigo-700 dark:text-indigo-200 hover:shadow-md transition">
                  ☁️ Your other device synced changes — click to refresh.
                </button>
              )}
              {page === 'dashboard' && <Dashboard trades={trades} startBalance={startBalance} onGo={go} onQuickAdd={quickAdd} />}
              {page === 'journal' && <TradingJournal trades={trades} setTrades={setTrades} query={gq} setQuery={setGq} openSignal={tradeSignal} onGo={go} onReplay={openReplay} />}
              {page === 'plan' && <Plan onQuickAdd={quickAdd} />}
              {page === 'watch' && <Watchlist />}
              {page === 'targets' && <Targets trades={trades} />}
              {page === 'calendar' && <EconomicCalendar events={events} setEvents={setEvents} trades={trades} />}
              {page === 'news' && <MarketNews />}
              {page === 'charts' && <Charts />}
              {page === 'replay' && <TradeReplay trades={trades} initialId={replayId} />}
              {page === 'owner' && <Owner trades={trades} onGo={go} />}
              {page === 'sessions' && <Sessions trades={trades} onGo={go} />}
              {page === 'analytics' && <Analytics trades={trades} startBalance={startBalance} />}
              {page === 'daily' && <DailyJournal entries={entries} setEntries={setEntries} trades={trades} onGo={go} />}
              {page === 'portfolio' && <Portfolio accounts={accounts} setAccounts={setAccounts} trades={trades} setTrades={setTrades} startBalance={startBalance} setStartBalance={setStartBalance} />}
              {page === 'notebook' && <Notebook notes={notes} setNotes={setNotes} />}
              {page === 'brokers' && <Brokers onGo={go} />}
              {page === 'gallery' && <Gallery trades={trades} entries={entries} />}
              {page === 'calc' && <PositionCalculator trades={trades} />}
              {page === 'goals' && <Goals trades={trades} />}
              {page === 'prop' && <PropFirm trades={trades} />}
              {page === 'weekly' && <Weekly trades={trades} onGo={go} />}
              {page === 'backtest' && <BacktestedTrades rows={backtests} setRows={setBacktests} />}
              {page === 'stats' && <StatisticsCenter trades={trades} backtests={backtests} />}
              {page === 'coupons' && <Coupons coupons={coupons} setCoupons={setCoupons} />}
              {page === 'leaders' && <Leaderboard trades={trades} />}
              {page === 'mistakes' && <Mistakes trades={trades} />}
              {page === 'data' && <Data trades={trades} setTrades={setTrades} backtests={backtests} setBacktests={setBacktests} notes={notes} />}
              <Card className="!py-3 text-center text-[11px] text-slate-400">
                DadaFX Institutional Journal · saved in this browser at {location.host} · always open this same link · v3.11
              </Card>
            </div>
          </main>
        </div>
      </div>

      {tour && !!auth && <Tour onDone={closeTour} onGo={(p) => { closeTour(); go(p); }} />}
      <Modal open={showHelp} onClose={() => setShowHelp(false)} title="Keyboard shortcuts" eyebrow="Work faster">
        <div className="space-y-2 text-sm">
          <button className={btnGhost + ' w-full !justify-start'} onClick={() => { setShowHelp(false); try { localStorage.removeItem('dadafx.tourDone'); } catch { /* ignore */ } setTour(true); }}>▶ Replay welcome tour</button>
          {[
            ['N', 'Log a new trade from anywhere'],
            ['Ctrl / ⌘ + K', 'Jump to trade search'],
            ['Esc', 'Close any dialog'],
            ['?', 'Open this panel'],
          ].map(([k, d]) => (
            <div key={k} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5">
              <kbd className="min-w-24 text-center text-xs font-extrabold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1">{k}</kbd>
              <span className="text-slate-600 dark:text-slate-300 font-medium">{d}</span>
            </div>
          ))}
        </div>
      </Modal>

      {/* Mobile bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/75 dark:bg-slate-950/65 backdrop-blur-2xl border-t border-white/50 dark:border-white/10" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="Primary">
        <div className="grid grid-cols-5 items-end px-2 pt-1.5 pb-1.5">
          {[
            { id: 'dashboard', label: 'Home', icon: 'grid' },
            { id: 'journal', label: 'Journal', icon: 'book' },
          ].map(n => (
            <button key={n.id} onClick={() => go(n.id)} className={`flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[10px] font-extrabold ${page === n.id ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-400'}`}>
              <Glyph name={n.icon} className="w-[22px] h-[22px]" />{n.label}
            </button>
          ))}
          <div className="flex justify-center">
            <button onClick={quickAdd} aria-label="Log trade" className="btn-brand w-14 h-14 -mt-7 rounded-full text-white flex items-center justify-center shadow-xl border-4 border-white dark:border-slate-950">
              <Glyph name="plus" className="w-6 h-6" />
            </button>
          </div>
          {[
            { id: 'calendar', label: 'Events', icon: 'calendar' },
          ].map(n => (
            <button key={n.id} onClick={() => go(n.id)} className={`flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[10px] font-extrabold ${page === n.id ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-400'}`}>
              <Glyph name={n.icon} className="w-[22px] h-[22px]" />{n.label}
            </button>
          ))}
          <button onClick={() => setMenuOpen(true)} className="flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[10px] font-extrabold text-slate-400" aria-label="All pages">
            <span className="space-y-1 py-1"><span className="block w-[22px] h-0.5 bg-current rounded" /><span className="block w-[22px] h-0.5 bg-current rounded" /><span className="block w-[14px] h-0.5 bg-current rounded" /></span>More
          </button>
        </div>
      </nav>

      {/* Toasts */}
      <div className="fixed bottom-24 lg:bottom-4 right-4 left-4 sm:left-auto z-50 space-y-2">
        {toasts.map(t => (
          <div key={t.id} className={`animate-toast px-4 py-2.5 rounded-xl shadow-xl text-sm font-semibold border ${t.kind === 'ok' ? 'bg-emerald-600 text-white border-emerald-500' : t.kind === 'err' ? 'bg-red-600 text-white border-red-500' : 'bg-slate-900 text-white border-slate-700'}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
