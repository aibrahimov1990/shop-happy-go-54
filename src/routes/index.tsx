import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MobileLayout } from "@/components/MobileLayout";
import { ProductCard } from "@/components/ProductCard";
import { storefrontApiRequest, PRODUCTS_QUERY, type ShopifyProduct } from "@/lib/shopify";
import sellierLogo from "@/assets/sellier-logo.svg";

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
  const res = await storefrontApiRequest<any>(PRODUCTS_QUERY, {
    first: 12,
    query: null,
    sortKey: "CREATED_AT",
    reverse: true,
  });
  return res?.data?.products?.edges ?? [];
}

function Home() {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", "featured"],
    queryFn: fetchFeatured,
  });

  return (
    <MobileLayout>
      {/* Announcement bar */}
      <div className="bg-foreground text-background text-center py-2 text-[10px] uppercase tracking-[0.25em]">
        Authentic Superbrands · Worldwide Shipping · Fastest Finger First
      </div>

      {/* Hero */}
      <section className="relative">
        <div className="aspect-[3/4] w-full bg-muted overflow-hidden">
          <img
            src="https://www.sellierknightsbridge.com/cdn/shop/files/284A3741_1000x.jpg"
            alt="Sellier Knightsbridge — Authentic Superbrands"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/50 via-foreground/10 to-transparent" />
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

      {/* Tagline strip */}
      <div className="text-center py-6 px-6 border-b border-border/60">
        <img src={sellierLogo} alt="Sellier" className="h-3 w-auto mx-auto mb-2 opacity-70" />
        <h2 className="font-serif text-2xl">Buy now or cry later</h2>
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

      {/* Footer */}
      <footer className="bg-[#f5f1ea] px-6 py-12 space-y-10">
        <div>
          <h2 className="font-serif text-3xl tracking-wide mb-6">SELLIER</h2>
          <h4 className="font-semibold text-sm">Knightsbridge Consignment Store</h4>
        </div>

        <div>
          <ul className="space-y-3 text-sm">
            <li><Link to="/terms">Terms &amp; Conditions</Link></li>
            <li><a href="https://www.sellierknightsbridge.com/pages/refund_policy" target="_blank" rel="noopener noreferrer">Refund policy</a></li>
            <li><Link to="/sell-with-us">Sell With Us</Link></li>
          </ul>
        </div>


        <div>
          <h4 className="font-semibold text-base mb-4">Newsletter</h4>
          <p className="text-sm text-foreground/80 mb-5">
            Subscribe to receive updates, access to exclusive deals and more.
          </p>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="space-y-3"
          >
            <input
              type="email"
              placeholder="Enter your email address"
              className="w-full bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              type="submit"
              className="w-full bg-foreground text-background py-4 text-[11px] uppercase tracking-[0.3em]"
            >
              Subscribe
            </button>
          </form>
          <div className="mt-8 text-sm text-foreground/80 space-y-1">
            <p>020 7581 2380</p>
            <p>6 Cheval Place, London, England, United Kingdom</p>
          </div>
        </div>
      </footer>

    </MobileLayout>
  );
}
