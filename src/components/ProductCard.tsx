import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { type ShopifyProduct, formatPrice } from "@/lib/shopify";
import { useWishlist } from "@/hooks/useWishlist";

export function ProductCard({ product }: { product: ShopifyProduct }) {
  const p = product.node;
  const img = p.images.edges[0]?.node;
  const price = p.priceRange.minVariantPrice;
  const { has, toggle } = useWishlist();
  const saved = has(p.id);

  return (
    <div className="group block relative">
      <Link to="/product/$handle" params={{ handle: p.handle }} className="block">
        <div className="aspect-[3/4] w-full bg-muted overflow-hidden mb-2 relative">
          {img ? (
            <img
              src={img.url}
              alt={img.altText ?? p.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : null}
        </div>
        {p.vendor && (
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {p.vendor}
          </p>
        )}
        <h3 className="font-serif text-sm leading-tight line-clamp-2">{p.title}</h3>
        <p className="text-xs mt-1">{formatPrice(price.amount, price.currencyCode)}</p>
      </Link>
      <button
        type="button"
        aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle(p.id);
        }}
        className="absolute top-2 right-2 h-8 w-8 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-full"
      >
        <Heart
          className={`h-4 w-4 ${saved ? "fill-foreground text-foreground" : "text-foreground"}`}
          strokeWidth={1.5}
        />
      </button>
    </div>
  );
}
