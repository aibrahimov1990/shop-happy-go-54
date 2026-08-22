import {
  DISCOUNT_BULK_DEACTIVATE,
  DISCOUNT_CREATE,
  DISCOUNT_DEACTIVATE,
  adminGate,
  generateCode,
  getDiscountUsageCount,
  normaliseEmail,
  shopifyGraphQL,
} from "./launch-credit.server";

type AuthContext = { userId: string };
type RevokeInput = { code: string; reason?: string };
type KillInput = { reason?: string };
type SetEnabledInput = { enabled: boolean };

export async function getOrCreateLaunchCreditHandler({ context }: { context: AuthContext }) {
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
      if (errs.length) throw new Error(errs.map((e: any) => e.message).join("; "));
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
      // Reserved but incomplete: finish creating the Shopify discount for the
      // code already stored on the row, then update it in place.
      const shopifyId = await createShopifyDiscount(existing.code);
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

}

export async function revokeLaunchCreditHandler({ data, context }: { data: RevokeInput; context: AuthContext }) {
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
}

export async function killAllLaunchCreditsHandler({ data, context }: { data: KillInput; context: AuthContext }) {
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
}

export async function getLaunchCreditAdminStatusHandler({ context }: { context: AuthContext }) {
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
}

export async function setLaunchCreditEnabledHandler({ data, context }: { data: SetEnabledInput; context: AuthContext }) {
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
}
