// Bridges Supabase auth session into Capacitor Preferences on native platforms.
// WKWebView localStorage can be unavailable/empty during cold start, so we keep
// a second native copy and restore it before protected pages check auth.

import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY_PREFIX = "sb-";
const STORAGE_KEY_SUFFIX = "-auth-token";
const PREFS_STORAGE_KEY = "sellier.supabase.auth.storage";
const LEGACY_PREFS_KEY = "supabase.auth.token";

type MirroredAuthStorage = {
  storageKey: string;
  storageValue: string;
};

type MirroredSession = {
  access_token: string;
  refresh_token: string;
};

let initPromise: Promise<void> | null = null;

function isNative(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

function getDefaultAuthStorageKey(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) return null;

  try {
    const host = new URL(url).hostname;
    const projectRef = host.split(".")[0];
    return projectRef ? `${STORAGE_KEY_PREFIX}${projectRef}${STORAGE_KEY_SUFFIX}` : null;
  } catch {
    return null;
  }
}

function findAuthStorageKey(): string | null {
  if (typeof localStorage === "undefined") return null;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_KEY_PREFIX) && key.endsWith(STORAGE_KEY_SUFFIX)) {
      return key;
    }
  }

  return getDefaultAuthStorageKey();
}

function readCurrentAuthStorage(): MirroredAuthStorage | null {
  const storageKey = findAuthStorageKey();
  if (!storageKey) return null;

  const storageValue = localStorage.getItem(storageKey);
  if (!storageValue) return null;

  return { storageKey, storageValue };
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function initNativeSessionPersistence() {
  if (!isNative()) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const { Preferences } = await import("@capacitor/preferences");

      // 1. On launch: restore the exact Supabase localStorage entry before
      // any auth guard calls getSession(). This avoids a false signed-out state.
      const currentStorage = readCurrentAuthStorage();
      if (!currentStorage) {
        const { value } = await Preferences.get({ key: PREFS_STORAGE_KEY });
        const mirrored = safeJsonParse<MirroredAuthStorage>(value);
        if (mirrored?.storageKey && mirrored?.storageValue) {
          localStorage.setItem(mirrored.storageKey, mirrored.storageValue);
        } else {
          // Backwards-compatible restore for users who installed the previous build.
          const legacy = await Preferences.get({ key: LEGACY_PREFS_KEY });
          const parsed = safeJsonParse<Partial<MirroredSession>>(legacy.value);
          if (parsed?.access_token && parsed?.refresh_token) {
            await supabase.auth.setSession({
              access_token: parsed.access_token,
              refresh_token: parsed.refresh_token,
            });
          }
        }
      }

      const mirrorCurrentSession = async (session?: MirroredSession | null) => {
        const authStorage = readCurrentAuthStorage();
        if (authStorage) {
          await Preferences.set({
            key: PREFS_STORAGE_KEY,
            value: JSON.stringify(authStorage),
          });
        }

        if (session?.access_token && session.refresh_token) {
          await Preferences.set({
            key: LEGACY_PREFS_KEY,
            value: JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            }),
          });
        }
      };

      // Make sure a valid restored/refreshable session is written in the new format.
      const { data } = await supabase.auth.getSession();
      if (data.session) await mirrorCurrentSession(data.session);

      // 2. Mirror future auth changes into Preferences. Do not delete the native
      // copy on INITIAL_SESSION null; only an explicit sign-out should clear it.
      supabase.auth.onAuthStateChange(async (event, session) => {
        try {
          if (session) {
            await mirrorCurrentSession(session);
            return;
          }

          if (event === "SIGNED_OUT") {
            await Preferences.remove({ key: PREFS_STORAGE_KEY });
            await Preferences.remove({ key: LEGACY_PREFS_KEY });
          }
        } catch (err) {
          console.warn("Failed to mirror session to Preferences", err);
        }
      });
    } catch (err) {
      console.warn("Native session persistence init failed", err);
    }
  })();

  return initPromise;
}
