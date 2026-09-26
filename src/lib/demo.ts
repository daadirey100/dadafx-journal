import type { Trade } from './types';
import { uid } from './types';

// Realistic sample trades so new users can explore every chart on day one.
// P/L auto-calculates from these — nothing is hardcoded.
const D = (daysAgo: number, hhmm: string): string => {
  const d = new Date(Date.now() - daysAgo * 864e5);
  const [h, m] = hhmm.split(':');
  d.setHours(+h, +m, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

type R = [number, string, 'Buy' | 'Sell', number, number, number, number, number | null, string, string, string, number, number, number];
const ROWS: R[] = [
  // ago, pair, dir, lot, entry, sl, tp, exit, strategy, session, tf, rating, commission, plan
  [2, 'EUR/USD', 'Buy', 0.5, 1.0842, 1.0822, 1.0882, 1.0875, 'London Breakout', 'London', 'H1', 5, 4, 100],
  [3, 'GBP/USD', 'Sell', 0.3, 1.272, 1.275, 1.266, 1.2745, 'NY Reversal', 'New York', 'M15', 2, 3, 40],
  [5, 'XAU/USD', 'Buy', 0.25, 2652.5, 2642.5, 2672.5, 2668.0, 'Trend Continuation', 'London', 'H1', 5, 5, 100],
  [7, 'USD/JPY', 'Buy', 1.0, 149.8, 149.3, 150.8, 149.55, 'Range Fade', 'Asian', 'H4', 2, 6, 60],
  [9, 'EUR/USD', 'Sell', 0.4, 1.092, 1.0945, 1.087, 1.0882, 'SMC / ICT', 'London', 'M15', 4, 4, 80],
  [12, 'GBP/JPY', 'Buy', 0.2, 192.45, 191.95, 193.45, 191.8, 'NY Reversal', 'New York', 'H1', 1, 5, 20],
  [15, 'AUD/USD', 'Buy', 0.6, 0.6512, 0.6482, 0.6572, 0.6554, 'Trend Continuation', 'Overlap', 'H4', 4, 5, 80],
  [19, 'EUR/USD', 'Buy', 0.5, 1.079, 1.077, 1.083, 1.0765, 'London Breakout', 'London', 'M15', 2, 4, 60],
  [23, 'XAU/USD', 'Sell', 0.2, 2688.0, 2698.0, 2668.0, 2671.5, 'Supply & Demand', 'New York', 'H1', 5, 5, 100],
  [28, 'USD/CAD', 'Sell', 0.5, 1.371, 1.374, 1.365, 1.3682, 'NY Reversal', 'New York', 'H4', 4, 4, 80],
  [35, 'GBP/USD', 'Buy', 0.4, 1.265, 1.262, 1.271, 1.2698, 'London Breakout', 'London', 'H1', 4, 3, 100],
  [42, 'EUR/JPY', 'Sell', 0.3, 162.4, 162.9, 161.4, 163.05, 'Range Fade', 'Asian', 'H1', 2, 4, 40],
  [50, 'NAS100', 'Buy', 1.5, 17420, 17380, 17560, 17545, 'Trend Continuation', 'New York', 'M15', 5, 8, 100],
  [60, 'EUR/USD', 'Sell', 0.5, 1.096, 1.0985, 1.091, 1.0921, 'Supply & Demand', 'London', 'H1', 3, 4, 80],
];

const TIMES = ['08:15', '09:30', '10:45', '13:20', '14:05', '15:40', '07:50', '11:10', '16:25', '09:05', '12:35', '08:40', '14:50', '10:20'];

export function demoTrades(): Trade[] {
  return ROWS.map((r, i) => {
    const [ago, pair, dir, lot, entry, sl, tp, exit, strategy, session, tf, rating, comm, plan] = r;
    const won = exit != null && (dir === 'Buy' ? exit > entry : exit < entry);
    return {
      id: uid(), date: D(ago, TIMES[i % TIMES.length]), pair, direction: dir, lot,
      entry, stopLoss: sl, takeProfit: tp, exit, riskPct: 1, commission: comm, planScore: plan,
      strategy, session, timeframe: tf, setup: i % 3 === 0 ? 'Break + retest' : i % 3 === 1 ? 'Double top' : 'Order block',
      emotions: won ? 'Calm' : i % 2 ? 'FOMO' : 'Frustrated',
      mistakes: won ? '' : i % 2 ? 'Early entry' : 'Moved stop',
      notes: 'Sample trade — delete me once you log your own.',
      rating,
    };
  });
}
