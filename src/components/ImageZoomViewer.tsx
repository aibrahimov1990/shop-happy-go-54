import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { shopifyImageUrl } from "@/lib/shopify";

type Img = { url: string; altText: string | null };

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Full-screen image viewer: pinch zoom, double-tap zoom, pan while zoomed,
 * swipe between images when not zoomed, swipe down to dismiss.
 * Gestures use Pointer Events only (works inside the Capacitor iOS webview).
 */
export function ImageZoomViewer({
  images,
  index,
  onIndexChange,
  onClose,
  alt,
}: {
  images: Img[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  alt: string;
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startZoom: number;
    startDist: number;
    startOffset: { x: number; y: number };
    startCenter: { x: number; y: number };
    mode: "none" | "pan" | "pinch" | "swipe";
    startX: number;
    startY: number;
    moved: boolean;
  }>({
    startZoom: 1,
    startDist: 0,
    startOffset: { x: 0, y: 0 },
    startCenter: { x: 0, y: 0 },
    mode: "none",
    startX: 0,
    startY: 0,
    moved: false,
  });
  const lastTap = useRef(0);

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setDrag({ x: 0, y: 0 });
  }, []);

  // Lock background scrolling while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    const prevPos = document.body.style.position;
    document.body.style.overflow = "hidden";
    document.body.style.position = "relative";
    return () => {
      document.body.style.overflow = prev;
      document.body.style.position = prevPos;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < images.length - 1) onIndexChange(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, onClose, onIndexChange]);

  useEffect(reset, [index, reset]);

  const rectOf = () => containerRef.current?.getBoundingClientRect();

  const zoomAt = (nextZoomRaw: number, px: number, py: number) => {
    const next = clamp(nextZoomRaw, MIN_ZOOM, MAX_ZOOM);
    setOffset((cur) => {
      const k = next / zoom;
      if (next === MIN_ZOOM) return { x: 0, y: 0 };
      return { x: px - (px - cur.x) * k, y: py - (py - cur.y) * k };
    });
    setZoom(next);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    g.moved = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const r = rectOf();
      g.mode = "pinch";
      g.startZoom = zoom;
      g.startDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      g.startOffset = offset;
      g.startCenter = {
        x: (a.x + b.x) / 2 - (r?.left ?? 0),
        y: (a.y + b.y) / 2 - (r?.top ?? 0),
      };
    } else if (pointers.current.size === 1) {
      g.mode = zoom > 1 ? "pan" : "swipe";
      g.startOffset = offset;
      g.startX = e.clientX;
      g.startY = e.clientY;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;

    if (g.mode === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const next = clamp((dist / g.startDist) * g.startZoom, MIN_ZOOM, MAX_ZOOM);
      const k = next / g.startZoom;
      const c = g.startCenter;
      setZoom(next);
      setOffset(
        next === MIN_ZOOM
          ? { x: 0, y: 0 }
          : { x: c.x - (c.x - g.startOffset.x) * k, y: c.y - (c.y - g.startOffset.y) * k },
      );
      g.moved = true;
      return;
    }

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) g.moved = true;

    if (g.mode === "pan") {
      setOffset({ x: g.startOffset.x + dx, y: g.startOffset.y + dy });
    } else if (g.mode === "swipe") {
      setDrag({ x: dx, y: dy });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;

    if (g.mode === "swipe") {
      const { x, y } = drag;
      const r = rectOf();
      const w = r?.width ?? 320;
      if (y > 110 && Math.abs(y) > Math.abs(x)) {
        onClose();
        return;
      }
      if (Math.abs(x) > Math.max(60, w * 0.18) && Math.abs(x) > Math.abs(y)) {
        if (x < 0 && index < images.length - 1) onIndexChange(index + 1);
        else if (x > 0 && index > 0) onIndexChange(index - 1);
      }
      setDrag({ x: 0, y: 0 });
    }

    if (!g.moved && pointers.current.size === 0) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        const r = rectOf();
        const px = e.clientX - (r?.left ?? 0);
        const py = e.clientY - (r?.top ?? 0);
        if (zoom > 1) reset();
        else zoomAt(2.5, px, py);
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }

    if (pointers.current.size === 0) g.mode = "none";
    else if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      g.mode = zoom > 1 ? "pan" : "swipe";
      g.startOffset = offset;
      g.startX = p.x;
      g.startY = p.y;
    }
  };

  const img = images[index];
  if (!img) return null;

  const dismissProgress = zoom === 1 ? clamp(Math.max(drag.y, 0) / 300, 0, 0.7) : 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{
        background: `rgba(0,0,0,${1 - dismissProgress})`,
        touchAction: "none",
        overscrollBehavior: "none",
      }}
    >
      <div
        className="flex items-center justify-between px-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)", paddingBottom: "0.75rem" }}
      >
        <span className="text-[10px] uppercase tracking-[0.25em] text-white/70">
          {index + 1} / {images.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close image viewer"
          className="h-9 w-9 flex items-center justify-center text-white"
        >
          <X className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </div>

      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex-1 overflow-hidden select-none"
        style={{ touchAction: "none" }}
      >
        <img
          src={shopifyImageUrl(img.url, 2048)}
          alt={img.altText ?? alt}
          draggable={false}
          className="h-full w-full object-contain pointer-events-none select-none"
          style={{
            transform:
              zoom > 1
                ? `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`
                : `translate(${drag.x}px, ${Math.max(drag.y, 0)}px) scale(${1 - dismissProgress * 0.15})`,
            transformOrigin: "0 0",
            transition: gesture.current.mode === "none" ? "transform 180ms ease-out" : "none",
          }}
        />
      </div>

      {images.length > 1 && (
        <div
          className="flex justify-center gap-1.5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3"
          aria-hidden
        >
          {images.map((_, i) => (
            <span
              key={i}
              className={`h-1 w-1 rounded-full ${i === index ? "bg-white" : "bg-white/40"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
