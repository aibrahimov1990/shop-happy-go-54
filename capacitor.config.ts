import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sellierknightsbridge.app',
  appName: 'Sellier',
  webDir: 'dist',
  server: {
    url: 'https://shop-happy-go-54.lovable.app?forceHideBadge=true',
    cleartext: false,
  },
};

export default config;
