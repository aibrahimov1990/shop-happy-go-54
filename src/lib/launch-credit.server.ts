// Server-only helpers for the launch credit promotion.
//
// These MUST live outside launch-credit.functions.ts: the server-function
// splitter strips everything but the exported createServerFn declarations from
// that module, so module-scope helpers there vanish at runtime and the server
// function fails with "Invalid server function ID".

const SHOP_DOMAIN = "sellier-knightsbridge.myshopify.com";
const API_VERSION = "2025-07";

export function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `SLR100-${s}`;
}

export function normaliseEmail(raw: string): { normalised: string; domain: string } {
  const trimmed = raw.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return { normalised: trimmed, domain: "" };
  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return { normalised: `${local}@${domain}`, domain };
}

export async function shopifyGraphQL(query: string, variables: Record<string, unknown>) {
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

export const DISCOUNT_CREATE = `
mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
    codeDiscountNode { id }
    userErrors { field message code }
  }
}`;

export const DISCOUNT_DEACTIVATE = `
mutation discountCodeDeactivate($id: ID!) {
  discountCodeDeactivate(id: $id) {
    userErrors { field message code }
  }
}`;

export const DISCOUNT_BULK_DEACTIVATE = `
mutation BulkDeactivate($ids: [ID!]) {
  discountCodeBulkDeactivate(ids: $ids) {
    job { id done }
    userErrors { field message code }
  }
}`;

const DISCOUNT_USAGE_QUERY = `
query DiscountUsage($id: ID!) {
  codeDiscountNode(id: $id) {
    codeDiscount {
      ... on DiscountCodeBasic {
        asyncUsageCount
      }
    }
  }
}`;

export async function getDiscountUsageCount(id: string): Promise<number> {
  try {
    const data = await shopifyGraphQL(DISCOUNT_USAGE_QUERY, { id });
    return data?.codeDiscountNode?.codeDiscount?.asyncUsageCount ?? 0;
  } catch {
    return 0;
  }
}

type SupabaseAdmin = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

export async function adminGate(supabaseAdmin: SupabaseAdmin, userId: string) {
  const { data: adminRow, error } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!adminRow) throw new Error("Forbidden");
}
