// READ-ONLY guarantee — the fintech rule, enforced by test, not by promise.
// If anyone adds place/modify/close/withdraw/deposit methods to an adapter,
// or execution routes to the function, this test FAILS the build pipeline.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { OandaAdapter } from '../adapters/oanda.ts';
import { CTraderAdapter } from '../adapters/ctrader.ts';
import { Mt5Adapter } from '../adapters/mt5.ts';

const CONTRACT = [
  'connect', 'disconnect', 'getAccounts', 'getAccountSummary', 'getOpenPositions',
  'getOrders', 'getTrades', 'getTradeHistory', 'sync', 'healthCheck',
];

// Read methods (getOrders, getOpenPositions…) must NOT match — only verbs
// that move money or change state do.
const FORBIDDEN = /(place\w*order|execute\w*|close\w*(position|trade|order)|modify\w*order|withdraw|deposit|transfer\w*fund|send\w*order|OrderSend|PositionClose)/i;

Deno.test('adapters expose exactly the read-only contract — nothing more', () => {
  const instances = [
    new OandaAdapter({ environment: 'practice', accountId: 'x', token: 'x' }),
    new CTraderAdapter({ environment: 'demo', accessToken: 'x' }, 'id', 'secret'),
    new Mt5Adapter(),
  ];
  for (const a of instances) {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(a))
      .filter(m => m !== 'constructor')
      .sort();
    assertEquals(methods, [...CONTRACT].sort(), `${a.id} exposes non-contract methods`);
    for (const m of methods) assert(!FORBIDDEN.test(m), `${a.id}.${m} looks executable`);
  }
});

Deno.test('no adapter source contains execution primitives', async () => {
  // Static self-check: the three adapter files must not reference trading actions.
  const files = ['../adapters/oanda.ts', '../adapters/ctrader.ts', '../adapters/mt5.ts'];
  const banned = [
    'ProtoOAOrderSend', 'ProtoOAPositionClose', 'orderCreate', '/orders',
    'OrderSend', 'PositionClose', 'OrderModify', 'withdraw', 'transferFunds',
    'marketOrder', 'limitOrder', 'stopOrder',
  ];
  for (const f of files) {
    const src = await Deno.readTextFile(new URL(f, import.meta.url));
    const code = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    for (const b of banned) {
      assert(!code.includes(b), `${f} contains forbidden primitive: ${b}`);
    }
  }
});
