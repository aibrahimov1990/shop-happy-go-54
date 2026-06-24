import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { MobileLayout } from "@/components/MobileLayout";
import {
  storefrontApiRequest,
  PRODUCT_BY_HANDLE_QUERY,
  formatPrice,
  type ShopifyVariant,
} from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import { toast } from "sonner";

export const Route = createFileRoute("/product/$handle")({
  component: ProductPage,
});

function ProductPage() {
  const { handle } = Route.useParams();
  const navigate = useNavigate();
  const addItem = useCartStore((s) => s.addItem);
  const isLoading = useCartStore((s) => s.isLoading);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [imgIdx, setImgIdx] = useState(0);

  const { data, isLoading: loadingProduct } = useQuery({
    queryKey: ["product", handle],
    queryFn: async () => {
      const res = await storefrontApiRequest<any>(PRODUCT_BY_HANDLE_QUERY, { handle });
      return res?.data?.product;
    },
  });

  const variants: ShopifyVariant[] =
    data?.variants?.edges?.map((e: any) => e.node) ?? [];
  const selectedVariant =
    variants.find((v) => v.id === variantId) ?? variants[0];

  useEffect(() => {
    if (!variantId && variants[0]) setVariantId(variants[0].id);
  }, [variants, variantId]);

  const handleAdd = async () => {
    if (!selectedVariant || !data) return;
    await addItem({
      product: { node: data },
      variantId: selectedVariant.id,
      variantTitle: selectedVariant.title,
      price: selectedVariant.price,
      quantity: 1,
      selectedOptions: selectedVariant.selectedOptions ?? [],
    });
    toast.success("Added to bag", { position: "top-center" });
  };

  if (loadingProduct) {
    return (
      <MobileLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  if (!data) {
    return (
      <MobileLayout>
        <div className="px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">Product not found.</p>
        </div>
      </MobileLayout>
    );
  }

  const images: Array<{ url: string; altText: string | null }> =
    data.images?.edges?.map((e: any) => e.node) ?? [];

  return (
    <MobileLayout>
      <div className="relative">
        <button
          onClick={() => navigate({ to: "/shop" })}
          className="absolute top-3 left-3 z-10 h-9 w-9 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-full"
          aria-label="Back"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="aspect-square w-full bg-muted overflow-hidden">
          {images[imgIdx] && (
            <img
              src={images[imgIdx].url}
              alt={images[imgIdx].altText ?? data.title}
              className="h-full w-full object-cover"
            />
          )}
        </div>

        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => setImgIdx(i)}
                className={`shrink-0 w-14 h-14 border ${
                  i === imgIdx ? "border-foreground" : "border-border"
                }`}
              >
                <img src={img.url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-6">
        {data.vendor && (
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
            {data.vendor}
          </p>
        )}
        <h1 className="font-serif text-2xl leading-tight">{data.title}</h1>
        <p className="font-serif text-xl mt-2">
          {formatPrice(
            selectedVariant?.price.amount ?? data.priceRange.minVariantPrice.amount,
            selectedVariant?.price.currencyCode ?? data.priceRange.minVariantPrice.currencyCode,
          )}
        </p>

        {variants.length > 1 && (
          <div className="mt-6">
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
              Options
            </p>
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => (
                <button
                  key={v.id}
                  disabled={!v.availableForSale}
                  onClick={() => setVariantId(v.id)}
                  className={`px-3 py-2 text-xs border transition-colors ${
                    v.id === selectedVariant?.id
                      ? "bg-foreground text-background border-foreground"
                      : "border-border"
                  } ${!v.availableForSale ? "opacity-40 line-through" : ""}`}
                >
                  {v.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleAdd}
          disabled={isLoading || !selectedVariant?.availableForSale}
          className="mt-6 w-full h-12 bg-foreground text-background text-[11px] uppercase tracking-[0.25em] disabled:opacity-50 flex items-center justify-center"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : selectedVariant?.availableForSale ? (
            "Add to Bag"
          ) : (
            "Sold Out"
          )}
        </button>

        {(data.descriptionHtml || data.description) && (
          <div className="mt-8 pt-6 border-t border-border/60">
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
              Details
            </p>
            <div
              className="product-description text-sm leading-relaxed text-foreground/80"
              dangerouslySetInnerHTML={{
                __html: data.descriptionHtml || data.description,
              }}
            />
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
