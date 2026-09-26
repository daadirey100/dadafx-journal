import type { BacktestTrade, Trade } from './types.ts';

// Contract size: 100,000 units per 1.0 lot for FX. Works for XAU/BTC as estimate.
const CONTRACT = 100000;

export function pipSize(pair: string): number {
  if (pair.includes('JPY')) return 0.01;
  if (pair.includes('XAU')) return 0.1;
  if (pair.includes('BTC')) return 1;
  if (pair.includes('US30') || pair.includes('NAS100')) return 1;
  return 0.0001;
}

const c2 = (v: number) => Math.round(v * 100) / 100;

export function tradePL(trade: Pick<Trade, 'direction' | 'lot' | 'entry' | 'exit' | 'pair' | 'commission'>): number | null {
  if (trade.exit == null) return null;
  const diff = trade.direction === 'Buy' ? trade.exit - trade.entry : trade.entry - trade.exit;
  // P/L in account currency, simplified: diff * lots * contract
  const raw = diff * trade.lot * CONTRACT;
  const gross = trade.pair.includes('JPY') ? raw / 150
    : trade.pair.includes('XAU') ? diff * trade.lot * 100
    : trade.pair.includes('BTC') ? diff * trade.lot * 1
    : raw;
  return c2(gross - (trade.commission ?? 0)); // net of commission + swap, rounded — no float dust
}

export function tradeRisk(trade: Pick<Trade, 'direction' | 'lot' | 'entry' | 'stopLoss' | 'pair'>): number {
  const diff = Math.abs(trade.entry - trade.stopLoss);
  const raw = diff * trade.lot * CONTRACT;
  if (trade.pair.includes('JPY')) return raw / 150;
  if (trade.pair.includes('XAU')) return diff * trade.lot * 100;
  if (trade.pair.includes('BTC')) return diff * trade.lot * 1;
  return raw;
}

export function tradeReward(trade: Pick<Trade, 'direction' | 'lot' | 'entry' | 'takeProfit' | 'pair'>): number {
  const diff = Math.abs(trade.takeProfit - trade.entry);
  const raw = diff * trade.lot * CONTRACT;
  if (trade.pair.includes('JPY')) return raw / 150;
  if (trade.pair.includes('XAU')) return diff * trade.lot * 100;
  if (trade.pair.includes('BTC')) return diff * trade.lot * 1;
  return raw;
}

export function tradeR(trade: Pick<Trade, 'direction' | 'lot' | 'entry' | 'exit' | 'stopLoss' | 'takeProfit' | 'pair'>): number | null {
  const pl = tradePL(trade as any);
  const risk = tradeRisk(trade as any);
  if (pl == null || risk <= 0) return null;
  return Math.round((pl / risk) * 10000) / 10000; // R to 4dp — no float dust in stats
}

export function tradeRR(trade: Pick<Trade, 'entry' | 'stopLoss' | 'takeProfit'>): number | null {
  const riskDist = Math.abs(trade.entry - trade.stopLoss);
  const rewardDist = Math.abs(trade.takeProfit - trade.entry);
  if (riskDist <= 0) return null;
  return rewardDist / riskDist;
}

export function tradePips(trade: Pick<Trade, 'direction' | 'entry' | 'exit' | 'pair'>): number | null {
  if (trade.exit == null) return null;
  const diff = trade.direction === 'Buy' ? trade.exit - trade.entry : trade.entry - trade.exit;
  const ps = pipSize(trade.pair);
  if (!ps) return null;
  return diff / ps;
}

export interface Stats {
  total: number; wins: number; losses: number; breakeven: number;
  winRate: number; totalPL: number; grossProfit: number; grossLoss: number;
  avgWin: number; avgLoss: number;
  profitFactor: number; expectancy: number; bestTrade: number; worstTrade: number;
  avgR: number; totalLots: number;
}

// (c2 rounding helper lives at the top of this file — per-trade P/L is
// rounded at the source so aggregates can never accumulate float dust.)
export function calcStats(trades: Trade[]): Stats {
  const closed = trades.filter(t => t.exit != null);
  const pls = closed.map(t => tradePL(t) ?? 0);
  const total = closed.length;
  const wins = pls.filter(v => v > 0).length;
  const losses = pls.filter(v => v < 0).length;
  const breakeven = total - wins - losses;
  const grossProfit = c2(pls.filter(v => v > 0).reduce((a, b) => a + b, 0));
  const grossLoss = c2(Math.abs(pls.filter(v => v < 0).reduce((a, b) => a + b, 0)));
  const totalPL = c2(pls.reduce((a, b) => a + b, 0));
  const avgWin = c2(wins ? grossProfit / wins : 0);
  const avgLoss = c2(losses ? grossLoss / losses : 0);
  const rs = closed.map(t => tradeR(t) ?? 0);
  return {
    total,
    wins, losses, breakeven,
    winRate: total ? (wins / total) * 100 : 0,
    totalPL, grossProfit, grossLoss,
    avgWin, avgLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0,
    expectancy: c2(total ? totalPL / total : 0),
    bestTrade: c2(pls.length ? Math.max(...pls) : 0),
    worstTrade: c2(pls.length ? Math.min(...pls) : 0),
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0,
    totalLots: Math.round(closed.reduce((a, t) => a + t.lot, 0) * 100) / 100,
  };
}

export function equityCurve(trades: Trade[], startBalance: number): { date: string; equity: number }[] {
  const closed = [...trades].filter(t => t.exit != null).sort((a, b) => a.date.localeCompare(b.date));
  let eq = startBalance;
  const pts = [{ date: 'Start', equity: eq }];
  for (const t of closed) {
    eq += tradePL(t) ?? 0;
    pts.push({ date: t.date.slice(0, 10), equity: eq });
  }
  return pts;
}

export function maxDrawdown(trades: Trade[], startBalance: number): number {
  const pts = equityCurve(trades, startBalance);
  let peak = pts[0]?.equity ?? startBalance;
  let dd = 0;
  for (const p of pts) {
    peak = Math.max(peak, p.equity);
    dd = Math.min(dd, p.equity - peak);
  }
  return dd;
}

export function backtestStats(rows: BacktestTrade[]) {
  const wins = rows.filter(r => r.resultR > 0).length;
  const totalR = rows.reduce((a, r) => a + r.resultR, 0);
  const grossW = rows.filter(r => r.resultR > 0).reduce((a, r) => a + r.resultR, 0);
  const grossL = Math.abs(rows.filter(r => r.resultR < 0).reduce((a, r) => a + r.resultR, 0));
  const avgW = wins ? grossW / wins : 0;
  const nL = rows.filter(r => r.resultR < 0).length;
  const be = rows.filter(r => Math.abs(r.resultR) < 0.005).length;
  const sorted = [...rows].sort((a,b)=>a.date.localeCompare(b.date));
  let peak=0, dd=0, maxDD=0;
  for(const r of sorted){ peak=Math.max(peak, peak+r.resultR); dd=Math.min(dd, (peak+r.resultR)-peak); maxDD=Math.min(maxDD, dd); if(r.resultR>0) dd=0; }
  // streaks
  let curW=0, curL=0, maxW=0, maxL=0;
  for(const r of rows){ if(r.resultR>0){curW++;curL=0;maxW=Math.max(maxW,curW);} else if(r.resultR<0){curL++;curW=0;maxL=Math.max(maxL,curL);} else {curW=0;curL=0;}}
  const avgRating = rows.filter(r=>r.rating).length ? rows.filter(r=>r.rating).reduce((a,r)=>a+(r.rating??0),0)/rows.filter(r=>r.rating).length : 0;
  return {
    total: rows.length,
    wins,
    losses: nL,
    breakeven: be,
    winRate: rows.length ? (wins / rows.length) * 100 : 0,
    totalR,
    avgR: rows.length ? totalR / rows.length : 0,
    pf: grossL > 0 ? grossW / grossL : grossW > 0 ? 99 : 0,
    avgWin: avgW,
    avgLoss: nL ? grossL / nL : 0,
    best: rows.length ? Math.max(...rows.map(r => r.resultR)) : 0,
    worst: rows.length ? Math.min(...rows.map(r => r.resultR)) : 0,
    maxDD,
    maxWinStreak: maxW,
    maxLossStreak: maxL,
    expectancy: rows.length ? totalR/rows.length : 0,
    avgRating,
  };
}

export function positionSize(balance: number, riskPct: number, entry: number, stopLoss: number, pair = 'EUR/USD'): number {
  const riskMoney = balance * (riskPct / 100);
  const dist = Math.abs(entry - stopLoss);
  if (dist <= 0) return 0;
  let perLot = dist * CONTRACT;
  if (pair.includes('JPY')) perLot = perLot / 150;
  if (pair.includes('XAU')) perLot = dist * 100;
  if (pair.includes('BTC')) perLot = dist * 1;
  if (perLot <= 0) return 0;
  return riskMoney / perLot;
}

export function tradeDurationMs(trade: Pick<Trade, 'date' | 'exit' | 'exitAt'>): number | null {
  if (trade.exit == null) return null;
  const end = trade.exitAt ? new Date(trade.exitAt).getTime() : NaN;
  const start = new Date(trade.date).getTime();
  if (isNaN(start)) return null;
  if (!isNaN(end) && end >= start) return end - start;
  return null;
}

export function fmtDuration(ms: number | null): string {
  if (ms == null) return '—';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export const fmtMoney = (v: number, cur = '$') =>
  `${v < 0 ? '-' : ''}${cur}${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtNum = (v: number, d = 2) => v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
