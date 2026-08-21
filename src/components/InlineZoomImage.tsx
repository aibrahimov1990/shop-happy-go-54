import { useEffect, useRef, useState } from "react";
import { shopifyImageUrl } from "@/lib/shopify";

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Inline product image that can be pinched / double-tapped to zoom in place,
 * without opening the full-screen viewer first. A plain tap (no zoom, no drag)
 * still opens the full-screen viewer via onOpen().
 */
export function InlineZoomImage({
  url,
  alt,
  onOpen,
  className = "",
}: {
  url: string;
  alt: string;
  onOpen: () => void;
  className?: string;
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef({
    mode: "none" as "none" | "pan" | "pinch",
    startZoom: 1,
    startDist: 0,
    startOffset: { x: 0, y: 0 },
    startCenter: { x: 0, y: 0 },
    startX: 0,
    startY: 0,
    moved: false,
  });
  const lastTap = useRef(0);

  // Reset when the displayed image changes.
  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [url]);

  const rectOf = () => ref.current?.getBoundingClientRect();

  const clampOffset = (o: { x: number; y: number }, z: number) => {
    const r = rectOf();
    if (!r || z <= 1) return { x: 0, y: 0 };
    const maxX = r.width * (z - 1);
    const maxY = r.height * (z - 1);
    return { x: clamp(o.x, -maxX, 0), y: clamp(o.y, -maxY, 0) };
  };

  const zoomAt = (nextRaw: number, px: number, py: number) => {
    const next = clamp(nextRaw, MIN_ZOOM, MAX_ZOOM);
    setOffset((cur) => {
      if (next === MIN_ZOOM) return { x: 0, y: 0 };
      const k = next / zoom;
      return clampOffset({ x: px - (px - cur.x) * k, y: py - (py - cur.y) * k }, next);
    });
    setZoom(next);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = g.current;
    s.moved = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const r = rectOf();
      s.mode = "pinch";
      s.startZoom = zoom;
      s.startDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      s.startOffset = offset;
      s.startCenter = {
        x: (a.x + b.x) / 2 - (r?.left ?? 0),
        y: (a.y + b.y) / 2 - (r?.top ?? 0),
      };
    } else if (pointers.current.size === 1) {
      s.mode = zoom > 1 ? "pan" : "none";
      s.startOffset = offset;
      s.startX = e.clientX;
      s.startY = e.clientY;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = g.current;

    if (s.mode === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const next = clamp((dist / s.startDist) * s.startZoom, MIN_ZOOM, MAX_ZOOM);
      const k = next / s.startZoom;
      const c = s.startCenter;
      setZoom(next);
      setOffset(
        next === MIN_ZOOM
          ? { x: 0, y: 0 }
          : clampOffset(
              { x: c.x - (c.x - s.startOffset.x) * k, y: c.y - (c.y - s.startOffset.y) * k },
              next,
            ),
      );
      s.moved = true;
      return;
    }

    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) s.moved = true;
    if (s.mode === "pan") {
      setOffset(clampOffset({ x: s.startOffset.x + dx, y: s.startOffset.y + dy }, zoom));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const s = g.current;

    if (!s.moved && pointers.current.size === 0) {
      const now = Date.now();
      const r = rectOf();
      const px = e.clientX - (r?.left ?? 0);
      const py = e.clientY - (r?.top ?? 0);
      if (now - lastTap.current < 300) {
        // Double tap: zoom in place / reset.
        if (zoom > 1) {
          setZoom(1);
          setOffset({ x: 0, y: 0 });
        } else {
          zoomAt(2.5, px, py);
        }
        lastTap.current = 0;
      } else {
        lastTap.current = now;
        const at = now;
        // Single tap opens the full-screen viewer only when not zoomed in.
        window.setTimeout(() => {
          if (lastTap.current === at && zoom === 1) onOpen();
        }, 300);
      }
    }

    if (pointers.current.size === 0) s.mode = "none";
    else if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      s.mode = zoom > 1 ? "pan" : "none";
      s.startOffset = offset;
      s.startX = p.x;
      s.startY = p.y;
    }
  };

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label="Product image — pinch or double-tap to zoom, tap to view full screen"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => {
        const r = rectOf();
        if (zoom > 1) {
          setZoom(1);
          setOffset({ x: 0, y: 0 });
        } else {
          zoomAt(2.5, e.clientX - (r?.left ?? 0), e.clientY - (r?.top ?? 0));
        }
      }}
      className={`relative block aspect-[4/5] w-full bg-white overflow-hidden select-none ${className}`}
      style={{ touchAction: zoom > 1 ? "none" : "pan-y", overscrollBehavior: "contain" }}
    >
      <img
        src={shopifyImageUrl(url, 2048)}
        alt={alt}
        draggable={false}
        className="h-full w-full object-cover pointer-events-none select-none"
        style={{
          objectPosition: "center center",
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          transition: g.current.mode === "none" ? "transform 180ms ease-out" : "none",
        }}
      />
      {zoom > 1 && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setZoom(1);
            setOffset({ x: 0, y: 0 });
          }}
          className="absolute bottom-3 right-3 bg-background/80 backdrop-blur-sm px-3 py-1.5 text-[10px] uppercase tracking-[0.2em]"
        >
          Reset
        </button>
      )}
    </div>
  );
}
