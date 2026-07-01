// Client-only: registers the native device with FCM and stores its token.
// Safe to import everywhere — it no-ops outside a Capacitor native runtime.

import { registerDeviceToken } from "./push.functions";
import { BROADCAST_TOPIC } from "./push-constants";
import { supabase } from "@/integrations/supabase/client";

let listenersInitialized = false;
let registrationInFlight = false;
let lastRegisteredToken: string | null = null;
let currentFcmToken: string | null = null;
let currentPlatform: "ios" | "android" = "ios";
let retryTimer: number | null = null;

type PushData = Record<string, unknown> | string | null | undefined;

function getNativeRuntime() {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } })
    .Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap;
}

function extractUrl(data: PushData): string | null {
  if (!data) return null;

  if (typeof data === "string") {
    try {
      return extractUrl(JSON.parse(data) as PushData);
    } catch {
      return null;
    }
  }

  const url = data.url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

async function registerTokenWithBackend(token: string, platform: "ios" | "android") {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    // No signed-in user yet — defer registration until SIGNED_IN fires.
    return false;
  }

  await registerDeviceToken({ data: { token, platform } });
  lastRegisteredToken = token;
  return true;
}

async function fetchAndRegisterToken(FirebaseMessaging: typeof import("@capacitor-firebase/messaging").FirebaseMessaging) {
  const { token } = await FirebaseMessaging.getToken();
  currentFcmToken = token;
  if (token && token !== lastRegisteredToken) {
    await registerTokenWithBackend(token, currentPlatform);
  }
}

function scheduleTokenRetry(FirebaseMessaging: typeof import("@capacitor-firebase/messaging").FirebaseMessaging, delayMs = 3000) {
  if (retryTimer) window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void fetchAndRegisterToken(FirebaseMessaging).catch((err) => {
      console.warn("Push token retry failed", err);
    });
  }, delayMs);
}

export async function initPushNotifications() {
  const cap = getNativeRuntime();
  if (!cap || registrationInFlight) return;

  registrationInFlight = true;

  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
    const platform = (cap.getPlatform?.() === "android" ? "android" : "ios") as "ios" | "android";

    let perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await FirebaseMessaging.requestPermissions();
    }
    if (perm.receive !== "granted") return;

    if (!listenersInitialized) {
      listenersInitialized = true;

      void FirebaseMessaging.addListener("tokenReceived", async ({ token }) => {
        currentFcmToken = token;
        try {
          await registerTokenWithBackend(token, currentPlatform);
        } catch (err) {
          console.warn("Failed to register FCM token", err);
        }
      });

      void FirebaseMessaging.addListener("apnsTokenReceived", () => {
        scheduleTokenRetry(FirebaseMessaging, 500);
      });

      supabase.auth.onAuthStateChange((event) => {
        if (event !== "SIGNED_IN" || !currentFcmToken) return;
        void registerTokenWithBackend(currentFcmToken, currentPlatform).catch((err) => {
          console.warn("Failed to register FCM token after sign-in", err);
        });
      });

      void FirebaseMessaging.addListener("notificationActionPerformed", (action) => {
        const url = extractUrl(action.notification?.data as PushData);
        if (!url) return;
        try {
          window.location.assign(url);
        } catch {
          /* noop */
        }
      });

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") scheduleTokenRetry(FirebaseMessaging, 500);
      });
    }

    currentPlatform = platform;
    await FirebaseMessaging.subscribeToTopic({ topic: BROADCAST_TOPIC });
    await fetchAndRegisterToken(FirebaseMessaging);
  } catch (err) {
    console.warn("Push init failed", err);
    if (typeof window !== "undefined") {
      void import("@capacitor-firebase/messaging").then(({ FirebaseMessaging }) => {
        scheduleTokenRetry(FirebaseMessaging, 5000);
      });
    }
  } finally {
    registrationInFlight = false;
  }
}
