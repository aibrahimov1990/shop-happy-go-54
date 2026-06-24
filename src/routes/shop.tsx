import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MobileLayout } from "@/components/MobileLayout";
import { ProductCard } from "@/components/ProductCard";
import { storefrontApiRequest, PRODUCTS_QUERY, type ShopifyProduct } from "@/lib/shopify";
import { useState } from "react";

const CATEGORIES = [
  { label: "All", query: null },
  { label: "Bags", query: "product_type:Bags OR title:bag" },
  { label: "Shoes", query: "product_type:Shoes OR title:shoes" },
  { label: "Clothing", query: "product_type:Clothing" },
  { label: "Accessories", query: "product_type:Accessories" },
];

const BRANDS = [
  "All",
  "Chanel",
  "Hermès",
  "Louis Vuitton",
  "Gucci",
  "Prada",
  "Dior",
  "Celine",
  "Bottega Veneta",
  "Saint Laurent",
];

const SORTS = [
  { label: "New In", sortKey: "CREATED_AT", reverse: true },
  { label: "Price: Low to High", sortKey: "PRICE", reverse: false },
  { label: "Price: High to Low", sortKey: "PRICE", reverse: true },
  { label: "Best Selling", sortKey: "BEST_SELLING", reverse: false },
] as const;

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop — Sellier Knightsbridge" },
      {
        name: "description",
        content: "Browse authenticated preloved luxury bags, shoes, clothing and accessories.",
      },
      { property: "og:title", content: "Shop — Sellier Knightsbridge" },
      {
        property: "og:description",
        content: "Browse authenticated preloved luxury at Sellier.",
      },
    ],
  }),
  component: Shop,
});

function Shop() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [brandIdx, setBrandIdx] = useState(0);
  const [sortIdx, setSortIdx] = useState(0);

  const cat = CATEGORIES[activeIdx];
  const brand = BRANDS[brandIdx];
  const sort = SORTS[sortIdx];

  const parts: string[] = [];
  if (cat.query) parts.push(`(${cat.query})`);
  if (brand !== "All") parts.push(`vendor:"${brand}"`);
  const query = parts.length ? parts.join(" AND ") : null;

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", "shop", cat.label, brand, sort.label],
    queryFn: async (): Promise<ShopifyProduct[]> => {
      const res = await storefrontApiRequest<any>(PRODUCTS_QUERY, {
        first: 40,
        query,
        sortKey: sort.sortKey,
        reverse: sort.reverse,
      });
      return res?.data?.products?.edges ?? [];
    },
  });

  return (
    <MobileLayout>
      <div className="px-4 pt-6 pb-3">
        <h1 className="font-serif text-3xl">Shop</h1>
      </div>

      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-sm border-b border-border/60">
        <div className="flex gap-1 overflow-x-auto px-4 py-3 no-scrollbar">
          {CATEGORIES.map((c, i) => (
            <button
              key={c.label}
              onClick={() => setActiveIdx(i)}
              className={`shrink-0 px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] border transition-colors ${
                i === activeIdx
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto px-4 pb-3 no-scrollbar">
          {BRANDS.map((b, i) => (
            <button
              key={b}
              onClick={() => setBrandIdx(i)}
              className={`shrink-0 px-3 py-1 text-[10px] uppercase tracking-[0.18em] rounded-full border transition-colors ${
                i === brandIdx
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between px-4 pb-3">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Sort
          </span>
          <select
            value={sortIdx}
            onChange={(e) => setSortIdx(Number(e.target.value))}
            className="text-[11px] uppercase tracking-[0.15em] bg-transparent border border-border px-2 py-1"
          >
            {SORTS.map((s, i) => (
              <option key={s.label} value={i}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="px-4 py-6">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-[3/4] bg-muted animate-pulse" />
                <div className="h-3 bg-muted animate-pulse w-1/2" />
                <div className="h-3 bg-muted animate-pulse w-3/4" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No products found.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6">
            {products.map((p) => (
              <ProductCard key={p.node.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </MobileLayout>
  );
}
