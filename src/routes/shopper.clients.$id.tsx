import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MobileLayout } from "@/components/MobileLayout";
import { ProductCard } from "@/components/ProductCard";
import { useAuth } from "@/hooks/useAuth";
import { getClientWishlist } from "@/lib/wishlists.functions";
import { storefrontApiRequest, PRODUCTS_QUERY, type ShopifyProduct } from "@/lib/shopify";
import { Loader2, ChevronLeft, Heart } from "lucide-react";

export const Route = createFileRoute("/shopper/clients/$id")({
  head: () => ({
    meta: [
      { title: "Client Wishlist — Sellier Shopper" },
      { name: "description", content: "Pieces this client has saved." },
    ],
  }),
  component: ClientWishlistPage,
  errorComponent: ({ error }) => (
    <MobileLayout>
      <div className="px-6 py-16 text-center text-sm text-muted-foreground">{error.message}</div>
    </MobileLayout>
  ),
  notFoundComponent: () => <MobileLayout><div className="p-8">Not found</div></MobileLayout>,
});

function ClientWishlistPage() {
  const { user, loading, isShopper } = useAuth();
  const navigate = useNavigate();
  const { id } = Route.useParams();
  const fetchClient = useServerFn(getClientWishlist);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { next: `/shopper/clients/${id}` } });
  }, [loading, user, navigate, id]);

  const { data, isLoading } = useQuery({
    queryKey: ["shopper-client-wishlist", id],
    queryFn: () => fetchClient({ data: { clientUserId: id } }),
    enabled: !!user && isShopper,
  });

  const productIds = data?.productIds ?? [];

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["shopper-client-wishlist-products", id, productIds.join(",")],
    enabled: productIds.length > 0,
    queryFn: async (): Promise<ShopifyProduct[]> => {
      const NODES_QUERY = `
        query GetProductsByIds($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              description
              handle
              vendor
              tags
              priceRange { minVariantPrice { amount currencyCode } }
              images(first: 5) { edges { node { url altText } } }
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    price { amount currencyCode }
                    availableForSale
                    selectedOptions { name value }
                  }
                }
              }
              options { name values }
            }
          }
        }
      `;
      const res = await storefrontApiRequest<any>(NODES_QUERY, { ids: productIds });
      const nodes = (res?.data?.nodes ?? []).filter(Boolean);
      return nodes.map((node: any) => ({ node }));
    },
  });

  if (loading || (user && isShopper && isLoading)) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  if (user && !isShopper) {
    return (
      <MobileLayout>
        <div className="px-6 py-16 text-center">
          <h1 className="font-serif text-2xl mb-2">Shoppers only</h1>
          <Link to="/account" className="text-xs uppercase tracking-[0.25em] underline">Back</Link>
        </div>
      </MobileLayout>
    );
  }

  const client = data?.client;

  return (
    <MobileLayout>
      <div className="px-6 pt-6 pb-4 border-b border-border/60">
        <Link to="/shopper/clients" className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
          <ChevronLeft className="h-3 w-3" /> Clients
        </Link>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1">Wishlist</p>
        <h1 className="font-serif text-2xl leading-tight">
          {client?.full_name || client?.email || "Client"}
        </h1>
        {client?.full_name && (
          <p className="text-xs text-muted-foreground mt-1">{client.email}</p>
        )}
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mt-2">
          {productIds.length} {productIds.length === 1 ? "piece" : "pieces"} saved
        </p>
      </div>

      <section className="px-4 py-6">
        {productIds.length === 0 ? (
          <div className="text-center py-16">
            <Heart className="h-8 w-8 mx-auto mb-4 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">Nothing saved yet.</p>
          </div>
        ) : productsLoading ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6">
            {Array.from({ length: Math.min(productIds.length, 4) }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-[3/4] bg-muted animate-pulse" />
                <div className="h-3 bg-muted animate-pulse w-1/2" />
              </div>
            ))}
          </div>
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
