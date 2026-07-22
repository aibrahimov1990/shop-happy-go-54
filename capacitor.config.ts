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
    // NOTE: the splash image itself (Sellier logo) lives in the iOS project's
    // asset catalog under the "Splash" imageset and must be configured in
    // Xcode. It is NOT part of this repo — this config only controls the
    // splash behaviour (duration, background, spinner).
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: false,
      backgroundColor: '#f7f4ec',
      showSpinner: false,
    },
  },
};

export default config;
