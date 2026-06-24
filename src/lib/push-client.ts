// Client-only: registers the native device with APNs/FCM and stores its token.
// Safe to import everywhere — it no-ops outside a Capacitor native runtime.

import { registerDeviceToken } from "./push.functions";

let initialized = false;

export async function initPushNotifications() {
  if (initialized) return;
  if (typeof window === "undefined") return;

  // Only run inside the Capacitor native shell
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } })
    .Capacitor;
  if (!cap?.isNativePlatform?.()) return;

  initialized = true;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") return;

    PushNotifications.addListener("registration", async (token) => {
      const platform = (cap.getPlatform?.() === "android" ? "android" : "ios") as "ios" | "android";
      try {
        await registerDeviceToken({ data: { token: token.value, platform } });
      } catch (err) {
        console.warn("Failed to register device token", err);
      }
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.warn("Push registration error", err);
    });

    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const url = action.notification?.data?.url;
      if (typeof url === "string" && url.length > 0) {
        try {
          window.location.assign(url);
        } catch {
          /* noop */
        }
      }
    });

    await PushNotifications.register();
  } catch (err) {
    console.warn("Push init failed", err);
  }
}
