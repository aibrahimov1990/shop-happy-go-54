import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.e2ab19902f2e4313b0436c2ed5b688d0',
  appName: 'Sellier',
  webDir: 'dist',
  server: {
    // Live-reload from the Lovable preview so UI tweaks appear instantly in the iOS app.
    // After you're done iterating, remove the `url` line and run `bun run build && npx cap sync`
    // to ship a self-contained bundle inside the app.
    url: 'https://id-preview--e2ab1990-2f2e-4313-b043-6c2ed5b688d0.lovable.app?forceHideBadge=true',
    cleartext: true,
  },
};

export default config;
