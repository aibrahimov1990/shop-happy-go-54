import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MobileLayout } from "@/components/MobileLayout";
import { ProductCard } from "@/components/ProductCard";
import { storefrontApiRequest, PRODUCTS_QUERY, type ShopifyProduct } from "@/lib/shopify";
import { useWishlist } from "@/hooks/useWishlist";

export const Route = createFileRoute("/wishlist")({
  head: () => ({
    meta: [
      { title: "Wishlist — Sellier Knightsbridge" },
      { name: "description", content: "Your saved pieces from Sellier." },
    ],
  }),
  component: WishlistPage,
});

function WishlistPage() {
  const { ids } = useWishlist();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["wishlist-products", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async (): Promise<ShopifyProduct[]> => {
      // ids look like gid://shopify/Product/123 — search by id
      const q = ids.map((id) => `id:${id.split("/").pop()}`).join(" OR ");
      const res = await storefrontApiRequest<any>(PRODUCTS_QUERY, {
        first: 50,
        query: q,
      });
      return res?.data?.products?.edges ?? [];
    },
  });

  return (
    <MobileLayout>
      <div className="px-4 pt-6 pb-3">
        <h1 className="font-serif text-3xl">Wishlist</h1>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mt-1">
          {ids.length} {ids.length === 1 ? "piece" : "pieces"} saved
        </p>
      </div>

      <section className="px-4 py-6">
        {ids.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground mb-6">
              You haven't saved anything yet. Tap the heart on a piece to save it here.
            </p>
            <Link
              to="/shop"
              className="inline-block bg-foreground text-background px-6 py-3 text-[11px] uppercase tracking-[0.25em]"
            >
              Browse the shop
            </Link>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6">
            {Array.from({ length: Math.min(ids.length, 4) }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-[3/4] bg-muted animate-pulse" />
                <div className="h-3 bg-muted animate-pulse w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6">
            {products.map((p) => (
              <ProductCard key={p.node.id} product={p} showAddToBag />
            ))}
          </div>
        )}
      </section>
    </MobileLayout>
  );
}
