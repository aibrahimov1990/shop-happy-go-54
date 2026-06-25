// Bridges Supabase auth session into Capacitor Preferences on native platforms.
// WKWebView localStorage is occasionally purged by iOS (low storage, data eviction),
// which signs the user out on cold-launch. Preferences are backed by the iOS
// Keychain/UserDefaults and persist reliably across launches.

import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY_PREFIX = "sb-";
const PREFS_KEY = "supabase.auth.token";

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

function findAuthStorageKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_KEY_PREFIX) && key.endsWith("-auth-token")) {
      return key;
    }
  }
  return null;
}

export async function initNativeSessionPersistence() {
  if (!isNative()) return;

  try {
    const { Preferences } = await import("@capacitor/preferences");

    // 1. On launch: if localStorage is empty but Preferences has a session, restore it.
    const existingKey = findAuthStorageKey();
    if (!existingKey || !localStorage.getItem(existingKey)) {
      const { value } = await Preferences.get({ key: PREFS_KEY });
      if (value) {
        try {
          const parsed = JSON.parse(value);
          if (parsed?.access_token && parsed?.refresh_token) {
            await supabase.auth.setSession({
              access_token: parsed.access_token,
              refresh_token: parsed.refresh_token,
            });
          }
        } catch {
          /* corrupt — ignore */
        }
      }
    }

    // 2. Mirror future auth changes into Preferences.
    supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        if (session) {
          await Preferences.set({
            key: PREFS_KEY,
            value: JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            }),
          });
        } else {
          await Preferences.remove({ key: PREFS_KEY });
        }
      } catch (err) {
        console.warn("Failed to mirror session to Preferences", err);
      }
    });
  } catch (err) {
    console.warn("Native session persistence init failed", err);
  }
}
