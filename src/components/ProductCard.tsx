import { Link } from "@tanstack/react-router";
import { type ShopifyProduct, formatPrice } from "@/lib/shopify";

export function ProductCard({ product }: { product: ShopifyProduct }) {
  const p = product.node;
  const img = p.images.edges[0]?.node;
  const price = p.priceRange.minVariantPrice;

  return (
    <Link
      to="/product/$handle"
      params={{ handle: p.handle }}
      className="group block"
    >
      <div className="aspect-[3/4] w-full bg-muted overflow-hidden mb-2">
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
  );
}
