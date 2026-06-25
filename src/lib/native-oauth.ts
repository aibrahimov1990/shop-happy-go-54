import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { persistNativeSession } from "@/lib/native-session";

const WEBVIEW_AUTH_REDIRECT_PATH = "/auth";
const OAUTH_STATE_KEY = "sellier_native_oauth_state";
const POST_AUTH_REDIRECT_KEY = "post_auth_redirect";

type OAuthProvider = "google";

let deepLinkHandlerInstalled = false;
let authCallbackInFlight: Promise<string | null> | null = null;

export function isNativeApp() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

function generateState() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return [...crypto.getRandomValues(new Uint8Array(16))]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function safePath(path: string | null | undefined, fallback = "/account") {
  if (!path) return fallback;
  if (path.startsWith("/") && !path.startsWith("//")) return path;

  try {
    const parsed = new URL(path, window.location.origin);
    if (parsed.origin !== window.location.origin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function getParamsFromUrl(url: string) {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  const hash = parsed.hash.replace(/^#\/?/, "");
  if (hash) {
    new URLSearchParams(hash).forEach((value, key) => params.set(key, value));
  }
  return { parsed, params };
}

function buildOAuthUrl(provider: OAuthProvider, redirectUri: string, state: string) {
  const params = new URLSearchParams({
    provider,
    redirect_uri: redirectUri,
    state,
  });
  return `${window.location.origin}/~oauth/initiate?${params.toString()}`;
}

function openOAuthInCurrentWebView(provider: OAuthProvider, state: string) {
  const redirectUri = `${window.location.origin}${WEBVIEW_AUTH_REDIRECT_PATH}`;
  window.location.assign(buildOAuthUrl(provider, redirectUri, state));
}

function isAuthCallbackUrl(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "com.sellierknightsbridge.app:" ||
      parsed.pathname === "/auth" ||
      parsed.pathname === "/auth/callback" ||
      parsed.origin === window.location.origin
    );
  } catch {
    return false;
  }
}

export async function completeAuthFromUrl(url: string): Promise<string | null> {
  if (!isAuthCallbackUrl(url)) return null;
  if (authCallbackInFlight) return authCallbackInFlight;

  authCallbackInFlight = (async () => {
    const { params } = getParamsFromUrl(url);
    const error = params.get("error") || params.get("error_description");
    if (error) throw new Error(error);

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return null;

    const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    const returnedState = params.get("state");
    if (expectedState && returnedState && expectedState !== returnedState) {
      throw new Error("Sign-in could not be verified. Please try again.");
    }

    const { data, error: setSessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (setSessionError) throw setSessionError;

    await persistNativeSession(data.session);
    sessionStorage.removeItem(OAUTH_STATE_KEY);

    const redirectPath = safePath(sessionStorage.getItem(POST_AUTH_REDIRECT_KEY));
    sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY);

    if (window.location.hash.includes("access_token") || window.location.search.includes("access_token")) {
      window.history.replaceState(null, "", redirectPath);
    }

    return redirectPath;
  })().finally(() => {
    authCallbackInFlight = null;
  });

  return authCallbackInFlight;
}

export async function startNativeGoogleSignIn(next?: string) {
  if (!isNativeApp()) return false;

  const state = generateState();
  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, safePath(next));

  openOAuthInCurrentWebView("google", state);
  return true;
}

export async function installNativeAuthDeepLinkHandler(onSignedIn?: (path: string) => void) {
  if (typeof window === "undefined") return;

  const finish = async (url: string | undefined | null) => {
    if (!url) return;
    try {
      const redirectPath = await completeAuthFromUrl(url);
      if (!redirectPath) return;
      onSignedIn?.(redirectPath);
    } catch (err) {
      console.error("Native sign-in callback failed", err);
    }
  };

  await finish(window.location.href);

  if (!isNativeApp() || deepLinkHandlerInstalled) return;
  deepLinkHandlerInstalled = true;

  if (!Capacitor.isPluginAvailable("App")) {
    console.warn("Capacitor App plugin unavailable; native deep-link callbacks are disabled.");
    return;
  }

  try {
    const { App } = await import("@capacitor/app");
    const launch = await App.getLaunchUrl();
    await finish(launch?.url);
    await App.addListener("appUrlOpen", (event) => {
      void finish(event.url);
    });
  } catch (err) {
    console.warn("Capacitor App plugin failed to install the auth callback listener.", err);
  }
}