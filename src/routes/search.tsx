import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { MobileLayout } from "@/components/MobileLayout";
import { ProductCard } from "@/components/ProductCard";
import { storefrontApiRequest, PRODUCTS_QUERY, type ShopifyProduct } from "@/lib/shopify";

type SearchParams = { q?: string };

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  head: () => ({
    meta: [
      { title: "Search — Sellier Knightsbridge" },
      { name: "description", content: "Search authenticated preloved luxury at Sellier." },
      { property: "og:title", content: "Search — Sellier Knightsbridge" },
      { property: "og:description", content: "Find your next piece at Sellier." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const { q = "" } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const query = q.trim();
  const [input, setInput] = useState(q);

  // Keep the input in sync with the URL (back navigation, shared links).
  useEffect(() => {
    setInput(q);
  }, [q]);

  // Debounced URL update — no request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      const v = input.trim();
      if (v !== query) navigate({ search: { q: v }, replace: true });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", "search", query],
    queryFn: async (): Promise<ShopifyProduct[]> => {
      if (!query) return [];
      const res = await storefrontApiRequest<any>(PRODUCTS_QUERY, {
        first: 40,
        query: `(title:*${query}* OR vendor:*${query}*) AND -tag:KIDS`,
      });
      return res?.data?.products?.edges ?? [];
    },
    enabled: query.length > 0,
  });

  return (
    <MobileLayout>
      <div className="px-4 pt-6 pb-4">
        <h1 className="font-serif text-3xl mb-4">Search</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ search: { q: input.trim() }, replace: true });
          }}
          className="relative"
        >
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Chanel, Hermès, Birkin..."
            className="w-full pl-10 pr-4 h-11 bg-secondary text-sm border border-border focus:outline-none focus:border-foreground"
          />
        </form>
      </div>

      <section className="px-4 pb-6">
        {!query ? (
          <p className="text-xs uppercase tracking-widest text-muted-foreground text-center py-12">
            Search the Sellier edit
          </p>
        ) : isLoading ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-muted animate-pulse" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            No matches for "{query}"
          </p>
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
