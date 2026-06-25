// Client-only: registers the native device with FCM and stores its token.
// Safe to import everywhere — it no-ops outside a Capacitor native runtime.

import { registerDeviceToken } from "./push.functions";
import { supabase } from "@/integrations/supabase/client";

let listenersInitialized = false;
let registrationInFlight = false;
let lastRegisteredToken: string | null = null;
let currentFcmToken: string | null = null;
let currentPlatform: "ios" | "android" = "ios";

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
  if (!data.session) return false;

  await registerDeviceToken({ data: { token, platform } });
  lastRegisteredToken = token;
  return true;
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
    }

    const { token } = await FirebaseMessaging.getToken();
    currentFcmToken = token;
    currentPlatform = platform;
    if (token && token !== lastRegisteredToken) {
      await registerTokenWithBackend(token, platform);
    }
  } catch (err) {
    console.warn("Push init failed", err);
  } finally {
    registrationInFlight = false;
  }
}
