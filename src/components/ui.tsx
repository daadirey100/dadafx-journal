import { useEffect, useId, useState, type ReactNode } from 'react';

/* ---------- surfaces ---------- */
export function Card({ children, className = '', pad = true, lift = false }: { children: ReactNode; className?: string; pad?: boolean; lift?: boolean }) {
  return (
    <div className={`glass rounded-2xl ${pad ? 'p-4 sm:p-5' : ''} ${lift ? 'card-lift' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({ eyebrow, title, sub, right }: { eyebrow: string; title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-400">{eyebrow}</p>
        <h1 className="font-display text-[26px] sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1">{title}</h1>
        {sub && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">{sub}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

/* ---------- pro glyph icons (TradeZilla-style, no emoji) ---------- */
const GLYPHS: Record<string, ReactNode> = {
  trend: <><path d="M3 17l6-6 4 4 7-7" /><path d="M14 7h7v7" /></>,
  shield: <><path d="M12 3l7 3v5c0 4.6-3 8.6-7 10-4-1.4-7-5.4-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></>,
  bolt: <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M4 10.5h16" /></>,
  scale: <><path d="M12 3v18M8 21h8M4 7l8-2.5L20 7" /><path d="M4 7l-2.2 5.5a2.8 2.8 0 005.4 0L5 7M20 7l-2.2 5.5a2.8 2.8 0 005.4 0L21 7" /></>,
  receipt: <><path d="M6 3h12v18l-2-1.6-2 1.6-2-1.6L10 21l-2-1.6L6 21V3z" /><path d="M9.5 8.5h5M9.5 12h5" /></>,
  waves: <path d="M2.5 8.5c2 0 2 1.8 4 1.8s2-1.8 4-1.8 2 1.8 4 1.8 2-1.8 4-1.8 1.5 1.2 3 1.6M2.5 14.5c2 0 2 1.8 4 1.8s2-1.8 4-1.8 2 1.8 4 1.8 2-1.8 4-1.8 1.5 1.2 3 1.6" />,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" />,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" /></>,
  flask: <><path d="M9.5 3h5M10.5 3v5.5L5.4 18a2.4 2.4 0 002.1 3.5h9a2.4 2.4 0 002.1-3.5L13.5 8.5V3" /><path d="M7.5 14.5h9" /></>,
  bars: <path d="M5 20v-7M11 20V5M17 20v-10M3 20h18" />,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18M16 15h2" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  book: <><path d="M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" /><path d="M9.5 3v18" /></>,
  briefcase: <><rect x="3" y="8" width="18" height="12" rx="2.5" /><path d="M9 8V6a2 2 0 012-2h2a2 2 0 012 2v2M3 13.5h18" /></>,
  clipboard: <><rect x="5" y="5" width="14" height="16" rx="2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9.5 13.5l2 2 3.5-4" /></>,
  pencil: <><path d="M4 20l1-4.5L16.5 4a2.12 2.12 0 013 3L8 18.5 4 20z" /><path d="M14.5 6l3 3" /></>,
  image: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M4.5 17.5l4.5-4.5 3 3 3.5-3.5 4 4" /></>,
  chart: <><path d="M4 4v16h16" /><path d="M8.5 15.5v-4M12.5 15.5V8M16.5 15.5v-2.5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3.5 2" /></>,
  calc: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8.5 7.5h7" /><path d="M8.5 12.5h.01M12 12.5h.01M15.5 12.5h.01M8.5 16h.01M12 16h.01M15.5 16h.01" /></>,
  bank: <><path d="M3 9.5L12 4l9 5.5" /><path d="M5 10v8M19 10v8M8.5 12.5V16M12 12.5V16M15.5 12.5V16M3 20.5h18" /></>,
  news: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 12.5h8M8 16h5" /></>,
  ticket: <><path d="M4 8a2 2 0 012-2h12a2 2 0 012 2v1.5a2.5 2.5 0 000 5V16a2 2 0 01-2 2H6a2 2 0 01-2-2v-1.5a2.5 2.5 0 000-5V8z" /><path d="M13.5 6v2M13.5 11v2M13.5 16v2" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M15.8 15.8L20.5 20.5" /></>,
  bell: <><path d="M6 9.5a6 6 0 0112 0c0 4.5 1.8 5.8 1.8 5.8H4.2S6 14 6 9.5" /><path d="M10 19.5a2 2 0 004 0" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 13.5A8 8 0 1110.5 4 6.5 6.5 0 0020 13.5z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  download: <><path d="M12 3.5V15M7.5 10.5L12 15l4.5-4.5" /><path d="M4 20.5h16" /></>,
  upload: <><path d="M12 15V3.5M7.5 8L12 3.5 16.5 8" /><path d="M4 20.5h16" /></>,
  refresh: <><path d="M20 12a8 8 0 10-2.3 5.6" /><path d="M20 12V6.5M20 12h-5.5" /></>,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  link: <><path d="M10 14a4.5 4.5 0 006.4.4l3-3a4.5 4.5 0 00-6.4-6.4l-1.7 1.7" /><path d="M14 10a4.5 4.5 0 00-6.4-.4l-3 3a4.5 4.5 0 006.4 6.4l1.7-1.7" /></>,
};

export function Glyph({ name, className = 'w-[18px] h-[18px]' }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {GLYPHS[name] ?? GLYPHS.trend}
    </svg>
  );
}

/* ---------- KPIs ---------- */
export function KpiCard({ label, value, delta, deltaTone = 'up', valueTone = 'neutral', sub, icon, tint = 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300', className = '' }: {
  label: string; value: string; delta?: string; deltaTone?: 'up' | 'down' | 'flat' | 'brand'; valueTone?: 'up' | 'down' | 'neutral';
  sub?: ReactNode; icon: string; tint?: string; className?: string;
}) {
  const vTone = valueTone === 'up' ? 'text-emerald-600 dark:text-emerald-400' : valueTone === 'down' ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white';
  const dTone = deltaTone === 'up' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
    : deltaTone === 'down' ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
    : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300';
  return (
    <Card className={`${className}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400 leading-snug">{label}</p>
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${tint}`}><Glyph name={icon} /></span>
      </div>
      <p className={`font-display text-[21px] sm:text-[26px] font-extrabold tracking-tight num mt-1 truncate ${vTone}`}>{value}</p>
      <div className="flex items-center gap-2 mt-1.5 min-h-[22px]">
        {delta && <span className={`inline-flex items-center h-[22px] px-2 rounded-full text-[11px] font-bold num ${dTone}`}>{delta}</span>}
        {sub && <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{sub}</span>}
      </div>
    </Card>
  );
}

/* ---------- pills & badges ---------- */
export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'green' | 'red' | 'blue' | 'amber' | 'indigo' }) {
  const map: Record<string, string> = {
    gray: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900',
    red: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900',
    blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900',
    amber: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-900',
  };
  return <span className={`inline-flex items-center gap-1 h-[22px] px-2 rounded-full border text-[11px] font-bold tracking-wide whitespace-nowrap ${map[tone]}`}>{children}</span>;
}

export function SidePill({ side }: { side: 'Buy' | 'Sell' }) {
  return <span className={`inline-flex items-center h-[22px] px-2.5 rounded-md text-[11px] font-extrabold tracking-wider ${side === 'Buy' ? 'side-buy' : 'side-sell'}`}>{side.toUpperCase()}</span>;
}

export function PLPill({ value, format }: { value: number | null; format: (v: number) => string }) {
  if (value == null) return <Badge tone="gray">OPEN</Badge>;
  return <span className={`inline-flex items-center h-[26px] px-2.5 rounded-md text-[12px] font-extrabold num whitespace-nowrap ${value >= 0 ? 'pl-win' : 'pl-loss'}`}>{format(value)}</span>;
}

export function SetupPill({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold leading-relaxed">{children}</span>;
}

export function Stars({ n }: { n: number }) {
  return <span className="tracking-tight whitespace-nowrap" aria-label={`${n} of 5 stars`}>
    {[1, 2, 3, 4, 5].map(i => <span key={i} className={i <= n ? 'text-indigo-500' : 'text-slate-300 dark:text-slate-700'}>★</span>)}
  </span>;
}

export function Confetti({ count = 60 }: { count?: number }) {
  const [pieces, setPieces] = useState(() => [] as { left: number; delay: number; dur: number; color: string; w: number; h: number; round: boolean }[]);
  useEffect(() => {
    const colors = ['#4f46e5', '#7c3aed', '#059669', '#f59e0b', '#ec4899', '#38bdf8'];
    const t = window.setTimeout(() => {
      setPieces(
        Array.from({ length: count }, (_, i) => ({
          left: Math.random() * 100,
          delay: Math.random() * 0.8,
          dur: 2.4 + Math.random() * 1.8,
          color: colors[i % colors.length],
          w: 6 + Math.random() * 6,
          h: 8 + Math.random() * 8,
          round: Math.random() > 0.5,
        })),
      );
    }, 0);
    return () => window.clearTimeout(t);
  }, [count]);
  return (
    <div aria-hidden>
      {pieces.map((p, i) => (
        <span key={i} className="confetti-piece" style={{
          left: `${p.left}vw`, background: p.color, width: p.w, height: p.h,
          borderRadius: p.round ? '50%' : '2px',
          animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`,
        }} />
      ))}
    </div>
  );
}

export function Empty({ icon = '📭', title, hint, action }: { icon?: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-3xl mb-3">{icon}</div>
      <p className="font-display font-bold text-slate-900 dark:text-white">{title}</p>
      {hint && <p className="text-sm text-slate-500 mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------- forms & buttons ---------- */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  'w-full h-10 px-3 rounded-xl bg-white/70 dark:bg-slate-950/50 backdrop-blur border border-white/60 dark:border-white/10 shadow-sm text-slate-900 dark:text-white text-[13px] placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25 transition';

export const btnPrimary =
  'btn-brand inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg text-white text-sm font-bold disabled:opacity-50';
export const btnGhost =
  'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-white/60 dark:bg-white/5 backdrop-blur text-slate-700 dark:text-slate-200 border border-white/60 dark:border-white/10 text-sm font-bold hover:bg-white/80 dark:hover:bg-white/10 transition';
export const btnDanger =
  'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700';

export function Modal({ open, onClose, title, eyebrow, children, wide }: { open: boolean; onClose: () => void; title: string; eyebrow?: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[4px] animate-fade-in" onClick={onClose} />
      <div className={`relative glass rounded-t-3xl sm:rounded-2xl shadow-2xl w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[94vh] sm:max-h-[92vh] overflow-y-auto animate-slide-up`} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="px-5 py-4 border-b border-white/50 dark:border-white/10 sticky top-0 bg-white/60 dark:bg-slate-950/40 backdrop-blur-xl rounded-t-2xl z-10">
          {eyebrow && <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-500">{eyebrow}</p>}
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">{title}</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition flex items-center justify-center" aria-label="Close"><Glyph name="x" className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({ open, onClose, onYes, title, body }: { open: boolean; onClose: () => void; onYes: () => void; title: string; body: string }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-slate-600 dark:text-slate-300">{body}</p>
      <div className="flex justify-end gap-2 mt-5">
        <button className={btnGhost} onClick={onClose}>Cancel</button>
        <button className={btnDanger} onClick={() => { onYes(); onClose(); }}>Delete</button>
      </div>
    </Modal>
  );
}

/* ---------- tabs ---------- */
export function Tabs<T extends string>({ options, value, onChange }: { options: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`h-9 px-3.5 rounded-xl text-[13px] font-bold transition backdrop-blur ${value === o.id ? 'bg-white/75 dark:bg-white/10 text-indigo-600 dark:text-indigo-300 shadow-sm border border-white/60 dark:border-white/10' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
          {o.label}
          {o.count != null && <span className={`ml-1.5 inline-flex items-center h-5 min-w-5 justify-center px-1 rounded-full text-[11px] num ${value === o.id ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- charts (dependency-free SVG) ---------- */
export function EquityChart({ points, startLine, height = 260, format, formatTip }: {
  points: { date: string; equity: number }[]; startLine?: number; height?: number;
  format?: (v: number) => string; formatTip?: (v: number) => string;
}) {
  const fmtAxis = format ?? ((v: number) => `$${(v / 1000).toFixed(0)}k`);
  const fmtT = formatTip ?? ((v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <div className="text-xs text-slate-400 py-10 text-center">Not enough data yet — log trades to draw the trajectory.</div>;
  const w = 720, h = height, padL = 58, padR = 14, padT = 12, padB = 26;
  const vals = points.map(p => p.equity);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (startLine != null) { min = Math.min(min, startLine); max = Math.max(max, startLine); }
  const span = max - min || 1;
  const X = (i: number) => padL + (i / (points.length - 1)) * (w - padL - padR);
  const Y = (v: number) => padT + (1 - (v - min) / span) * (h - padT - padB);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.equity).toFixed(1)}`).join(' ');
  const area = `${line} L${X(points.length - 1).toFixed(1)},${(h - padB).toFixed(1)} L${X(0).toFixed(1)},${(h - padB).toFixed(1)} Z`;
  const up = vals[vals.length - 1] >= vals[0];
  const col = up ? '#059669' : '#dc2626';
  const ticks = [0, 1, 2, 3].map(i => min + (span * i) / 3);
  const hi = hover != null ? points[hover] : null;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full select-none" style={{ height }} role="img" aria-label="Equity trajectory">
        <defs>
          <linearGradient id={`${gid}-a`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity={0.28} />
            <stop offset="100%" stopColor={col} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id={`${gid}-l`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="100%" stopColor={col} />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={Y(t)} y2={Y(t)} stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeDasharray={i === 0 ? '' : '3 4'} />
            <text x={padL - 8} y={Y(t) + 3.5} textAnchor="end" fontSize={10} fill="currentColor" className="text-slate-400" fontFamily="JetBrains Mono, monospace">
              {fmtAxis(t)}
            </text>
          </g>
        ))}
        {startLine != null && <line x1={padL} x2={w - padR} y1={Y(startLine)} y2={Y(startLine)} stroke="#94a3b8" strokeDasharray="6 5" strokeWidth={1.2} opacity={0.7} />}
        <path d={area} fill={`url(#${gid}-a)`} />
        <path d={line} fill="none" stroke={`url(#${gid}-l)`} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => {
          if (i !== points.length - 1 && i % Math.ceil(points.length / 12) !== 0) return null;
          return <circle key={i} cx={X(i)} cy={Y(p.equity)} r={i === points.length - 1 ? 5 : 2.5} fill={i === points.length - 1 ? col : '#fff'} stroke={col} strokeWidth={2} />;
        })}
        {hi && <g><line x1={X(hover!)} x2={X(hover!)} y1={padT} y2={h - padB} stroke={col} strokeDasharray="3 3" opacity={0.6} /><circle cx={X(hover!)} cy={Y(hi.equity)} r={5} fill={col} stroke="#fff" strokeWidth={2} /></g>}
        <rect x={padL} y={0} width={w - padL - padR} height={h} fill="transparent"
          onMouseMove={e => {
            const r = (e.target as SVGRectElement).getBoundingClientRect();
            const frac = (e.clientX - r.left - (padL / w) * r.width) / (((w - padL - padR) / w) * r.width);
            setHover(Math.max(0, Math.min(points.length - 1, Math.round(frac * (points.length - 1)))));
          }} />
      </svg>
      {hi && (
        <div className="absolute pointer-events-none z-10 -translate-x-1/2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg px-2.5 py-1.5 text-[11px] num font-bold shadow-xl whitespace-nowrap"
          style={{ left: `${(X(hover!) / w) * 100}%`, top: 0 }}>
          {hi.date} · {fmtT(hi.equity)}
        </div>
      )}
    </div>
  );
}

export function Donut({ pct, size = 120, label, sub }: { pct: number; size?: number; label: string; sub?: ReactNode }) {
  const r = 44, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
          <circle cx={55} cy={55} r={r} fill="none" strokeWidth={13} className="stroke-slate-100 dark:stroke-slate-800" />
          <circle cx={55} cy={55} r={r} fill="none" stroke="url(#donut-g)" strokeWidth={13} strokeLinecap="round"
            strokeDasharray={`${(v / 100) * c} ${c}`} style={{ transition: 'stroke-dasharray .6s ease' }} />
          <defs><linearGradient id="donut-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4f46e5" /><stop offset="100%" stopColor="#7c3aed" />
          </linearGradient></defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display font-extrabold text-xl num text-slate-900 dark:text-white">{v.toFixed(1)}%</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
        </div>
      </div>
      {sub && <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">{sub}</div>}
    </div>
  );
}

export function DivBars({ data, money = false }: { data: { label: string; value: number; tone?: 'up' | 'down' | 'flat' }[]; money?: boolean }) {
  if (!data.length) return <p className="text-xs text-slate-400 py-6 text-center">No data yet.</p>;
  const max = Math.max(...data.map(d => Math.abs(d.value)), 1);
  const fmt = (v: number) => money
    ? `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
  const toneOf = (d: { value: number; tone?: 'up' | 'down' | 'flat' }) => d.tone ?? (d.value > 0 ? 'up' : d.value < 0 ? 'down' : 'flat');
  const txt: Record<string, string> = { up: 'text-emerald-600 dark:text-emerald-400', down: 'text-red-600 dark:text-red-400', flat: 'text-slate-500 dark:text-slate-400' };
  const bar: Record<string, string> = { up: 'bg-gradient-to-r from-emerald-500 to-emerald-400', down: 'bg-gradient-to-r from-red-500 to-red-400', flat: 'bg-gradient-to-r from-slate-400 to-slate-300' };
  return (
    <div className="space-y-2.5">
      {data.map(d => {
        const t = toneOf(d);
        return (
          <div key={d.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold text-slate-700 dark:text-slate-200">{d.label}</span>
              <span className={`num font-extrabold ${txt[t]}`}>{fmt(d.value)}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${bar[t]}`} style={{ width: `${Math.max(4, (Math.abs(d.value) / max) * 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* legacy StatCard (kept for Statistics Center) */
export function StatCard({ label, value, sub, tone = 'neutral' as 'neutral' | 'up' | 'down' | 'brand', icon }: { label: string; value: string; sub?: string; tone?: 'neutral' | 'up' | 'down' | 'brand'; icon?: string }) {
  const color = tone === 'up' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'down' ? 'text-red-600 dark:text-red-400' : tone === 'brand' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-900 dark:text-white';
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">{label}</p>
          <p className={`font-display text-2xl font-extrabold tracking-tight mt-1 num truncate ${color}`}>{value}</p>
          {sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{sub}</p>}
        </div>
        {icon && <span className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0" aria-hidden><Glyph name={icon} /></span>}
      </div>
    </Card>
  );
}

/* legacy simple bars (kept for Analytics page) */
export function Bars({ data, money = false }: { data: { label: string; value: number }[]; money?: boolean }) {
  return <DivBars data={data} money={money} />;
}

export function Sparkline({ points, height = 120, stroke = '#4f46e5' }: { points: number[]; height?: number; stroke?: string; fill?: boolean }) {
  if (points.length < 2) return <div className="text-xs text-slate-400 py-8 text-center">Not enough data yet.</div>;
  const w = 560, h = height, pad = 8;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const coords = points.map((p, i) => [pad + (i / (points.length - 1)) * (w - pad * 2), h - pad - ((p - min) / span) * (h - pad * 2)] as const);
  const path = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} role="img" aria-label="Trend">
      <path d={`${path} L${(w - pad).toFixed(1)},${h} L${pad},${h} Z`} fill={stroke} opacity={0.1} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
