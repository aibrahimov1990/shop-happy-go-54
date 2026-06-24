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
  const active = CATEGORIES[activeIdx];

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", "shop", active.label],
    queryFn: async (): Promise<ShopifyProduct[]> => {
      const res = await storefrontApiRequest<any>(PRODUCTS_QUERY, {
        first: 40,
        query: active.query,
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
          {CATEGORIES.map((cat, i) => (
            <button
              key={cat.label}
              onClick={() => setActiveIdx(i)}
              className={`shrink-0 px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] border transition-colors ${
                i === activeIdx
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              {cat.label}
            </button>
          ))}
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
