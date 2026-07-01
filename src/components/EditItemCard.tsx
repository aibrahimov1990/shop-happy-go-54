import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { useCartStore } from "@/stores/cartStore";
import {
  PRODUCT_BY_HANDLE_QUERY,
  storefrontApiRequest,
  formatPrice,
} from "@/lib/shopify";

interface Props {
  handle: string;
  title: string;
  imageUrl: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
}

export function EditItemCard({ handle, title, imageUrl, priceAmount, priceCurrency }: Props) {
  const [adding, setAdding] = useState(false);
  const addItem = useCartStore((s) => s.addItem);
  const navigate = useNavigate();

  const handleAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (adding) return;
    setAdding(true);
    try {
      const res = await storefrontApiRequest<{ product: any }>(PRODUCT_BY_HANDLE_QUERY, { handle });
      const product = res?.data?.product;
      if (!product) {
        toast.error("Product unavailable");
        return;
      }
      const variants = product.variants?.edges ?? [];
      const multipleOptions =
        variants.length > 1 ||
        (product.options?.length === 1 && product.options[0]?.values?.length > 1);
      if (multipleOptions) {
        navigate({ to: "/product/$handle", params: { handle } });
        return;
      }
      const v = variants[0]?.node;
      if (!v || !v.availableForSale) {
        toast.error("Sold out");
        return;
      }
      await addItem({
        product: { node: product },
        variantId: v.id,
        variantTitle: v.title,
        price: v.price,
        quantity: 1,
        selectedOptions: v.selectedOptions ?? [],
      });
      toast.success("Added to bag", { description: product.title });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="block">
      <Link to="/product/$handle" params={{ handle }} className="block">
        <div className="aspect-[3/4] bg-muted overflow-hidden mb-2">
          {imageUrl && (
            <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
          )}
        </div>
        <p className="text-xs leading-tight line-clamp-2">{title}</p>
        {priceAmount != null && (
          <p className="text-xs text-muted-foreground mt-1">
            {formatPrice(priceAmount, priceCurrency ?? "GBP")}
          </p>
        )}
      </Link>
      <Button
        onClick={handleAdd}
        disabled={adding}
        variant="outline"
        size="sm"
        className="mt-2 w-full h-9 text-[10px] uppercase tracking-[0.2em]"
      >
        {adding ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <>
            <ShoppingBag className="h-3 w-3 mr-1.5" /> Add to Bag
          </>
        )}
      </Button>
    </div>
  );
}
