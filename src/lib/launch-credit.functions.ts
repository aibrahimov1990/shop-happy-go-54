import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SHOP_DOMAIN = "sellier-knightsbridge.myshopify.com";
const API_VERSION = "2025-07";

function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `SLR100-${s}`;
}

function normaliseEmail(raw: string): { normalised: string; domain: string } {
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

const CUSTOMER_SEARCH = `
query FindCustomer($q: String!) {
  customers(first: 1, query: $q) {
    edges { node { id } }
  }
}`;

const CUSTOMER_CREATE = `
mutation customerCreate($input: CustomerInput!) {
  customerCreate(input: $input) {
    customer { id }
    userErrors { field message }
  }
}`;

const DISCOUNT_CREATE = `
mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
    codeDiscountNode { id }
    userErrors { field message code }
  }
}`;

const DISCOUNT_DEACTIVATE = `
mutation discountCodeDeactivate($id: ID!) {
  discountCodeDeactivate(id: $id) {
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

async function getDiscountUsageCount(id: string): Promise<number> {
  try {
    const data = await shopifyGraphQL(DISCOUNT_USAGE_QUERY, { id });
    return data?.codeDiscountNode?.codeDiscount?.asyncUsageCount ?? 0;
  } catch {
    return 0;
  }
}

function escapeQuery(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

async function resolveShopifyCustomerId(email: string, fullName: string | null): Promise<string> {
  const found = await shopifyGraphQL(CUSTOMER_SEARCH, { q: `email:"${escapeQuery(email)}"` });
  const existing = found?.customers?.edges?.[0]?.node?.id as string | undefined;
  if (existing) return existing;

  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const input: Record<string, unknown> = { email };
  if (parts.length) {
    input.firstName = parts[0];
    if (parts.length > 1) input.lastName = parts.slice(1).join(" ");
  }
  const created = await shopifyGraphQL(CUSTOMER_CREATE, { input });
  const errs = created?.customerCreate?.userErrors ?? [];
  if (errs.length) throw new Error(errs.map((e: any) => e.message).join("; "));
  const id = created?.customerCreate?.customer?.id as string | undefined;
  if (!id) throw new Error("Could not resolve a Shopify customer for this email");
  return id;
}

export const getOrCreateLaunchCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: config, error: cfgErr } = await supabaseAdmin
      .from("launch_credit_config")
      .select("enabled, amount_gbp, starts_at, ends_at, max_codes, require_verified_email")
      .eq("id", 1)
      .maybeSingle();
    if (cfgErr) throw new Error(cfgErr.message);
    if (!config || !config.enabled) return { status: "disabled" as const };

    const amount = Number(config.amount_gbp);

    const readOwn = async () => {
      const { data, error } = await supabaseAdmin
        .from("app_launch_credits")
        .select(
          "code, email, shopify_discount_id, shopify_customer_id, revoked_at, redeemed_at",
        )
        .eq("user_id", context.userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    };


    const createShopifyDiscount = async (code: string, customerGid: string) => {
      const data = await shopifyGraphQL(DISCOUNT_CREATE, {
        basicCodeDiscount: {
          title: `App Launch £100 — ${code}`,
          code,
          startsAt: config.starts_at,
          endsAt: config.ends_at,
          customerSelection: { customers: { add: [customerGid] } },
          customerGets: {
            value: { discountAmount: { amount, appliesOnEachItem: false } },
            items: { all: true },
          },
          appliesOncePerCustomer: true,
          usageLimit: 1,
          combinesWith: {
            orderDiscounts: false,
            productDiscounts: false,
            shippingDiscounts: true,
          },
        },
      });
      const errs = data?.discountCodeBasicCreate?.userErrors ?? [];
      if (errs.length) throw new Error(errs.map((e: any) => e.message).join("; "));
      return data.discountCodeBasicCreate.codeDiscountNode.id as string;
    };

    const buildExisting = async (row: {
      code: string;
      shopify_discount_id: string | null;
      revoked_at: string | null;
    }) => {
      const usage = row.shopify_discount_id
        ? await getDiscountUsageCount(row.shopify_discount_id)
        : 0;
      if (usage > 0) {
        await supabaseAdmin
          .from("app_launch_credits")
          .update({ redeemed_at: new Date().toISOString() })
          .eq("code", row.code)
          .is("redeemed_at", null);
      }
      return {
        status: row.revoked_at ? ("revoked" as const) : ("issued" as const),
        code: row.code,
        amount,
        startsAt: config.starts_at,
        endsAt: config.ends_at,
        used: usage > 0,
      };
    };

    const existing = await readOwn();
    if (existing) {
      if (existing.shopify_discount_id) return buildExisting(existing);
      // Reserved but incomplete: finish creating the Shopify discount for the
      // code already stored on the row, then update it in place.
      const { data: profileRow } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", context.userId)
        .maybeSingle();
      const customerGid =
        existing.shopify_customer_id ??
        (await resolveShopifyCustomerId(existing.email, profileRow?.full_name ?? null));
      const shopifyId = await createShopifyDiscount(existing.code, customerGid);
      const { error: updErr } = await supabaseAdmin
        .from("app_launch_credits")
        .update({ shopify_discount_id: shopifyId, shopify_customer_id: customerGid })
        .eq("code", existing.code);
      if (updErr) throw new Error(updErr.message);
      return {
        status: existing.revoked_at ? ("revoked" as const) : ("issued" as const),
        code: existing.code,
        amount,
        startsAt: config.starts_at,
        endsAt: config.ends_at,
        used: false,
      };
    }


    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    );
    if (authErr) throw new Error(authErr.message);
    const user = authUser?.user;
    if (!user?.email) return { status: "ineligible" as const };

    if (config.require_verified_email && !user.email_confirmed_at) {
      const hasVerifiedOAuth = (user.identities ?? []).some(
        (i) => i.provider !== "email" && (i.identity_data as any)?.email_verified !== false,
      );
      if (!hasVerifiedOAuth) return { status: "unverified" as const };
    }

    const { normalised, domain } = normaliseEmail(user.email);

    const { data: blocked, error: blockedErr } = await supabaseAdmin
      .from("launch_credit_blocked_domains")
      .select("domain")
      .eq("domain", domain)
      .maybeSingle();
    if (blockedErr) throw new Error(blockedErr.message);
    if (blocked) return { status: "ineligible" as const };

    const { data: claimed, error: claimedErr } = await supabaseAdmin
      .from("app_launch_credits")
      .select("id")
      .eq("email_normalised", normalised)
      .maybeSingle();
    if (claimedErr) throw new Error(claimedErr.message);
    if (claimed) return { status: "already_claimed" as const };

    const { count, error: countErr } = await supabaseAdmin
      .from("app_launch_credits")
      .select("id", { count: "exact", head: true });
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) >= config.max_codes) return { status: "capacity_reached" as const };

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();

    const customerGid = await resolveShopifyCustomerId(user.email, profile?.full_name ?? null);

    // Reserve in the database FIRST so the unique constraints gate everything
    // before any Shopify write. Retry only on a code collision.
    let reservedCode: string | null = null;
    for (let i = 0; i < 3; i++) {
      const code = generateCode();
      const { error: insErr } = await supabaseAdmin.from("app_launch_credits").insert({
        user_id: context.userId,
        email: user.email,
        email_normalised: normalised,
        code,
        shopify_customer_id: customerGid,
      });
      if (!insErr) {
        reservedCode = code;
        break;
      }
      if (insErr.code !== "23505") throw new Error(insErr.message);

      // Which constraint collided?
      const row = await readOwn();
      if (row) return buildExisting(row);

      const { data: sameEmail, error: sameEmailErr } = await supabaseAdmin
        .from("app_launch_credits")
        .select("id")
        .eq("email_normalised", normalised)
        .maybeSingle();
      if (sameEmailErr) throw new Error(sameEmailErr.message);
      if (sameEmail) return { status: "already_claimed" as const };

      const { data: sameCode, error: sameCodeErr } = await supabaseAdmin
        .from("app_launch_credits")
        .select("id")
        .eq("code", code)
        .maybeSingle();
      if (sameCodeErr) throw new Error(sameCodeErr.message);
      if (sameCode) continue; // code collision — generate a new one and retry

      return { status: "already_claimed" as const };
    }
    if (!reservedCode) throw new Error("Could not reserve a launch credit code");

    let shopifyId: string;
    try {
      shopifyId = await createShopifyDiscount(reservedCode, customerGid);
    } catch (e) {
      // Release the reservation so the user is not locked out permanently.
      await supabaseAdmin.from("app_launch_credits").delete().eq("code", reservedCode);
      throw e;
    }

    const { error: updErr } = await supabaseAdmin
      .from("app_launch_credits")
      .update({ shopify_discount_id: shopifyId })
      .eq("code", reservedCode);
    if (updErr) throw new Error(updErr.message);

    return {
      status: "issued" as const,
      code: reservedCode,
      amount,
      startsAt: config.starts_at,
      endsAt: config.ends_at,
      used: false,
    };

  });

export const revokeLaunchCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code: string; reason?: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: adminRow, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!adminRow) throw new Error("Forbidden");


    const { data: row, error } = await supabaseAdmin
      .from("app_launch_credits")
      .select("code, shopify_discount_id")
      .eq("code", data.code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Launch credit not found");

    if (row.shopify_discount_id) {
      const res = await shopifyGraphQL(DISCOUNT_DEACTIVATE, { id: row.shopify_discount_id });
      const errs = res?.discountCodeDeactivate?.userErrors ?? [];
      if (errs.length) throw new Error(errs.map((e: any) => e.message).join("; "));
    }

    const { error: updErr } = await supabaseAdmin
      .from("app_launch_credits")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_reason: data.reason ?? "Revoked by admin",
      })
      .eq("code", row.code);
    if (updErr) throw new Error(updErr.message);

    return { status: "revoked" as const, code: row.code };
  });
