// ============================================================================
// DadaFX Broker Abstraction — the ONLY broker contract the app may touch.
//
//   Provider API → Provider Adapter → Normalizer → DadaFX internal model
//                         → Database → Dashboard
//
// RULE: no component, page, or lib outside src/lib/brokers/ and the
// server function may import provider-specific shapes (cTrader protobuf,
// OANDA transaction objects, MT5 deal structs). Everything flows through
// the normalized models below.
// ============================================================================

export type BrokerId = 'oanda' | 'ctrader' | 'mt5' | 'custom' | 'tradingview' | 'mt-report';

export type BrokerSource = 'manual' | BrokerId;

/** Normalized trading account — same shape for every provider. */
export interface NormalizedAccount {
  externalId: string; // provider-side account id
  label: string; // display name
  currency: string; // account currency code
  balance: number;
  equity?: number;
  marginUsed?: number;
}

/** One-line account health — same shape for every provider. */
export interface NormalizedSummary extends NormalizedAccount {
  openPositions: number;
  pendingOrders: number;
  dayPL?: number;
}

/** Normalized open position. Unrealized P/L in account currency. */
export interface NormalizedPosition {
  externalId: string;
  pair: string; // DadaFX pair format, e.g. "EUR/USD", "XAU/USD"
  direction: 'Buy' | 'Sell';
  lot: number;
  entry: number;
  stopLoss: number | null;
  takeProfit: number | null;
  unrealizedPL: number | null;
  openedAt: string; // ISO datetime
}

/** Normalized pending order. */
export interface NormalizedOrder {
  externalId: string;
  pair: string;
  direction: 'Buy' | 'Sell';
  lot: number;
  price: number | null; // null = market/stop-market without fixed price
  kind: string; // provider-agnostic label, e.g. "Limit", "Stop", "Market"
  placedAt: string; // ISO datetime
}

/** Normalized CLOSED trade fill — the journal's raw material. */
export interface NormalizedFill {
  externalId: string;
  pair: string;
  direction: 'Buy' | 'Sell';
  lot: number;
  entry: number;
  exit: number;
  stopLoss: number;
  takeProfit: number;
  openedAt: string;
  closedAt: string;
  grossPL: number;
  commission: number;
  strategy?: string;
  session?: string;
  /** Original provider object — provenance kept in broker_trades.raw_metadata. */
  raw?: unknown;
}

/** Connection lifecycle state (no secrets — those never leave the vault). */
export interface BrokerConnection {
  id: string;
  provider: BrokerId;
  label: string;
  status: 'connected' | 'error' | 'never';
  lastSyncAt: string | null;
  lastError: string | null;
  importedCount: number;
}

/** Result of one sync run. */
export interface SyncResult {
  imported: number;
  skipped: number; // duplicates / unparseable legs
  errors: string[];
  syncedAt: string;
}

/** Liveness probe result. */
export interface HealthStatus {
  ok: boolean;
  latencyMs: number;
  message: string;
  serverTime?: string;
}

/** Opaque credential bags — SHAPED PER PROVIDER, only ever handled server-side.
 *  The browser collects the fields (see registry) and posts them once over TLS;
 *  the edge function encrypts them into the vault. They are never read back. */
export type BrokerCredentials =
  | { provider: 'oanda'; environment: 'practice' | 'live'; accountId: string; token: string }
  // cTrader is OAuth-only: users NEVER type passwords or app secrets.
  // The browser only sends { environment, label, accountId? }; tokens are
  // minted server-side via the Spotware consent page + callback exchange.
  | { provider: 'ctrader'; environment: 'demo' | 'live'; label?: string; accountId?: string }
  | { provider: 'mt5'; bridgeToken: string }
  | { provider: 'custom'; bridgeToken: string }
  // mt-report is file-upload only — no credentials, just a label
  | { provider: 'mt-report'; label?: string };

/**
 * THE contract. Every provider adapter implements this — server-side.
 * The frontend only knows this interface plus the normalized models above.
 * v1 is READ-ONLY: execution methods are intentionally absent. Any future
 * order placement MUST arrive as a new explicit interface (e.g.
 * ExecutingBrokerAdapter), never by extending this one silently.
 */
export interface BrokerAdapter {
  readonly id: BrokerId;

  /** Validate + persist credentials. Returns a live connection record. */
  connect(credentials: BrokerCredentials): Promise<BrokerConnection>;

  /** Remove stored credentials and stop syncing. */
  disconnect(connectionId: string): Promise<void>;

  /** List trading accounts visible to these credentials. */
  getAccounts(connectionId: string): Promise<NormalizedAccount[]>;

  /** One-line health + balance snapshot for an account. */
  getAccountSummary(connectionId: string, accountExternalId?: string): Promise<NormalizedSummary>;

  /** Currently open positions. */
  getOpenPositions(connectionId: string, accountExternalId?: string): Promise<NormalizedPosition[]>;

  /** Currently pending orders. */
  getOrders(connectionId: string, accountExternalId?: string): Promise<NormalizedOrder[]>;

  /** Open positions AND pending orders in one round trip. */
  getTrades(connectionId: string, accountExternalId?: string): Promise<{ positions: NormalizedPosition[]; orders: NormalizedOrder[] }>;

  /** Closed fills since `sinceISO` (or provider default window). */
  getTradeHistory(connectionId: string, opts?: { sinceISO?: string; accountExternalId?: string }): Promise<NormalizedFill[]>;

  /** Full pipeline: history → normalize → dedup → journal. */
  sync(connectionId: string): Promise<SyncResult>;

  /** Liveness probe (auth + latency, no data transfer). */
  healthCheck(connectionId: string): Promise<HealthStatus>;
}
