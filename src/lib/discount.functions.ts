import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SHOP_DOMAIN = "sellier-knightsbridge.myshopify.com";
const API_VERSION = "2025-07";

// Entitled Shopify collections — Clothing + Shoes sub-collections only.
// NOTE: We intentionally do NOT use "All Clothing" (163159113803) or "All Shoes"
// (163159375947) because in this store those collections are miscurated and
// contain Bags and Accessories, which would leak the discount to them.
const ENTITLED_COLLECTION_GIDS = [
  // Clothing sub-collections
  "gid://shopify/Collection/163157049419", // Tops
  "gid://shopify/Collection/163157147723", // Co-ords
  "gid://shopify/Collection/163157213259", // Jumpsuit
  "gid://shopify/Collection/163157311563", // Knitwear
  "gid://shopify/Collection/163157377099", // Skirts
  "gid://shopify/Collection/163157508171", // Trousers
  "gid://shopify/Collection/163157868619", // Coats & Jackets
  "gid://shopify/Collection/163158655051", // Dresses
  // Shoes sub-collections
  "gid://shopify/Collection/163157442635", // Boots
  "gid://shopify/Collection/163157704779", // Pumps
  "gid://shopify/Collection/163158523979", // Heels
  "gid://shopify/Collection/163158589515", // Sandals
  "gid://shopify/Collection/163158622283", // Trainers
];

function generateCode(): string {
  // e.g. SELLIER-APP-XXXX (uppercase, no ambiguous chars)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `APP15-${s}`;
}

async function shopifyGraphQL(query: string, variables: Record<string, unknown>) {
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
  if (!token) throw new Error("Missing Shopify admin access token");
  const res = await fetch(`https://${SHOP_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors).slice(0, 300));
  return json.data;
}

const DISCOUNT_CREATE = `
mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
    codeDiscountNode { id }
    userErrors { field message code }
  }
}`;

async function createShopifyDiscount(code: string): Promise<string> {
  const startsAt = new Date().toISOString();
  const data = await shopifyGraphQL(DISCOUNT_CREATE, {
    basicCodeDiscount: {
      title: `App First Order 15% — ${code}`,
      code,
      startsAt,
      customerSelection: { all: true },
      customerGets: {
        value: { percentage: 0.15 },
        items: { collections: { add: ENTITLED_COLLECTION_GIDS } },
      },
      appliesOncePerCustomer: true,
      usageLimit: 1,
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true },
    },
  });
  const errs = data?.discountCodeBasicCreate?.userErrors ?? [];
  if (errs.length) throw new Error(errs.map((e: any) => e.message).join("; "));
  return data.discountCodeBasicCreate.codeDiscountNode.id as string;
}

export const getOrCreateFirstOrderDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: readErr } = await supabaseAdmin
      .from("app_first_order_discounts")
      .select("code, shopify_discount_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (existing) {
      return {
        code: existing.code,
        percentOff: 15,
        scope: "Clothing & Shoes only",
      };
    }

    // Try up to 3 times in case of a code collision.
    let lastErr: unknown = null;
    for (let i = 0; i < 3; i++) {
      const code = generateCode();
      try {
        const shopifyId = await createShopifyDiscount(code);
        const { error: insErr } = await supabaseAdmin
          .from("app_first_order_discounts")
          .insert({ user_id: context.userId, code, shopify_discount_id: shopifyId });
        if (insErr) throw new Error(insErr.message);
        return { code, percentOff: 15, scope: "Clothing & Shoes only" };
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(
      `Could not create discount code. ${lastErr instanceof Error ? lastErr.message : ""}`,
    );
  });
