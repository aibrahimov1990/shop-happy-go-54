import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MobileLayout } from "@/components/MobileLayout";
import { ProductCard } from "@/components/ProductCard";
import { storefrontApiRequest, PRODUCTS_QUERY, type ShopifyProduct } from "@/lib/shopify";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sellier Knightsbridge — Preloved Luxury" },
      {
        name: "description",
        content:
          "Authentic preloved luxury handbags, shoes, clothing and accessories. Shop Chanel, Hermès, Louis Vuitton and more on the official Sellier app.",
      },
      { property: "og:title", content: "Sellier Knightsbridge — Preloved Luxury" },
      {
        property: "og:description",
        content: "Authentic preloved luxury. Shop the Sellier edit.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Home,
});

async function fetchFeatured(): Promise<ShopifyProduct[]> {
  const res = await storefrontApiRequest<any>(PRODUCTS_QUERY, { first: 12, query: null });
  return res?.data?.products?.edges ?? [];
}

function Home() {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", "featured"],
    queryFn: fetchFeatured,
  });

  return (
    <MobileLayout>
      {/* Hero */}
      <section className="relative">
        <div className="aspect-[3/4] w-full bg-muted overflow-hidden">
          {products[0]?.node.images.edges[0]?.node ? (
            <img
              src={products[0].node.images.edges[0].node.url}
              alt="Sellier featured piece"
              className="h-full w-full object-cover"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/40 via-transparent to-transparent" />
        </div>
        <div className="absolute bottom-8 left-0 right-0 px-6 text-background">
          <p className="text-[10px] uppercase tracking-[0.3em] mb-2 opacity-90">
            Preloved Luxury Redefined
          </p>
          <h1 className="font-serif text-4xl leading-none">Authentic<br/>Superbrands</h1>
          <Link
            to="/shop"
            className="inline-block mt-5 bg-background text-foreground px-6 py-3 text-[11px] uppercase tracking-[0.25em]"
          >
            New Drops
          </Link>
        </div>
      </section>

      {/* Banner */}
      <div className="bg-foreground text-background text-center py-2 text-[10px] uppercase tracking-[0.25em]">
        Worldwide shipping · Fastest finger first
      </div>

      {/* Featured grid */}
      <section className="px-4 py-8">
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="font-serif text-2xl">The Edit</h2>
          <Link
            to="/shop"
            className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground"
          >
            View all
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-[3/4] bg-muted animate-pulse" />
                <div className="h-3 bg-muted animate-pulse w-1/2" />
                <div className="h-3 bg-muted animate-pulse w-3/4" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            No products found.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6">
            {products.map((p) => (
              <ProductCard key={p.node.id} product={p} />
            ))}
          </div>
        )}
      </section>

      <section className="px-6 py-10 border-t border-border/60 text-center">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
          Sellier
        </p>
        <h3 className="font-serif text-2xl mb-3">Buy now or cry later</h3>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          Hand-selected, authenticated luxury — sourced and styled in Knightsbridge.
        </p>
      </section>
    </MobileLayout>
  );
}
