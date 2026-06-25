import { Capacitor } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";
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
let storageMirrorInstalled = false;

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

function isAuthStorageKey(key: string | null | undefined): key is string {
  return !!key && key.startsWith(STORAGE_KEY_PREFIX) && key.endsWith(STORAGE_KEY_SUFFIX);
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function getSessionTokensFromStorageValue(storageValue: string | null): MirroredSession | null {
  const parsed = safeJsonParse<Partial<MirroredSession>>(storageValue);
  if (!parsed?.access_token || !parsed.refresh_token) return null;

  return {
    access_token: parsed.access_token,
    refresh_token: parsed.refresh_token,
  };
}

async function writeNativeSessionCopy(
  Preferences: typeof import("@capacitor/preferences").Preferences,
  authStorage?: MirroredAuthStorage | null,
  session?: MirroredSession | null,
) {
  const currentAuthStorage = authStorage ?? readCurrentAuthStorage();
  const currentSession = session ?? getSessionTokensFromStorageValue(currentAuthStorage?.storageValue ?? null);

  if (currentAuthStorage) {
    await Preferences.set({
      key: PREFS_STORAGE_KEY,
      value: JSON.stringify(currentAuthStorage),
    });
  } else if (currentSession) {
    const storageKey = getDefaultAuthStorageKey();
    if (storageKey) {
      await Preferences.set({
        key: PREFS_STORAGE_KEY,
        value: JSON.stringify({
          storageKey,
          storageValue: JSON.stringify(currentSession),
        }),
      });
    }
  }

  if (currentSession?.access_token && currentSession.refresh_token) {
    await Preferences.set({
      key: LEGACY_PREFS_KEY,
      value: JSON.stringify(currentSession),
    });
  }
}

async function restoreSessionIntoSupabase(storageValue: string | null) {
  const tokens = getSessionTokensFromStorageValue(storageValue);
  if (!tokens) return;

  const { error } = await supabase.auth.setSession(tokens);
  if (error) console.warn("Native session restore failed", error);
}

function installLocalStorageMirror(Preferences: typeof import("@capacitor/preferences").Preferences) {
  if (storageMirrorInstalled || typeof window === "undefined" || typeof localStorage === "undefined") return;
  storageMirrorInstalled = true;

  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const originalClear = Storage.prototype.clear;

  Storage.prototype.setItem = function setItem(key: string, value: string) {
    originalSetItem.call(this, key, value);

    if (this === window.localStorage && isAuthStorageKey(key)) {
      void writeNativeSessionCopy(Preferences, { storageKey: key, storageValue: value }).catch((err) => {
        console.warn("Failed to mirror auth storage", err);
      });
    }
  };

  Storage.prototype.removeItem = function removeItem(key: string) {
    originalRemoveItem.call(this, key);

    if (this === window.localStorage && isAuthStorageKey(key)) {
      void Preferences.remove({ key: PREFS_STORAGE_KEY });
      void Preferences.remove({ key: LEGACY_PREFS_KEY });
    }
  };

  Storage.prototype.clear = function clear() {
    originalClear.call(this);

    if (this === window.localStorage) {
      void Preferences.remove({ key: PREFS_STORAGE_KEY });
      void Preferences.remove({ key: LEGACY_PREFS_KEY });
    }
  };
}

export async function persistNativeSession(session?: Session | MirroredSession | null) {
  if (!isNative()) return;

  try {
    const { Preferences } = await import("@capacitor/preferences");
    await writeNativeSessionCopy(Preferences, readCurrentAuthStorage(), session ?? null);
  } catch (err) {
    console.warn("Failed to persist native session", err);
  }
}

export async function clearNativeSessionPersistence() {
  if (!isNative()) return;

  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key: PREFS_STORAGE_KEY });
    await Preferences.remove({ key: LEGACY_PREFS_KEY });
  } catch (err) {
    console.warn("Failed to clear native session", err);
  }
}

export async function initNativeSessionPersistence() {
  if (!isNative()) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      installLocalStorageMirror(Preferences);

      // 1. On launch: restore the exact Supabase localStorage entry before
      // any auth guard calls getSession(). This avoids a false signed-out state.
      const currentStorage = readCurrentAuthStorage();
      if (!currentStorage) {
        const { value } = await Preferences.get({ key: PREFS_STORAGE_KEY });
        const mirrored = safeJsonParse<MirroredAuthStorage>(value);
        if (mirrored?.storageKey && mirrored?.storageValue) {
          localStorage.setItem(mirrored.storageKey, mirrored.storageValue);
          await restoreSessionIntoSupabase(mirrored.storageValue);
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
      } else {
        await restoreSessionIntoSupabase(currentStorage.storageValue);
      }

      // Make sure a valid restored/refreshable session is written in the new format.
      const { data } = await supabase.auth.getSession();
      if (data.session) await writeNativeSessionCopy(Preferences, readCurrentAuthStorage(), data.session);

      // 2. Mirror future auth changes into Preferences. Do not delete the native
      // copy on INITIAL_SESSION null; only an explicit sign-out should clear it.
      supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
          void writeNativeSessionCopy(Preferences, readCurrentAuthStorage(), session).catch((err) => {
            console.warn("Failed to mirror session to Preferences", err);
          });
          return;
        }

        if (event === "SIGNED_OUT") {
          void Preferences.remove({ key: PREFS_STORAGE_KEY });
          void Preferences.remove({ key: LEGACY_PREFS_KEY });
        }
      });

      const persistCurrentSession = () => {
        void writeNativeSessionCopy(Preferences, readCurrentAuthStorage()).catch((err) => {
          console.warn("Failed to persist auth storage", err);
        });
      };

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") persistCurrentSession();
      });
      window.addEventListener("pagehide", persistCurrentSession);
    } catch (err) {
      console.warn("Native session persistence init failed", err);
    }
  })();

  return initPromise;
}
