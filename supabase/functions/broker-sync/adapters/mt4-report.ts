// MT4/MT5 HTML Report Parser Adapter
// Parses the standard "Save as Report" HTML export from MetaTrader 4/5 desktop terminal
// Works for both MT4 and MT5 reports (they share the same HTML table structure)

import type { BrokerAdapter, BrokerCredentials, NormalizedFill, SyncResult } from '../core/adapter.ts';
import {
  normalizeSymbol, normalizeDirection, normalizeLotAmount, normalizeMoney,
  normalizeCost, normalizeTimestamp, toNormalizedFill
} from '../core/normalize.ts';

export interface ParsedMTReport {
  trades: ParsedTrade[];
  accountInfo: { login?: string; server?: string; currency?: string };
}

export interface ParsedTrade {
  ticket: string;
  symbol: string;
  type: 'buy' | 'sell';
  volume: number;
  openPrice: number;
  closePrice: number | null;
  openTime: string | null; // ISO string
  closeTime: string | null; // ISO string
  profit: number;
  commission: number;
  swap: number;
  magicNumber: number | null;
  comment: string;
}

/**
 * Parse MT4/MT5 HTML report into structured trades
 * Handles both MT4 and MT5 report formats (they use similar table structures)
 */
export function parseMTReport(html: string): ParsedMTReport {
  // Try to parse as HTML document
  let doc: Document;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(html, 'text/html');
  } catch {
    throw new Error('Invalid HTML file');
  }

  // Check if it's an MT report (look for characteristic table structure)
  const tables = doc.querySelectorAll('table');
  if (tables.length === 0) {
    throw new Error('No tables found in HTML — not a valid MT4/MT5 report');
  }

  const trades: ParsedTrade[] = [];
  let accountInfo = { login: undefined as string | undefined, server: undefined, currency: undefined };

  // MT reports typically have multiple tables:
  // - Account summary table (first)
  // - Closed trades table (main)
  // - Open positions table (optional)
  // - Working orders table (optional)

  for (const table of tables) {
    const rows = table.querySelectorAll('tr');
    if (rows.length < 2) continue;

    // Detect header row
    let headerRow: HTMLTableRowElement | null = null;
    let headerIndex = -1;
    let headers: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('th, td');
      const cellTexts = Array.from(cells).map(c => c.textContent?.trim().toLowerCase() || '');

      // Look for trade history headers
      const hasTradeHeaders = cellTexts.some(h =>
        /ticket|order|time|type|size|symbol|price|profit|commission|swap|sl|tp|comment|magic/.test(h)
      );

      if (hasTradeHeaders && cellTexts.length >= 6) {
        headerRow = rows[i] as HTMLTableRowElement;
        headerIndex = i;
        headers = cellTexts.map(h => normalizeHeader(h));
        break;
      }

      // Also check for account info in first few rows
      if (i < 5) {
        extractAccountInfo(cellTexts, accountInfo);
      }
    }

    if (!headerRow) continue;

    // Parse data rows
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td');
      if (cells.length < headers.length) continue;

      const cellTexts = Array.from(cells).map(c => c.textContent?.trim() || '');
      const trade = parseTradeRow(headers, cellTexts);
      if (trade) trades.push(trade);
    }
  }

  if (trades.length === 0) {
    throw new Error('No trades found in report. Ensure you exported "Account History" as HTML with all columns visible.');
  }

  return { trades, accountInfo };
}

function normalizeHeader(h: string): string {
  return h
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function extractAccountInfo(cells: string[], info: { login?: string; server?: string; currency?: string }) {
  const text = cells.join(' ').toLowerCase();
  // Look for login/account number
  const loginMatch = text.match(/(?:login|account|id)[:\s]+(\d{6,12})/i);
  if (loginMatch && !info.login) info.login = loginMatch[1];

  // Look for server
  const serverMatch = text.match(/(?:server)[:\s]+(\S+)/i);
  if (serverMatch && !info.server) info.server = serverMatch[1];

  // Look for currency
  const currencyMatch = text.match(/(?:currency|deposit)[:\s]+([A-Z]{3})/i);
  if (currencyMatch && !info.currency) info.currency = currencyMatch[1];
}

function parseTradeRow(headers: string[], cells: string[]): ParsedTrade | null {
  const row: Record<string, string> = {};
  headers.forEach((h, i) => { row[h] = cells[i] || ''; });

  // Skip summary/total rows
  const firstCell = (cells[0] || '').toLowerCase();
  if (firstCell.includes('total') || firstCell.includes('balance') || firstCell.includes('equity') ||
      firstCell.includes('closed pl') || firstCell.includes('floating') || firstCell.includes('margin')) {
    return null;
  }

  // Extract ticket (required)
  const ticket = row.ticket || row.order || row['#'] || row.id || '';
  if (!ticket || isNaN(Number(ticket))) return null;

  // Extract symbol
  const symbol = row.symbol || row.instrument || row.pair || row.market || '';
  if (!symbol) return null;

  // Extract type (buy/sell)
  const typeStr = (row.type || row.cmd || row.side || row.direction || '').toLowerCase();
  const type = typeStr.includes('buy') || typeStr === '0' || typeStr === 'long' ? 'buy' : 'sell';

  // Extract volume/lots
  const volume = parseFloat(row.size || row.volume || row.lots || row.amount || '0');
  if (volume <= 0) return null;

  // Extract prices
  const openPrice = parseFloat(row.open_price || row.price || row.open || row.entry_price || '0');
  const closePriceStr = row.close_price || row.close || row.exit_price || '';
  const closePrice = closePriceStr ? parseFloat(closePriceStr) : null;

  if (openPrice <= 0) return null;

  // Extract times
  const openTime = parseMTDate(row.open_time || row.time || row.open_date || row.date || '');
  const closeTime = row.close_time || row.close_date || row.exit_time || row.time_out
    ? parseMTDate(row.close_time || row.close_date || row.exit_time || row.time_out || '')
    : null;

  // Extract P&L
  const profit = parseFloat(row.profit || row.pnl || row['closed_pl'] || '0');
  const commission = parseFloat(row.commission || row.comm || '0');
  const swap = parseFloat(row.swap || row.swaps || '0');

  // Extract magic number
  const magicNumber = row.magic || row.magic_number || row.expert_id ? parseInt(row.magic || row.magic_number || row.expert_id) : null;

  // Extract comment
  const comment = row.comment || row.notes || row.description || '';

  return {
    ticket: ticket.toString(),
    symbol: symbol.replace(/[^a-zA-Z0-9\/\.\-_]/g, ''), // Clean symbol
    type,
    volume,
    openPrice,
    closePrice,
    openTime,
    closeTime,
    profit,
    commission,
    swap,
    magicNumber,
    comment,
  };
}

function parseMTDate(dateStr: string): string | null {
  if (!dateStr || dateStr === '-' || dateStr === '--') return null;

  // MT4/MT5 date formats:
  // "2024.01.15 14:30:00" (MT4/MT5 standard)
  // "15.01.2024 14:30:00" (European)
  // "2024-01-15 14:30:00" (ISO-like)
  // "01/15/2024 14:30:00" (US)

  let normalized = dateStr.trim();

  // Handle "2024.01.15 14:30:00" format (most common)
  if (/^\d{4}\.\d{2}\.\d{2}/.test(normalized)) {
    normalized = normalized.replace(/\./g, '-');
  }
  // Handle "15.01.2024 14:30:00" format
  else if (/^\d{2}\.\d{2}\.\d{4}/.test(normalized)) {
    const parts = normalized.split(' ');
    const datePart = parts[0].split('.');
    normalized = `${datePart[2]}-${datePart[1]}-${datePart[0]}${parts[1] ? ' ' + parts[1] : ''}`;
  }
  // Handle "01/15/2024 14:30:00" format
  else if (/^\d{2}\/\d{2}\/\d{4}/.test(normalized)) {
    const parts = normalized.split(' ');
    const datePart = parts[0].split('/');
    normalized = `${datePart[2]}-${datePart[0]}-${datePart[1]}${parts[1] ? ' ' + parts[1] : ''}`;
  }

  const date = new Date(normalized);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Convert parsed trades to NormalizedFill format for journal import
 */
export function normalizeMTReportTrades(trades: ParsedTrade[], tag = 'MT4/MT5 HTML import'): NormalizedFill[] {
  const fills: NormalizedFill[] = [];

  for (const t of trades) {
    try {
      if (!t.openTime) continue;
      if (t.openPrice <= 0) continue;

      const dir = t.type === 'buy' ? 'Buy' : 'Sell';
      const entry = t.openPrice;
      const exit = t.closePrice ?? t.openPrice; // If no close price, use open (shouldn't happen for closed trades)

      fills.push(toNormalizedFill({
        externalId: `mt-report:${t.ticket}`,
        pair: normalizeSymbol(t.symbol),
        direction: normalizeDirection(dir),
        lot: normalizeLotAmount(t.volume),
        entry,
        exit,
        stopLoss: null, // Not in HTML report
        takeProfit: null, // Not in HTML report
        openedAt: t.openTime,
        closedAt: t.closeTime || t.openTime,
        grossPL: normalizeMoney(t.profit),
        commission: normalizeCost(t.commission, t.swap),
        strategy: tag,
        raw: { ticket: t.ticket, symbol: t.symbol, magic: t.magicNumber, comment: t.comment },
      }));
    } catch {
      // Skip bad trades
    }
  }

  return fills.sort((a, b) => a.closedAt.localeCompare(b.closedAt));
}

/**
 * MT4/MT5 Report Adapter - File Upload Only (no live sync)
 */
export class MTReportAdapter implements BrokerAdapter {
  readonly id = 'mt-report' as const;

  async connect(_c: BrokerCredentials): Promise<{ status: 'file-upload'; message: string }> {
    return { status: 'file-upload', message: 'Upload HTML report from MT4/MT5 terminal' };
  }

  async disconnect(_id: string): Promise<void> {
    // No persistent connection
  }

  async getAccounts(_id: string): Promise<any[]> {
    return []; // No live accounts
  }

  async getAccountSummary(_id: string): Promise<any> {
    return { externalId: 'mt-report', label: 'MT4/MT5 File Upload', currency: 'USD', balance: 0, openPositions: 0, pendingOrders: 0 };
  }

  async getOpenPositions(_id: string): Promise<any[]> {
    return [];
  }

  async getOrders(_id: string): Promise<any[]> {
    return [];
  }

  async getTrades(_id: string) {
    return { positions: [], orders: [] };
  }

  async getTradeHistory(_id: string): Promise<NormalizedFill[]> {
    return []; // No live history pull
  }

  async sync(_id: string): Promise<SyncResult> {
    throw new Error('MT Report adapter is file-upload only. Use parseAndImport action.');
  }

  async healthCheck(_id: string): Promise<any> {
    return { ok: true, latencyMs: 0, message: 'Ready for HTML report upload' };
  }
}