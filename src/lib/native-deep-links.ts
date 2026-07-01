// Handles custom-scheme deep links like:
//   com.sellierknightsbridge.app://edits/<id>
//   com.sellierknightsbridge.app://product/<handle>
// and routes them inside the native app.
//
// Auth callback URLs (auth-callback) are handled separately in native-oauth.ts.

import { Capacitor } from "@capacitor/core";

const APP_SCHEME = "com.sellierknightsbridge.app";
let installed = false;

function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function pathFromDeepLink(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol.replace(":", "") !== APP_SCHEME) return null;
    // Ignore auth deep links — native-oauth.ts owns those.
    const host = u.hostname || "";
    if (host === "auth-callback" || u.pathname.startsWith("/auth-callback")) return null;

    // The host is the first path segment (e.g. "edits"), pathname is the rest.
    const path = `/${host}${u.pathname || ""}`.replace(/\/+$/, "");
    return path || null;
  } catch {
    return null;
  }
}

export async function installAppDeepLinkHandler(onNavigate: (path: string) => void) {
  if (typeof window === "undefined" || !isNativeApp() || installed) return;
  if (!Capacitor.isPluginAvailable("App")) return;
  installed = true;

  try {
    const { App } = await import("@capacitor/app");

    const handle = (url: string | undefined | null) => {
      if (!url) return;
      const path = pathFromDeepLink(url);
      if (path) onNavigate(path);
    };

    const launch = await App.getLaunchUrl();
    handle(launch?.url);

    await App.addListener("appUrlOpen", (event) => {
      handle(event.url);
    });
  } catch (err) {
    console.warn("Deep link handler failed to install", err);
  }
}
