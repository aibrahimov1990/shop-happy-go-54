import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MobileLayout } from "@/components/MobileLayout";
import { ProductCard } from "@/components/ProductCard";
import { storefrontApiRequest, isKidsProduct, type ShopifyProduct } from "@/lib/shopify";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

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

const NEW_DROPS_HANDLE = "new-drops";

const COLLECTION_QUERY = `
  query GetCollection($handle: String!, $first: Int!, $after: String) {
    collection(handle: $handle) {
      id
      title
      description
      products(first: $first, after: $after, sortKey: COLLECTION_DEFAULT) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            title
            description
            handle
            vendor
            tags
            priceRange { minVariantPrice { amount currencyCode } }
            images(first: 5) { edges { node { url(transform: { preferredContentType: JPG }) altText } } }
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
    }
  }
`;

function NewArrivalsPage() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["collection", NEW_DROPS_HANDLE, "new-arrivals"],
      initialPageParam: null as string | null,
      queryFn: async ({ pageParam }) => {
        const res = await storefrontApiRequest<any>(COLLECTION_QUERY, {
          handle: NEW_DROPS_HANDLE,
          first: 24,
          after: pageParam,
        });
        const collection = res?.data?.collection;
        return {
          edges: (collection?.products?.edges ?? []) as ShopifyProduct[],
          endCursor: collection?.products?.pageInfo?.endCursor ?? null,
          hasNextPage: collection?.products?.pageInfo?.hasNextPage ?? false,
        };
      },
      getNextPageParam: (last) => (last.hasNextPage ? last.endCursor : undefined),
    });

  const rawProducts: ShopifyProduct[] = data?.pages.flatMap((p) => p.edges) ?? [];
  const products: ShopifyProduct[] = rawProducts
    .filter((p) => !isKidsProduct(p))
    .filter((p) => p.node.variants.edges.some((v) => v.node.availableForSale));

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <MobileLayout>
      <div className="px-4 pt-6 pb-3">
        <h1 className="font-serif text-3xl">New Arrivals</h1>
        <p className="text-xs text-muted-foreground mt-2">
          The latest pieces to land at Sellier.
        </p>
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
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-6">
              {products.map((p) => (
                <ProductCard key={p.node.id} product={p} />
              ))}
            </div>
            <div ref={sentinelRef} className="h-10" />
            {isFetchingNextPage && (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!hasNextPage && products.length > 0 && (
              <p className="text-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground py-8">
                End of results
              </p>
            )}
          </>
        )}
      </section>
    </MobileLayout>
  );
}
