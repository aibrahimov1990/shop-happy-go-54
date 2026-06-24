import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useRef, useState } from "react";
import { type ShopifyProduct, formatPrice } from "@/lib/shopify";
import { useWishlist } from "@/hooks/useWishlist";

export function ProductCard({ product }: { product: ShopifyProduct }) {
  const p = product.node;
  const images = p.images.edges.slice(0, 8);
  const price = p.priceRange.minVariantPrice;
  const { has, toggle } = useWishlist();
  const saved = has(p.id);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== activeIdx) setActiveIdx(idx);
  };

  return (
    <div className="group block relative">
      <div className="aspect-[3/4] w-full bg-muted overflow-hidden mb-2 relative">
        {images.length > 0 ? (
          <div
            ref={scrollerRef}
            onScroll={onScroll}
            className="flex h-full w-full snap-x snap-mandatory overflow-x-auto no-scrollbar scroll-smooth"
            style={{ scrollbarWidth: "none" }}
          >
            {images.map((edge, i) => (
              <Link
                key={edge.node.url + i}
                to="/product/$handle"
                params={{ handle: p.handle }}
                className="relative h-full w-full shrink-0 snap-center"
                draggable={false}
              >
                <img
                  src={edge.node.url}
                  alt={edge.node.altText ?? p.title}
                  loading="lazy"
                  draggable={false}
                  className="h-full w-full object-cover select-none pointer-events-none"
                />
              </Link>
            ))}
          </div>
        ) : null}

        {images.length > 1 && (
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 pointer-events-none">
            {images.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-opacity ${
                  i === activeIdx ? "bg-white opacity-100" : "bg-white opacity-50"
                }`}
                style={{ boxShadow: "0 0 2px rgba(0,0,0,0.4)" }}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle(p.id);
          }}
          className="absolute top-2 right-2 h-8 w-8 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-full z-10"
        >
          <Heart
            className={`h-4 w-4 ${saved ? "fill-foreground text-foreground" : "text-foreground"}`}
            strokeWidth={1.5}
          />
        </button>
      </div>

      <Link to="/product/$handle" params={{ handle: p.handle }} className="block">
        {p.vendor && (
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {p.vendor}
          </p>
        )}
        <h3 className="font-serif text-sm leading-tight line-clamp-2">{p.title}</h3>
        <p className="text-xs mt-1">{formatPrice(price.amount, price.currencyCode)}</p>
      </Link>
    </div>
  );
}
