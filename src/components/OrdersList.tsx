import { formatPrice } from "@/lib/shopify";
import type { ShopifyOrderSummary } from "@/lib/orders.functions";
import { Package } from "lucide-react";

interface Props {
  orders: ShopifyOrderSummary[];
  emptyLabel?: string;
}

function statusLabel(o: ShopifyOrderSummary) {
  if (o.cancelledAt) return "Cancelled";
  if (o.fulfillmentStatus === "fulfilled") return "Fulfilled";
  if (o.fulfillmentStatus === "partial") return "Partially fulfilled";
  if (o.financialStatus === "refunded") return "Refunded";
  if (o.financialStatus === "paid") return "Paid";
  if (o.financialStatus === "pending") return "Pending";
  return o.financialStatus ?? "Processing";
}

export function OrdersList({ orders, emptyLabel = "No orders yet." }: Props) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-16">
        <Package className="h-8 w-8 mx-auto mb-4 text-muted-foreground" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/60">
      {orders.map((o) => {
        const date = new Date(o.createdAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        const status = statusLabel(o);
        const cancelled = !!o.cancelledAt;
        const content = (
          <div className="py-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <p className="font-serif text-base leading-tight">Order {o.name}</p>
                <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mt-1">
                  {date} · {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
                  {o.isAppOrder ? " · App" : ""}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm">{formatPrice(o.totalPrice, o.currency)}</p>
                <p
                  className={`text-[10px] uppercase tracking-[0.25em] mt-1 ${
                    cancelled ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {status}
                </p>
              </div>
            </div>
            {o.lineItems.length > 0 && (
              <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
                {o.lineItems
                  .map((li) =>
                    li.quantity > 1 ? `${li.title} ×${li.quantity}` : li.title,
                  )
                  .join(", ")}
              </p>
            )}
          </div>
        );

        return (
          <li key={o.id}>
            {o.orderStatusUrl ? (
              <a
                href={o.orderStatusUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block active:bg-muted/40 -mx-4 px-4"
              >
                {content}
              </a>
            ) : (
              <div className="-mx-4 px-4">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
