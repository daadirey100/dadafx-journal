export const TV_SYMBOLS: Record<string, string> = {
  'EUR/USD': 'FX:EURUSD', 'GBP/USD': 'FX:GBPUSD', 'USD/JPY': 'FX:USDJPY',
  'USD/CHF': 'FX:USDCHF', 'AUD/USD': 'FX:AUDUSD', 'USD/CAD': 'FX:USDCAD',
  'NZD/USD': 'FX:NZDUSD', 'EUR/GBP': 'FX:EURGBP', 'EUR/JPY': 'FX:EURJPY',
  'GBP/JPY': 'FX:GBPJPY', 'XAU/USD': 'OANDA:XAUUSD', 'BTC/USD': 'BITSTAMP:BTCUSD',
  'US30': 'DJ:DJI', 'NAS100': 'NASDAQ:NDX',
};

export const tvSymbol = (pair: string) => TV_SYMBOLS[pair] ?? `FX:${pair.replace('/', '').toUpperCase()}`;
