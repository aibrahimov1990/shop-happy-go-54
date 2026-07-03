import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ShopifyOrderLineItem {
  id: number;
  title: string;
  variant_title: string | null;
  quantity: number;
  price: string;
  product_id: number | null;
  image?: string | null;
}

export interface ShopifyOrderSummary {
  id: number;
  name: string; // e.g. "#1234"
  createdAt: string;
  totalPrice: string;
  currency: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  cancelledAt: string | null;
  orderStatusUrl: string | null;
  itemCount: number;
  lineItems: ShopifyOrderLineItem[];
  isAppOrder: boolean;
}

const DOMAIN = "sellier-knightsbridge.myshopify.com";
const VERSION = "2025-07";

async function fetchOrdersByEmail(email: string): Promise<ShopifyOrderSummary[]> {
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!token) return [];
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];

  const fields = [
    "id",
    "name",
    "email",
    "created_at",
    "total_price",
    "currency",
    "financial_status",
    "fulfillment_status",
    "cancelled_at",
    "order_status_url",
    "note_attributes",
    "source_name",
    "line_items",
  ].join(",");

  const orders: ShopifyOrderSummary[] = [];
  let url: string | null =
    `https://${DOMAIN}/admin/api/${VERSION}/orders.json?status=any&email=${encodeURIComponent(normalized)}&limit=250&fields=${fields}`;

  // Paginate defensively (customers rarely have >250 orders, but be safe)
  while (url) {
    const res: Response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    });
    if (!res.ok) break;
    const json: any = await res.json();
    for (const o of json.orders ?? []) {
      const attrs: Array<{ name?: string; value?: string }> = o.note_attributes ?? [];
      const isAppOrder = attrs.some(
        (a) =>
          (a.name === "channel" && a.value === "mobile_app") ||
          (a.name === "source" && (a.value === "ios_app" || a.value === "android_app")),
      );
      const items: ShopifyOrderLineItem[] = (o.line_items ?? []).map((li: any) => ({
        id: li.id,
        title: li.title,
        variant_title: li.variant_title ?? null,
        quantity: li.quantity ?? 1,
        price: li.price ?? "0",
        product_id: li.product_id ?? null,
      }));
      orders.push({
        id: o.id,
        name: o.name,
        createdAt: o.created_at,
        totalPrice: o.total_price ?? "0",
        currency: o.currency ?? "GBP",
        financialStatus: o.financial_status ?? null,
        fulfillmentStatus: o.fulfillment_status ?? null,
        cancelledAt: o.cancelled_at ?? null,
        orderStatusUrl: o.order_status_url ?? null,
        itemCount: items.reduce((s, li) => s + li.quantity, 0),
        lineItems: items,
        isAppOrder,
      });
    }
    const link = res.headers.get("link") ?? "";
    const next = /<([^>]+)>;\s*rel="next"/.exec(link);
    url = next ? next[1] : null;
  }

  orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return orders;
}

/**
 * Signed-in client fetching their own Shopify order history (matched by account email).
 */
export const getMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();

    const email = profile?.email;
    if (!email) return { email: null as string | null, orders: [] as ShopifyOrderSummary[] };

    const orders = await fetchOrdersByEmail(email);
    return { email, orders };
  });

/**
 * Shopper/admin fetching a specific client's Shopify order history by their app userId.
 */
export const getClientOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientUserId: string }) => {
    if (!input?.clientUserId || typeof input.clientUserId !== "string") {
      throw new Error("clientUserId required");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: isShopper }, { data: isAdmin }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "shopper" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);
    if (!isShopper && !isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: profile } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("id", data.clientUserId)
      .maybeSingle();

    const email = profile?.email;
    if (!email) return { email: null as string | null, orders: [] as ShopifyOrderSummary[] };

    const orders = await fetchOrdersByEmail(email);
    return { email, orders };
  });
