import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MobileLayout } from "@/components/MobileLayout";
import { ProductCard } from "@/components/ProductCard";
import {
  storefrontApiRequest,
  PRODUCTS_QUERY,
  isKidsProduct,
  type ShopifyProduct,
} from "@/lib/shopify";
import { useWishlist } from "@/hooks/useWishlist";

export const Route = createFileRoute("/new-arrivals")({
  head: () => ({
    meta: [
      { title: "New Arrivals — Sellier Knightsbridge" },
      {
        name: "description",
        content:
          "Fresh pieces from the brands you love. Personalised new arrivals from the Sellier edit.",
      },
      { property: "og:title", content: "New Arrivals — Sellier Knightsbridge" },
      {
        property: "og:description",
        content: "Fresh pieces from the brands you love.",
      },
    ],
  }),
  component: NewArrivalsPage,
});

const LOOKBACK_DAYS = 30;

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function fetchProductsByIds(ids: string[]): Promise<ShopifyProduct[]> {
  if (ids.length === 0) return [];
  const q = ids.map((id) => `id:${id.split("/").pop()}`).join(" OR ");
  const res = await storefrontApiRequest<any>(PRODUCTS_QUERY, { first: 50, query: q });
  return res?.data?.products?.edges ?? [];
}

async function fetchNewArrivalsByVendors(vendors: string[]): Promise<ShopifyProduct[]> {
  const sinceQ = `created_at:>=${daysAgoISO(LOOKBACK_DAYS)} -tag:KIDS`;
  const vendorQ =
    vendors.length > 0
      ? " AND (" + vendors.map((v) => `vendor:"${v.replace(/"/g, '\\"')}"`).join(" OR ") + ")"
      : "";
  const res = await storefrontApiRequest<any>(PRODUCTS_QUERY, {
    first: 50,
    query: sinceQ + vendorQ,
    sortKey: "CREATED_AT",
    reverse: true,
  });
  const edges: ShopifyProduct[] = res?.data?.products?.edges ?? [];
  return edges.filter((e) => !isKidsProduct(e));
}

async function fetchLatestOverall(): Promise<ShopifyProduct[]> {
  const res = await storefrontApiRequest<any>(PRODUCTS_QUERY, {
    first: 24,
    query: "-tag:KIDS",
    sortKey: "CREATED_AT",
    reverse: true,
  });
  const edges: ShopifyProduct[] = res?.data?.products?.edges ?? [];
  return edges.filter((e) => !isKidsProduct(e));
}

function NewArrivalsPage() {
  const { ids } = useWishlist();

  const { data, isLoading } = useQuery({
    queryKey: ["new-arrivals", ids.slice().sort().join(",")],
    queryFn: async () => {
      const wishlisted = await fetchProductsByIds(ids);
      const vendors = Array.from(
        new Set(
          wishlisted
            .map((e) => (e.node.vendor ?? "").trim())
            .filter((v) => v.length > 0),
        ),
      );

      if (vendors.length === 0) {
        const latest = await fetchLatestOverall();
        return { personalised: false, vendors: [] as string[], products: latest };
      }

      const matches = await fetchNewArrivalsByVendors(vendors);
      // Fall back to overall latest if no vendor matches recently.
      const products = matches.length > 0 ? matches : await fetchLatestOverall();
      return { personalised: matches.length > 0, vendors, products };
    },
  });

  const products = data?.products ?? [];
  const personalised = data?.personalised ?? false;
  const vendors = data?.vendors ?? [];

  return (
    <MobileLayout>
      <div className="px-4 pt-6 pb-3">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
          Last {LOOKBACK_DAYS} days
        </p>
        <h1 className="font-serif text-3xl">New Arrivals</h1>
        {personalised ? (
          <p className="text-xs text-muted-foreground mt-2">
            Curated from the brands on your wishlist
            {vendors.length > 0 && (
              <>
                {": "}
                <span className="text-foreground">
                  {vendors.slice(0, 4).join(", ")}
                  {vendors.length > 4 ? ` +${vendors.length - 4} more` : ""}
                </span>
              </>
            )}
            .
          </p>
        ) : ids.length === 0 ? (
          <p className="text-xs text-muted-foreground mt-2">
            Save pieces to your{" "}
            <Link to="/wishlist" className="underline">
              wishlist
            </Link>{" "}
            to personalise this feed.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-2">
            Nothing new from your favourite brands this month — here's the latest edit.
          </p>
        )}
      </div>

      <section className="px-4 py-6">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-[3/4] bg-muted animate-pulse" />
                <div className="h-3 bg-muted animate-pulse w-1/2" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            No new arrivals right now. Check back soon.
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
