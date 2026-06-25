import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sellierknightsbridge.app',
  appName: 'Sellier',
  webDir: 'dist',
  server: {
    url: 'https://shop-happy-go-54.lovable.app?forceHideBadge=true',
    cleartext: false,
    allowNavigation: ['shop-happy-go-54.lovable.app', 'oauth.lovable.app'],
  },
  plugins: {
    FirebaseMessaging: {
      presentationOptions: ['alert', 'badge', 'sound'],
    },
  },
};

export default config;
