import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MobileLayout } from "@/components/MobileLayout";
import { ProductCard } from "@/components/ProductCard";
import { HermesBanner } from "@/components/HermesBanner";
import { storefrontApiRequest, isKidsProduct, type ShopifyProduct } from "@/lib/shopify";
import React, { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

const HERMES_HANDLE = "hermes-bags-birkin-kelly-london";

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

export const Route = createFileRoute("/collections/$handle")({
  head: ({ params }) => {
    const pretty = params.handle
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    return {
      meta: [
        { title: `${pretty} — Sellier Knightsbridge` },
        { name: "description", content: `Shop the ${pretty} collection at Sellier.` },
        { property: "og:title", content: `${pretty} — Sellier Knightsbridge` },
        { property: "og:description", content: `Shop the ${pretty} collection at Sellier.` },
      ],
    };
  },
  component: CollectionPage,
});

function CollectionPage() {
  const { handle } = Route.useParams();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["collection", handle],
      initialPageParam: null as string | null,
      queryFn: async ({ pageParam }) => {
        const res = await storefrontApiRequest<any>(COLLECTION_QUERY, {
          handle,
          first: 24,
          after: pageParam,
        });
        const collection = res?.data?.collection;
        return {
          title: collection?.title ?? null,
          edges: (collection?.products?.edges ?? []) as ShopifyProduct[],
          endCursor: collection?.products?.pageInfo?.endCursor ?? null,
          hasNextPage: collection?.products?.pageInfo?.hasNextPage ?? false,
          exists: !!collection,
        };
      },
      getNextPageParam: (last) => (last.hasNextPage ? last.endCursor : undefined),
    });

  const first = data?.pages[0];
  const rawProducts: ShopifyProduct[] = data?.pages.flatMap((p) => p.edges) ?? [];
  // Never show KIDS-tagged products in general collections. If someone opens a
  // kids-specific collection directly (handle contains "kids"), keep them.
  const isKidsCollection = handle.toLowerCase().includes("kids");
  const withoutKids = isKidsCollection ? rawProducts : rawProducts.filter((p) => !isKidsProduct(p));
  // Hide sold-out products for selected collections
  const HIDE_SOLD_OUT_HANDLES = new Set(["bags-under-2-500"]);
  const products: ShopifyProduct[] = HIDE_SOLD_OUT_HANDLES.has(handle)
    ? withoutKids.filter((p) =>
        p.node.variants.edges.some((v) => v.node.availableForSale),
      )
    : withoutKids;
  const title = first?.title ?? handle.replace(/-/g, " ");

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
      <div className="px-4 pt-6 pb-4 border-b border-border/60">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1">
          Collection
        </p>
        <h1 className="font-serif text-3xl capitalize">{title}</h1>
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
        ) : !first?.exists ? (
          <div className="text-center py-16 space-y-4">
            <p className="text-sm text-muted-foreground">
              Collection "{handle}" not found.
            </p>
            <Link
              to="/shop"
              className="inline-block text-[11px] uppercase tracking-[0.25em] underline"
            >
              Browse all products
            </Link>
          </div>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            No products in this collection yet.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-6">
              {products.map((p, i) => (
                <React.Fragment key={p.node.id}>
                  <ProductCard product={p} />
                  {handle !== HERMES_HANDLE && (i + 1) % 20 === 0 && i < products.length - 1 && (
                    <HermesBanner variant={((i + 1) / 20) % 2 === 1 ? 1 : 2} />
                  )}
                </React.Fragment>
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
