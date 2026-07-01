// Lightweight client-side analytics: session start/end + screen views.
// Writes directly to Supabase (RLS allows anon/auth inserts on app_events).

import { supabase } from "@/integrations/supabase/client";

type EventInput = {
  event_type: "session_start" | "session_end" | "screen_view" | "session_heartbeat";
  screen?: string | null;
  duration_ms?: number | null;
};

let sessionId: string | null = null;
let sessionStartedAt = 0;
let lastScreen: string | null = null;
let heartbeatTimer: number | null = null;
let installed = false;

function getPlatform(): string {
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    return cap?.getPlatform?.() ?? "web";
  } catch {
    return "web";
  }
}

async function log(evt: EventInput) {
  if (!sessionId) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("app_events").insert({
      session_id: sessionId,
      user_id: user?.id ?? null,
      event_type: evt.event_type,
      screen: evt.screen ?? null,
      duration_ms: evt.duration_ms ?? null,
      platform: getPlatform(),
    });
  } catch {
    // never let analytics break the app
  }
}

function startSession() {
  sessionId = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
  sessionStartedAt = Date.now();
  void log({ event_type: "session_start", screen: window.location.pathname });
  lastScreen = window.location.pathname;
  if (heartbeatTimer) window.clearInterval(heartbeatTimer);
  // heartbeat every 60s so long sessions get partial credit even if end is missed
  heartbeatTimer = window.setInterval(() => {
    void log({ event_type: "session_heartbeat", duration_ms: Date.now() - sessionStartedAt });
  }, 60_000);
}

function endSession() {
  if (!sessionId) return;
  const duration = Date.now() - sessionStartedAt;
  void log({ event_type: "session_end", duration_ms: duration });
  sessionId = null;
  if (heartbeatTimer) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function trackScreenView(path: string) {
  if (!sessionId) return;
  if (path === lastScreen) return;
  lastScreen = path;
  void log({ event_type: "screen_view", screen: path });
}

export function initAnalytics() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  startSession();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      endSession();
    } else if (document.visibilityState === "visible" && !sessionId) {
      startSession();
    }
  });

  window.addEventListener("pagehide", endSession);
  window.addEventListener("beforeunload", endSession);
}
