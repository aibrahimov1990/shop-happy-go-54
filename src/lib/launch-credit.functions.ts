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

const DISCOUNT_BULK_DEACTIVATE = `
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

async function getDiscountUsageCount(id: string): Promise<number> {
  try {
    const data = await shopifyGraphQL(DISCOUNT_USAGE_QUERY, { id });
    return data?.codeDiscountNode?.codeDiscount?.asyncUsageCount ?? 0;
  } catch {
    return 0;
  }
}

const DISCOUNT_LOOKUP_BY_CODE = `
query LookupByCode($code: String!) {
  codeDiscountNodeByCode(code: $code) { id }
}`;

// Finds an existing Shopify discount by its code. Must use
// codeDiscountNodeByCode — codeDiscountNodes(query: "code:X") ignores the
// code: prefix and returns unrelated discounts.
async function findDiscountIdByCode(code: string): Promise<string | null> {
  const data = await shopifyGraphQL(DISCOUNT_LOOKUP_BY_CODE, { code });
  return (data?.codeDiscountNodeByCode?.id as string | undefined) ?? null;
}

function isCodeTakenError(e: any): boolean {
  return e?.code === "TAKEN" || /must be unique|already exists|taken/i.test(e?.message ?? "");
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

    // Normalise the window timestamps once, here. The raw values come from
    // Postgres and are handed to both Shopify (which requires strict ISO 8601)
    // and JavaScript's Date parser on the client. If a value is ever stored in
    // a format either side rejects, the failure would otherwise be silent and
    // total — every discount creation throws deep inside the Shopify call and
    // nobody gets a code. Fail loudly at the top instead. Do not remove.
    const startsAtMs = new Date(config.starts_at).getTime();
    const endsAtMs = new Date(config.ends_at).getTime();
    if (Number.isNaN(startsAtMs)) {
      throw new Error(
        `launch_credit_config.starts_at is not a valid date: ${String(config.starts_at)}`,
      );
    }
    if (Number.isNaN(endsAtMs)) {
      throw new Error(
        `launch_credit_config.ends_at is not a valid date: ${String(config.ends_at)}`,
      );
    }
    const startsAtIso = new Date(startsAtMs).toISOString();
    const endsAtIso = new Date(endsAtMs).toISOString();

    const readOwn = async () => {
      const { data, error } = await supabaseAdmin
        .from("app_launch_credits")
        .select("code, email, shopify_discount_id, revoked_at, redeemed_at")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    };


    const createShopifyDiscount = async (code: string) => {
      const data = await shopifyGraphQL(DISCOUNT_CREATE, {
        basicCodeDiscount: {
          title: `App Launch £100 — ${code}`,
          code,
          startsAt: startsAtIso,
          endsAt: endsAtIso,
          customerSelection: { all: true },

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
      if (errs.length) {
        // The discount may already exist in Shopify from an earlier attempt
        // whose database update was lost. Adopt it instead of failing.
        if (errs.some(isCodeTakenError)) {
          const existingId = await findDiscountIdByCode(code);
          if (existingId) return existingId;
        }
        throw new Error(errs.map((e: any) => e.message).join("; "));
      }
      return data.discountCodeBasicCreate.codeDiscountNode.id as string;
    };


    const buildExisting = async (row: {
      code: string;
      shopify_discount_id: string | null;
      revoked_at: string | null;
      redeemed_at?: string | null;
    }) => {
      let used = false;
      if (row.redeemed_at) {
        used = true;
      } else if (Date.now() >= startsAtMs) {
        // Window has opened (or closed) and the row isn't marked redeemed yet —
        // only then is it worth asking Shopify.
        const usage = row.shopify_discount_id
          ? await getDiscountUsageCount(row.shopify_discount_id)
          : 0;
        used = usage > 0;
        if (used) {
          await supabaseAdmin
            .from("app_launch_credits")
            .update({ redeemed_at: new Date().toISOString() })
            .eq("code", row.code)
            .is("redeemed_at", null);
        }
      }
      return {
        status: row.revoked_at ? ("revoked" as const) : ("issued" as const),
        code: row.code,
        amount,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        used,
      };
    };


    const existing = await readOwn();
    if (existing) {
      if (existing.shopify_discount_id) return buildExisting(existing);
      // Reserved but incomplete: the Shopify discount may already exist for the
      // stored code (created, but the database update was lost). Look it up
      // first and only create when nothing is there.
      const shopifyId =
        (await findDiscountIdByCode(existing.code)) ??
        (await createShopifyDiscount(existing.code));
      const { error: updErr } = await supabaseAdmin
        .from("app_launch_credits")
        .update({ shopify_discount_id: shopifyId })
        .eq("code", existing.code);

      if (updErr) throw new Error(updErr.message);
      return {
        status: existing.revoked_at ? ("revoked" as const) : ("issued" as const),
        code: existing.code,
        amount,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
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
      shopifyId = await createShopifyDiscount(reservedCode);
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
      startsAt: startsAtIso,
      endsAt: endsAtIso,
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

export const killAllLaunchCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { reason?: string } | undefined) => data ?? {})
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

    const { data: rows, error } = await supabaseAdmin
      .from("app_launch_credits")
      .select("code, shopify_discount_id")
      .is("redeemed_at", null)
      .is("revoked_at", null)
      .not("shopify_discount_id", "is", null);
    if (error) throw new Error(error.message);

    const live = (rows ?? []).filter((r) => r.shopify_discount_id);
    if (!live.length) return { deactivated: 0, jobs: [] as string[] };

    const jobs: string[] = [];
    const deactivatedCodes: string[] = [];

    for (let i = 0; i < live.length; i += 250) {
      const batch = live.slice(i, i + 250);
      const res = await shopifyGraphQL(DISCOUNT_BULK_DEACTIVATE, {
        ids: batch.map((r) => r.shopify_discount_id),
      });
      const errs = res?.discountCodeBulkDeactivate?.userErrors ?? [];
      if (errs.length) {
        throw new Error(
          `discountCodeBulkDeactivate: ${errs
            .map((e: any) => `${(e.field ?? []).join(".")} ${e.code ?? ""} ${e.message}`.trim())
            .join("; ")}`,
        );
      }
      const jobId = res?.discountCodeBulkDeactivate?.job?.id as string | undefined;
      if (jobId) jobs.push(jobId);
      deactivatedCodes.push(...batch.map((r) => r.code));
    }

    const reason = data.reason ?? "Bulk kill switch";
    for (let i = 0; i < deactivatedCodes.length; i += 500) {
      const chunk = deactivatedCodes.slice(i, i + 500);
      const { error: updErr } = await supabaseAdmin
        .from("app_launch_credits")
        .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
        .in("code", chunk);
      if (updErr) throw new Error(updErr.message);
    }

    return { deactivated: deactivatedCodes.length, jobs };
  });

const adminGate = async (
  supabaseAdmin: Awaited<
    typeof import("@/integrations/supabase/client.server")
  >["supabaseAdmin"],
  userId: string,
) => {
  const { data: adminRow, error } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!adminRow) throw new Error("Forbidden");
};

export const getLaunchCreditAdminStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await adminGate(supabaseAdmin, context.userId);

    const { data: config, error: cfgErr } = await supabaseAdmin
      .from("launch_credit_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (cfgErr) throw new Error(cfgErr.message);

    const countOf = async (build: (q: any) => any) => {
      const { count, error } = await build(
        supabaseAdmin.from("app_launch_credits").select("id", { count: "exact", head: true }),
      );
      if (error) throw new Error(error.message);
      return count ?? 0;
    };

    const total = await countOf((q: any) => q);
    const redeemed = await countOf((q: any) => q.not("redeemed_at", "is", null));
    const revoked = await countOf((q: any) => q.not("revoked_at", "is", null));
    const live = await countOf((q: any) =>
      q.is("redeemed_at", null).is("revoked_at", null).not("shopify_discount_id", "is", null),
    );

    const { data: recent, error: recentErr } = await supabaseAdmin
      .from("app_launch_credits")
      .select("code, email, redeemed_at")
      .not("redeemed_at", "is", null)
      .order("redeemed_at", { ascending: false })
      .limit(25);
    if (recentErr) throw new Error(recentErr.message);

    return {
      config,
      counts: { total, redeemed, revoked, live },
      recentRedemptions: recent ?? [],
    };
  });

export const setLaunchCreditEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { enabled: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await adminGate(supabaseAdmin, context.userId);

    const { data: row, error } = await supabaseAdmin
      .from("launch_credit_config")
      .update({ enabled: data.enabled, updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select("enabled")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { enabled: row?.enabled ?? data.enabled };
  });
