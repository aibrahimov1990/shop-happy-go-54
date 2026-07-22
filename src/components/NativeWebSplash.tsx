import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import sellierLogo from "@/assets/sellier-logo.svg";

const SPLASH_MS = 2000;
const FADE_MS = 400;

// Module-level flag: only show once per webview load (cold start),
// not on subsequent React re-mounts or client-side navigations.
let alreadyShown = false;

export function NativeWebSplash() {
  const isNative =
    typeof window !== "undefined" && Capacitor.isNativePlatform();
  const shouldMount = isNative && !alreadyShown;

  const [visible, setVisible] = useState(shouldMount);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!shouldMount) return;
    alreadyShown = true;

    // Hand off from the native SplashScreen plugin (if present) to this
    // web overlay now that the overlay is on screen.
    void import("../lib/native-splash").then((m) =>
      m.hideNativeSplashWhenReady(),
    );

    const fadeTimer = setTimeout(() => setFading(true), SPLASH_MS);
    const removeTimer = setTimeout(
      () => setVisible(false),
      SPLASH_MS + FADE_MS,
    );
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [shouldMount]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        backgroundColor: "#f7f4ec",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      <img
        src={sellierLogo}
        alt=""
        style={{
          width: "40vw",
          maxWidth: 220,
          height: "auto",
        }}
      />
    </div>
  );
}
