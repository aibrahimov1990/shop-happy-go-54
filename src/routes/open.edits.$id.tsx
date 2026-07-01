import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/open/edits/$id")({
  head: () => ({
    meta: [
      { title: "Open your edit — Sellier Knightsbridge" },
      { name: "description", content: "Opening your personal edit in the Sellier app." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OpenEdit,
});

function OpenEdit() {
  const { id } = Route.useParams();
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const appUrl = `com.sellierknightsbridge.app://edits/${id}`;
    const webUrl = `${window.location.origin}/edits/${id}`;

    // Try to launch the native app via custom scheme.
    // If iOS/Android has the app installed, the page becomes hidden.
    let didHide = false;
    const onVisibility = () => {
      if (document.hidden) didHide = true;
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Kick off the deep-link attempt
    window.location.href = appUrl;

    // After a short delay, if the app didn't take over, offer web fallback.
    const t = window.setTimeout(() => {
      if (!didHide) {
        // Optional auto-fallback: redirect to the web edit
        window.location.replace(webUrl);
      }
    }, 1500);

    // Show manual fallback controls after a beat too
    const t2 = window.setTimeout(() => setShowFallback(true), 800);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [id]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 text-center">
      <p className="text-[10px] uppercase tracking-[0.35em] text-neutral-500 mb-3">
        Sellier
      </p>
      <h1 className="font-serif text-2xl mb-2">Opening your edit…</h1>
      <p className="text-sm text-neutral-600 max-w-sm">
        We're launching the Sellier app on your device.
      </p>
      {showFallback && (
        <div className="mt-8 flex flex-col gap-3">
          <a
            href={`com.sellierknightsbridge.app://edits/${id}`}
            className="inline-block bg-black text-white px-6 py-3 text-[11px] uppercase tracking-[0.25em]"
          >
            Open in app
          </a>
          <a
            href={`/edits/${id}`}
            className="text-[11px] uppercase tracking-[0.25em] underline text-neutral-700"
          >
            Continue in browser
          </a>
        </div>
      )}
    </div>
  );
}
