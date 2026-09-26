// Fill → DadaFX Trade mapping + journal_store merge.
// The journal owns trades after import (editable, rated, screenshotted).
// Dedup key: Trade.externalId — stable across syncs AND devices.
import type { NormalizedFill } from '../core/adapter.ts';

const PROVIDER_LABEL: Record<string, string> = { oanda: 'OANDA', ctrader: 'cTrader', mt5: 'MT5', custom: 'Custom API' };

function sessionFor(iso: string): string {
  const h = new Date(iso).getUTCHours();
  if (h >= 7 && h < 12) return 'London';
  if (h >= 12 && h < 21) return 'New York';
  return 'Asian';
}

export function fillToTrade(provider: string, f: NormalizedFill): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    date: f.openedAt.slice(0, 16),
    exitAt: f.closedAt.slice(0, 16),
    pair: f.pair,
    direction: f.direction,
    lot: f.lot,
    entry: f.entry,
    stopLoss: f.stopLoss,
    takeProfit: f.takeProfit,
    exit: f.exit,
    riskPct: 0,
    commission: Math.max(0, f.commission),
    strategy: f.strategy ?? `${PROVIDER_LABEL[provider] ?? provider} import`,
    session: f.session ?? sessionFor(f.openedAt),
    timeframe: 'H1',
    setup: '',
    emotions: '',
    mistakes: '',
    notes: `Auto-imported (read-only) from ${PROVIDER_LABEL[provider] ?? provider}.`,
    rating: 3,
    source: provider,
    externalId: f.externalId,
  };
}

const cents = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

/**
 * Pure dedup gate — the idempotency heart. Existing external IDs (the
 * composite provider+account+trade identity lives in `externalId`) pass
 * through untouched, no matter how many times a sync runs.
 * Unit-tested: 100 new → 100 imported; repeat → 0 imported; +2 new → 2.
 */
export function dedupeFills(
  existingIds: Set<string>,
  fills: NormalizedFill[],
): { fresh: NormalizedFill[]; skipped: number } {
  const fresh: NormalizedFill[] = [];
  let skipped = 0;
  const seen = new Set(existingIds);
  for (const f of fills) {
    if (!f.externalId || seen.has(f.externalId)) { skipped++; continue; }
    seen.add(f.externalId);
    fresh.push(f);
  }
  return { fresh, skipped };
}

export async function mergeFills(
  admin: any,
  userId: string,
  connectionId: string,
  provider: string,
  fills: NormalizedFill[],
  brokerAccountId: string | null = null,
): Promise<{ imported: number; skipped: number }> {
  // Ownership guard: the connection MUST belong to this user, or nothing merges.
  const { data: owned } = await admin
    .from('broker_connections')
    .select('id')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!owned) throw new Error('Connection not found.');

  const { data: row } = await admin
    .from('journal_store')
    .select('data')
    .eq('user_id', userId)
    .eq('key', 'dadafx.trades')
    .maybeSingle();

  const trades: Record<string, unknown>[] = Array.isArray(row?.data) ? row.data : [];
  const have = new Set<string>(trades.map(t => t.externalId).filter(Boolean) as string[]);
  const { fresh, skipped: dupes } = dedupeFills(have, fills);
  let imported = 0;
  const skipped = dupes;
  const ledger: Record<string, unknown>[] = [];
  for (const f of fresh) {
    const t = fillToTrade(provider, f) as Record<string, unknown>;
    t.brokerConnectionId = connectionId;
    if (brokerAccountId) t.brokerAccountId = brokerAccountId;
    trades.unshift(t);
    imported++;
    // Exact numeric ledger row beside the JSON journal (dedup is unique-guarded).
    ledger.push({
      user_id: userId,
      connection_id: connectionId,
      broker_account_id: brokerAccountId,
      provider,
      external_trade_id: String(f.externalId).split(':').slice(1).join(':') || f.externalId,
      symbol: f.pair,
      side: f.direction,
      quantity: f.lot,
      entry_price: f.entry,
      exit_price: f.exit,
      stop_loss: f.stopLoss,
      take_profit: f.takeProfit,
      gross_profit: cents(f.grossPL),
      commission: cents(Math.max(0, f.commission)),
      swap: 0,
      net_profit: cents(f.grossPL - Math.max(0, f.commission)),
      opened_at: f.openedAt,
      closed_at: f.closedAt,
      status: 'closed',
      source: 'broker',
      raw_metadata: { direction: f.direction, fill: (f as any).raw ?? null },
    });
  }
  if (ledger.length) {
    // Cap raw provenance at 20 KB per row — the fill itself is never cut.
    for (const row of ledger) {
      try {
        const raw = row.raw_metadata as Record<string, unknown>;
        if (JSON.stringify(raw?.fill ?? null).length > 20000) {
          row.raw_metadata = { ...(raw ?? {}), fill: '[withheld: oversized]' };
        }
      } catch { /* ignore */ }
    }
    await admin.from('broker_trades').upsert(ledger, {
      onConflict: 'user_id,provider,external_trade_id',
      ignoreDuplicates: true,
    });
  }

  const now = new Date().toISOString();
  await admin.from('journal_store').upsert(
    { user_id: userId, key: 'dadafx.trades', data: trades, updated_at: now },
    { onConflict: 'user_id,key' },
  );
  await admin.from('broker_connections').update({
    last_sync_at: now,
    last_successful_sync_at: now,
    status: 'connected',
    last_error: null,
    imported_count: (await currentCount(admin, connectionId)) + imported,
  }).eq('id', connectionId).eq('user_id', userId);
  return { imported, skipped };
}

async function currentCount(admin: any, connectionId: string): Promise<number> {
  const { data } = await admin.from('broker_connections').select('imported_count').eq('id', connectionId).maybeSingle();
  return data?.imported_count ?? 0;
}

export async function markError(admin: any, connectionId: string, message: string, userId?: string) {
  // Stored messages are user-safe: scrub anything shaped like a secret first.
  const safe = String(message)
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/=]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}/g, '[redacted]')
    .replace(/[0-9a-f]{64}/gi, '[redacted]')
    .slice(0, 300);
  let q = admin.from('broker_connections').update({
    status: 'error',
    last_error: safe,
  }).eq('id', connectionId);
  if (userId) q = q.eq('user_id', userId);
  await q;
}
