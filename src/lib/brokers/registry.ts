// Provider REGISTRY — UI metadata only. No API shapes, no endpoints,
// no parsing logic. Adding a broker = one entry here + one server adapter.
import type { BrokerId } from './types';

export interface ProviderField {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
  options?: string[];
  help?: string;
}

export interface ProviderMeta {
  id: BrokerId;
  name: string;
  tagline: string;
  docsUrl?: string;
  fields: ProviderField[];
  needsBackendSetup?: string; // shown when the provider needs console/API-app steps
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'oanda',
    name: 'OANDA',
    tagline: 'Official REST API · practice + live',
    docsUrl: 'https://developer.oanda.com/rest-live-v20/introduction/',
    fields: [
      { key: 'label', label: 'Nickname', placeholder: 'e.g. OANDA live' },
      { key: 'environment', label: 'Environment', options: ['practice', 'live'] },
      { key: 'accountId', label: 'Account ID', placeholder: 'e.g. 001-004-1234567-001' },
      {
        key: 'token', label: 'Personal access token', secret: true,
        placeholder: 'Paste from hub.oanda.com → Manage API Access',
        help: 'Token stays encrypted server-side and is never shown again.',
      },
    ],
  },
  {
    id: 'ctrader',
    name: 'cTrader',
    tagline: 'Official OAuth · approve at cTrader, never type a password here',
    docsUrl: 'https://help.ctrader.com/open-api/account-authentication',
    needsBackendSetup: 'You approve access on cTrader’s own site. No passwords or secrets are typed into DadaFX.',
    fields: [
      { key: 'label', label: 'Nickname', placeholder: 'e.g. IC Markets cTrader' },
      { key: 'environment', label: 'Environment', options: ['demo', 'live'] },
      {
        key: 'accountId', label: 'Account ID (only if auto-discovery fails)', placeholder: 'Optional numeric ctid',
        help: 'Leave empty — your accounts are discovered automatically after you approve.',
      },
    ],
  },
  {
    id: 'mt5',
    name: 'MetaTrader 5',
    tagline: 'Official WebRequest bridge (MetaQuotes publish no public API)',
    docsUrl: 'https://www.mql5.com/en/docs/network/webrequest',
    needsBackendSetup: 'MetaTrader 5 has no official public API — install our tiny bridge EA inside YOUR terminal; it pushes closed deals to your journal. Your credentials never leave your PC.',
    fields: [{ key: 'label', label: 'Nickname', placeholder: 'e.g. Exness MT5' }],
  },
  {
    id: 'tradingview',
    name: 'TradingView',
    tagline: 'Webhook · alerts → journal + charts see your trades',
    docsUrl: 'https://www.tradingview.com/support/solutions/43000529348-about-webhooks/',
    needsBackendSetup: 'TradingView has no trade-history API — alerts push your entries/exits via webhook. Token shown once; each alert becomes a journal trade.',
    fields: [{ key: 'label', label: 'Nickname', placeholder: 'e.g. TradingView alerts' }],
  },
  {
    id: 'custom',
    name: 'Custom API',
    tagline: 'Push API · any broker, bot, EA or script',
    needsBackendSetup: 'Any broker with an API works — your bot or script pushes closed deals straight to your journal. The token is shown once and only its hash is stored.',
    fields: [{ key: 'label', label: 'Nickname', placeholder: 'e.g. My gold bot' }],
  },
];

export const providerMeta = (id: BrokerId): ProviderMeta =>
  PROVIDERS.find(p => p.id === id)!;

/** Human chip labels for journal rows (the only provider strings the UI prints). */
export const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual',
  oanda: 'OANDA',
  ctrader: 'cTrader',
  mt5: 'MT5',
  tradingview: 'TradingView',
  custom: 'Custom API',
};
