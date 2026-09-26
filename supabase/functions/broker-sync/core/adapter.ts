// Server-side mirror of src/lib/brokers/types.ts (the canonical contract).
// Deno deploys cannot import from src/ — keep field-for-field identical.
export type BrokerId = 'oanda' | 'ctrader' | 'mt5' | 'custom';

export interface NormalizedAccount {
  externalId: string;
  label: string;
  currency: string;
  balance: number;
  equity?: number;
  marginUsed?: number;
}

export interface NormalizedSummary extends NormalizedAccount {
  openPositions: number;
  pendingOrders: number;
  dayPL?: number;
}

export interface NormalizedPosition {
  externalId: string;
  pair: string;
  direction: 'Buy' | 'Sell';
  lot: number;
  entry: number;
  stopLoss: number | null;
  takeProfit: number | null;
  unrealizedPL: number | null;
  openedAt: string;
}

export interface NormalizedOrder {
  externalId: string;
  pair: string;
  direction: 'Buy' | 'Sell';
  lot: number;
  price: number | null;
  kind: string;
  placedAt: string;
}

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

/** Lifecycle record returned by connect() (no secrets — ever). */
export interface BrokerConnection {
  id: string;
  provider: BrokerId;
  label: string;
  status: 'connected' | 'error' | 'never';
  lastSyncAt: string | null;
  lastError: string | null;
  importedCount: number;
}

export interface BrokerConnectionRow {
  id: string;
  user_id: string;
  provider: BrokerId;
  label: string;
  credentials_enc: { iv: string; ct: string };
  bridge_token_hash: string | null;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  imported_count: number;
  state: Record<string, unknown>;
}

export interface SyncResult {
  imported: number;
  skipped: number;
  errors: string[];
  syncedAt: string;
}

export interface HealthStatus {
  ok: boolean;
  latencyMs: number;
  message: string;
  serverTime?: string;
}

export type BrokerCredentials =
  | { provider: 'oanda'; environment: 'practice' | 'live'; accountId: string; token: string }
  | { provider: 'ctrader'; environment: 'demo' | 'live'; accountId: string; password: string; clientId: string; clientSecret: string }
  | { provider: 'mt5'; bridgeToken: string }
  | { provider: 'custom'; bridgeToken: string };

export interface BrokerAdapter {
  readonly id: BrokerId;
  connect(credentials: BrokerCredentials): Promise<BrokerConnection>;
  disconnect(connectionId: string): Promise<void>;
  getAccounts(connectionId: string): Promise<NormalizedAccount[]>;
  getAccountSummary(connectionId: string, accountExternalId?: string): Promise<NormalizedSummary>;
  getOpenPositions(connectionId: string, accountExternalId?: string): Promise<NormalizedPosition[]>;
  getOrders(connectionId: string, accountExternalId?: string): Promise<NormalizedOrder[]>;
  getTrades(connectionId: string, accountExternalId?: string): Promise<{ positions: NormalizedPosition[]; orders: NormalizedOrder[] }>;
  getTradeHistory(connectionId: string, opts?: { sinceISO?: string; accountExternalId?: string }): Promise<NormalizedFill[]>;
  sync(connectionId: string): Promise<SyncResult>;
  healthCheck(connectionId: string): Promise<HealthStatus>;
}
