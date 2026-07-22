import { Capacitor } from "@capacitor/core";

const LAUNCH_TIME = Date.now();
const MIN_SPLASH_MS = 2000;
const SAFETY_MAX_MS = 8000;

let hidden = false;

async function hideNow() {
  if (hidden) return;
  hidden = true;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    // Plugin missing (older native shells) or web build — safe to ignore.
  }
}

/**
 * Hide the native splash screen once the app has mounted, but keep it
 * visible for at least MIN_SPLASH_MS from launch so the branded logo
 * always shows. A safety timeout guarantees the splash is dismissed
 * even if something throws before hideWhenReady() is called.
 */
export function hideNativeSplashWhenReady() {
  if (!Capacitor.isNativePlatform()) return;

  // Safety net — never leave the user stuck on the splash.
  setTimeout(() => {
    void hideNow();
  }, SAFETY_MAX_MS);

  const elapsed = Date.now() - LAUNCH_TIME;
  const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
  setTimeout(() => {
    void hideNow();
  }, wait);
}
