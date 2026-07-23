import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MobileLayout } from "@/components/MobileLayout";
import { ProductCard } from "@/components/ProductCard";

import { storefrontApiRequest, PRODUCTS_QUERY, type ShopifyProduct } from "@/lib/shopify";
import sellierLogo from "@/assets/sellier-logo.svg";
import hero1 from "@/assets/hero-1.png";
import hero2 from "@/assets/hero-2.png";

const HERO_IMAGES = [hero1, hero2];

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
    first: 16,
    query: "-tag:KIDS",
    sortKey: "CREATED_AT",
    reverse: true,
  });
  const edges: ShopifyProduct[] = res?.data?.products?.edges ?? [];
  return edges.slice(0, 12);
}

function Home() {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", "featured"],
    queryFn: fetchFeatured,
  });

  const [heroIndex, setHeroIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setHeroIndex((i) => (i + 1) % HERO_IMAGES.length);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <MobileLayout>
      {/* Announcement bar */}
      <div className="bg-foreground text-background text-center py-2 text-[10px] uppercase tracking-[0.25em]">
        Authentic Superbrands · Worldwide Shipping · Fastest Finger First
      </div>

      {/* Hero */}
      <section className="relative">
        <div className="relative aspect-[3/4] w-full bg-muted overflow-hidden">
          {HERO_IMAGES.map((src, i) => (
            <img
              key={src}
              src={src}
              alt="Sellier Knightsbridge — Authentic Superbrands"
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
                i === heroIndex ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/50 via-foreground/10 to-transparent" />
        </div>
        <div className="absolute bottom-8 left-0 right-0 px-6 text-background">
          <p className="text-[10px] uppercase tracking-[0.3em] mb-2 opacity-90">
            Preloved Luxury Redefined
          </p>
          <h1 className="font-serif text-4xl leading-none">Authentic<br/>Superbrands</h1>
          <Link
            to="/collections/$handle"
            params={{ handle: "new-drops" }}
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
            to="/new-arrivals"
            className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground"
          >
            New Arrivals →
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
      <footer className="bg-[#f5f1ea] px-6 pt-10 pb-8 text-left -mb-[calc(5rem+env(safe-area-inset-bottom))] pb-[calc(2rem+5rem+env(safe-area-inset-bottom))]">
        <img src={sellierLogo} alt="Sellier" className="h-4 w-auto mb-6 opacity-80" />

        <div>
          <form onSubmit={(e) => e.preventDefault()} className="flex items-center border-b border-foreground/30">
            <input
              type="email"
              placeholder="Email address"
              className="flex-1 bg-transparent py-3 text-sm placeholder:text-muted-foreground focus:outline-none text-left"
            />
            <button
              type="submit"
              aria-label="Subscribe"
              className="text-[10px] uppercase tracking-[0.25em] pl-3 pb-3 pt-3"
            >
              Join →
            </button>
          </form>
        </div>

        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-10 text-[11px] uppercase tracking-[0.2em]">
          <li><Link to="/terms">Terms</Link></li>
          <li aria-hidden className="text-foreground/30">·</li>
          <li><Link to="/refund-policy">Refunds</Link></li>
          <li aria-hidden className="text-foreground/30">·</li>
          <li><Link to="/sell-with-us">Sell With Us</Link></li>
        </ul>

        <div className="mt-8 space-y-1 text-xs text-foreground/70">
          <p>
            <a href="tel:+442075812380" className="underline-offset-4 hover:underline">
              020 7581 2380
            </a>
          </p>
          <p>6 Cheval Place, London SW7 1EW</p>
        </div>

        <p className="mt-8 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          © {new Date().getFullYear()} Sellier Knightsbridge
        </p>
      </footer>

    </MobileLayout>
  );
}
