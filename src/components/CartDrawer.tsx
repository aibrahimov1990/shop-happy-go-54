import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ShoppingBag, Minus, Plus, Trash2, Loader2 } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";
import { formatPrice } from "@/lib/shopify";

export function CartDrawer({
  open,
  onOpenChange,
  trigger,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger?: React.ReactNode;
}) {
  const { items, isLoading, isSyncing, updateQuantity, removeItem, getCheckoutUrl, syncCart } =
    useCartStore();
  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const currency = items[0]?.price.currencyCode ?? "GBP";
  const totalPrice = items.reduce(
    (s, i) => s + parseFloat(i.price.amount) * i.quantity,
    0,
  );

  useEffect(() => {
    if (open) syncCart();
  }, [open, syncCart]);

  const handleCheckout = () => {
    const url = getCheckoutUrl();
    if (url) {
      window.open(url, "_blank");
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger ? (
        <SheetTrigger asChild>{trigger}</SheetTrigger>
      ) : null}
      <SheetContent className="w-full sm:max-w-md flex flex-col h-full bg-background">
        <SheetHeader className="flex-shrink-0 border-b pb-4">
          <SheetTitle className="font-serif text-2xl tracking-wide">Your Bag</SheetTitle>
          <SheetDescription className="text-xs uppercase tracking-widest">
            {totalItems === 0 ? "Empty" : `${totalItems} item${totalItems !== 1 ? "s" : ""}`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col flex-1 pt-4 min-h-0">
          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="text-center">
                <ShoppingBag className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-6">Your bag is empty</p>
                <Button
                  onClick={() => onOpenChange(false)}
                  variant="outline"
                  className="rounded-none h-11 px-6 text-xs tracking-[0.2em] uppercase"
                >
                  Continue Shopping
                </Button>
              </div>
            </div>

          ) : (
            <>
              <div className="flex-1 overflow-y-auto pr-1 min-h-0">
                <div className="space-y-5">
                  {items.map((item) => {
                    const img = item.product.node.images?.edges?.[0]?.node;
                    return (
                      <div key={item.variantId} className="flex gap-3">
                        <div className="w-20 h-24 bg-muted overflow-hidden flex-shrink-0">
                          {img && (
                            <img
                              src={img.url}
                              alt={img.altText ?? item.product.node.title}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            {item.product.node.vendor && (
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                                {item.product.node.vendor}
                              </p>
                            )}
                            <h4 className="font-serif text-sm leading-tight truncate">
                              {item.product.node.title}
                            </h4>
                            {item.selectedOptions.length > 0 && item.variantTitle !== "Default Title" && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {item.selectedOptions.map((o) => o.value).join(" · ")}
                              </p>
                            )}
                            <p className="text-sm mt-1">
                              {formatPrice(item.price.amount, item.price.currencyCode)}
                            </p>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center border">
                              <button
                                onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                                className="h-7 w-7 flex items-center justify-center hover:bg-muted"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="w-7 text-center text-xs">{item.quantity}</span>
                              <button
                                onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                                className="h-7 w-7 flex items-center justify-center hover:bg-muted"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                            <button
                              onClick={() => removeItem(item.variantId)}
                              className="text-muted-foreground hover:text-foreground"
                              aria-label="Remove"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex-shrink-0 pt-4 border-t space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">
                    Subtotal
                  </span>
                  <span className="font-serif text-xl">
                    {formatPrice(totalPrice, currency)}
                  </span>
                </div>
                <Button
                  onClick={handleCheckout}
                  className="w-full rounded-none h-12 text-xs tracking-[0.2em] uppercase"
                  disabled={items.length === 0 || isLoading || isSyncing}
                >
                  {isLoading || isSyncing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Checkout"
                  )}
                </Button>
                <button
                  onClick={() => onOpenChange(false)}
                  className="w-full text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground py-1"
                >
                  Continue Shopping
                </button>
                <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest">
                  Secure checkout via Shopify
                </p>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}


export function CartButton({ onClick }: { onClick: () => void }) {
  const totalItems = useCartStore((s) => s.items.reduce((a, b) => a + b.quantity, 0));
  return (
    <button
      onClick={onClick}
      className="relative p-2 -mr-2"
      aria-label="Open cart"
    >
      <ShoppingBag className="h-5 w-5" />
      {totalItems > 0 && (
        <Badge className="absolute -top-0 -right-0 h-4 min-w-4 rounded-full p-0 px-1 flex items-center justify-center text-[10px] bg-foreground text-background">
          {totalItems}
        </Badge>
      )}
    </button>
  );
}
