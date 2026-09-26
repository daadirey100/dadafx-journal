// Central domain types for Dada FX Journal.
// Everything persists to localStorage (works offline, survives refresh).

export type Direction = 'Buy' | 'Sell';
export type Impact = 'High' | 'Medium' | 'Low';

export interface Trade {
  id: string;
  date: string; // ISO datetime
  pair: string;
  direction: Direction;
  lot: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  exit: number | null; // null = open trade
  riskPct: number;
  strategy: string;
  session: string;
  timeframe: string;
  setup: string;
  emotions: string;
  mistakes: string;
  notes: string;
  rating: number; // 1-5
  commission?: number; // commission + swap in $ — deducted from P/L
  exitAt?: string; // ISO datetime of exit (for hold duration)
  accountId?: string; // '' = Main; 'pf:<id>' portfolio; 'prop:<id>' prop-firm
  // --- broker sync (read-only auto-import; never hand-edited by provider code) ---
  source?: 'manual' | 'oanda' | 'ctrader' | 'mt5' | 'tradingview' | 'custom';
  externalId?: string; // e.g. "oanda:12345" — dedup key across syncs & devices
  brokerConnectionId?: string; // journal-side trace to broker_connections.id
  brokerAccountId?: string; // journal-side trace to broker_accounts.id
  planScore?: number; // 0-100 plan compliance at log time
  screenshot?: string; // legacy single shot (shown as "After")
  beforeShot?: string; // entry setup, data URL stored locally
  afterShot?: string; // trade result, data URL stored locally
  accountBalanceAtOpen?: number;
}

export interface DailyEntry {
  id: string;
  date: string; // YYYY-MM-DD
  mood: string;
  bias: string;
  preparation: string;
  execution: string;
  lessons: string;
  screenshot?: string;
}

export interface NoteItem {
  id: string;
  title: string;
  body: string;
  folder: string;
  tags: string[];
  updatedAt: string;
}

export interface BacktestTrade {
  id: string;
  date: string;
  pair: string;
  direction: Direction;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  exit: number;
  lot?: number;
  resultR: number; // R multiple, entered or auto
  strategy: string;
  session?: string;
  setup?: string;
  timeframe: string;
  notes: string;
  // --- professional grade (mirrors Trade) ---
  riskPct?: number;
  commission?: number;
  rating?: number; // 1-5
  mistakes?: string;
  emotions?: string;
  beforeShot?: string;
  afterShot?: string;
  planScore?: number; // 0-100
}

export interface Account {
  id: string;
  name: string;
  broker: string;
  currency: string;
  balance: number;
  startBalance: number;
}

export interface Coupon {
  code: string;
  title: string;
  detail: string;
  discount: string;
  expires: string;
  claimed: boolean;
}

export interface EconEvent {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM local
  currency: string; // USD, EUR...
  flag: string; // emoji flag
  title: string;
  impact: Impact;
  previous: string;
  forecast: string;
  actual: string;
  notify: boolean;
}

export const PAIRS = ['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','USD/CAD','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY','XAU/USD','BTC/USD','US30','NAS100'];
export const STRATEGIES = ['London Breakout','NY Reversal','Trend Continuation','Supply & Demand','SMC / ICT','Range Fade','News Straddle','Moving Average Cross'];
export const SESSIONS = ['London','New York','Asian','Overlap'];
export const TIMEFRAMES = ['M5','M15','H1','H4','D1'];
export const MOODS = ['Calm','Confident','Anxious','FOMO','Frustrated','Disciplined','Tired'];
export const CURRENCIES = ['USD','EUR','GBP','JPY','AUD','CAD','CHF','NZD','CNY'];

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const todayISO = () => new Date().toISOString().slice(0, 10);

export interface GuardSettings { enabled: boolean; dailyMax: number; weeklyMax: number; }
export interface GoalSettings { monthlyTarget: number; winRateTarget: number; maxTrades: number; }

export interface TradeTemplate {
  id: string;
  name: string;
  data: { pair: string; direction: Direction; lot: number; riskPct: number; strategy: string; session: string; timeframe: string; setup: string };
}

// Every account list (portfolio + prop) resolves to {id,name} options for tagging trades.
export function accountOptions(): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [{ id: '', name: 'Main' }];
  try {
    const p = JSON.parse(localStorage.getItem('dadafx.accounts') ?? '[]');
    if (Array.isArray(p)) for (const a of p) out.push({ id: `pf:${a.id}`, name: a.name });
  } catch { /* ignore */ }
  try {
    const p = JSON.parse(localStorage.getItem('dadafx.propAccounts') ?? '[]');
    if (Array.isArray(p)) for (const a of p) out.push({ id: `prop:${a.id}`, name: `${a.firm} ${a.name}` });
  } catch { /* ignore */ }
  return out;
}
export function accountName(id?: string): string {
  if (!id) return 'Main';
  return accountOptions().find(a => a.id === id)?.name ?? 'Main';
}

export interface PropAccount {
  id: string; name: string; firm: string; size: number; phase: string;
  targetPct: number; dailyMaxPct: number; totalMaxPct: number;
  payouts?: { date: string; amount: number }[];
  certificates?: { id: string; name: string; date: string; src: string }[];
}

export interface TradingPlan {
  rules: string[];
  allowedPairs: string[];
  maxDailyRisk: number; // % per trade
  maxTradesPerDay: number;
  preferredSessions: string[];
  checklist: string[]; // A+ setup items
  entryRules: string;
  exitRules: string;
}

export const DEFAULT_PLAN: TradingPlan = {
  rules: ['Risk max 1% per trade', 'Max 3 trades per day', 'No trades into high-impact news', 'Journal every trade the same day'],
  allowedPairs: ['EUR/USD', 'GBP/USD', 'XAU/USD'],
  maxDailyRisk: 1,
  maxTradesPerDay: 3,
  preferredSessions: ['London', 'New York'],
  checklist: ['Clear H1 trend / bias', 'Liquidity sweep seen', 'Entry at discount or premium', 'SL beyond structure', 'Minimum 1:2 R:R'],
  entryRules: 'Enter on M15 confirmation once H1 bias is set. No market orders into spread spikes.',
  exitRules: 'Take profit at opposing liquidity. Move SL to breakeven at +1R. Never widen a stop.',
};

export function weekStartISO(d = new Date()): string {
  const t = new Date(d);
  const day = (t.getDay() + 6) % 7; // Monday-first
  t.setDate(t.getDate() - day);
  return t.toISOString().slice(0, 10);
}
