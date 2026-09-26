# Dada FX Journal

Your personal forex trading journal. All data is saved **in your browser** (localStorage), so it survives refreshes with no login, no server, no cost.

## How to run (plain English)

You only do this once:

1. Install Node.js from https://nodejs.org (pick the LTS version), then restart your computer.
2. Open this `app` folder in a terminal:
   - Windows: open the folder, click the address bar, type `powershell`, press Enter.
3. Run:
   ```powershell
   npm install
   npm run dev
   ```
4. Open the link it shows, usually http://localhost:5173 — that's your app.

To use it later, just repeat step 3's `npm run dev`.

## What you get

- **Dashboard** — balance, equity, daily/monthly P/L, win rate, profit factor, drawdown, equity curve, recent trades, high-impact events.
- **Trading Journal** — add / edit / delete trades with pair, Buy/Sell, lots, entry, SL, TP, exit, risk %, strategy, session, timeframe, setup, emotions, mistakes, screenshot, notes, rating. P/L, R-multiple, R:R and risk $ auto-calculate.
- **Economic Calendar** — grouped by date, flag, impact badges (High/Medium/Low), prev/forecast/actual, countdown, 🔔 notify toggle, currency + impact + search filters. Mock data now; plug a real API in `src/lib/calendar.ts` (`fetchEconomicEvents`).
- **Analytics** — P/L by pair, strategy, session, weekday, timeframe, month + R-distribution.
- **Daily Journal** — calendar with mood, bias, preparation, execution, lessons, screenshots.
- **Position Calculator** — lots from balance, risk %, entry, SL, target R:R.
- **Backtested Trades** — separate log with R stats.
- **Notebook** — folders + tags.
- **Statistics Center** — live vs backtest, costliest mistakes, emotion analysis.
- **Coupons** — claimable perk codes.
- Dark mode (moon button), toasts, confirm dialogs, empty states, responsive mobile → desktop.

## Beginner tips

- Start on **Trading Journal → Add trade**. Leave *Exit* empty while a trade is open.
- Set your starting balance in **My Portfolio → Starting balance** so the equity curve is correct.
- Screenshots are stored locally in your browser. Big images use more space — prefer cropped charts.
- To back up: copy the site data later, or ask your AI tool to add CSV export.

## Tech

React 19 + TypeScript + Tailwind CSS v4 + Vite. No dependencies for charts (custom SVG). Storage: `src/lib/store.ts` (`useLocal` hook). Swap it for IndexedDB/SQLite later without touching pages.
