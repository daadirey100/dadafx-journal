import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dadafx.journal',
  appName: 'DadaFX Journal',
  webDir: 'dist',
  backgroundColor: '#0f172a',
  ios: {
    contentInset: 'always',
    scrollEnabled: true,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
