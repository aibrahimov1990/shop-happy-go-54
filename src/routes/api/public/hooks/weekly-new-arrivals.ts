import { createFileRoute } from "@tanstack/react-router";
import {
  storefrontApiRequest,
  PRODUCTS_QUERY,
  isKidsProduct,
  type ShopifyProduct,
} from "@/lib/shopify";

// Weekly personalised "new arrivals" push digest.
// Called by pg_cron. Auth: Supabase anon apikey header (matches other public hooks).
//
// Flow:
//   1. Pull ALL wishlist rows + join to device_tokens per user.
//   2. Fetch products created in the last 7 days from Shopify once.
//   3. For each user with wishlisted items, extract their wishlist vendors,
//      match against the week's new arrivals, and push if there are hits.

const DAYS = 7;

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export const Route = createFileRoute("/api/public/hooks/weekly-new-arrivals")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as any;

        // 1. Load all wishlist entries
        const { data: wishRows, error: wErr } = await admin
          .from("wishlists")
          .select("user_id, shopify_product_id");
        if (wErr) return Response.json({ error: wErr.message }, { status: 500 });

        const byUser = new Map<string, Set<string>>();
        const allProductIds = new Set<string>();
        for (const r of wishRows ?? []) {
          allProductIds.add(r.shopify_product_id);
          if (!byUser.has(r.user_id)) byUser.set(r.user_id, new Set());
          byUser.get(r.user_id)!.add(r.shopify_product_id);
        }
        if (byUser.size === 0) {
          return Response.json({ ok: true, usersConsidered: 0, notified: 0 });
        }

        // 2. Fetch wishlisted products (once) to get their vendor
        const productIds = Array.from(allProductIds);
        const vendorByProduct = new Map<string, string>();
        for (let i = 0; i < productIds.length; i += 40) {
          const batch = productIds.slice(i, i + 40);
          const q = batch.map((id) => `id:${id.split("/").pop()}`).join(" OR ");
          const res = await storefrontApiRequest<any>(PRODUCTS_QUERY, {
            first: batch.length,
            query: q,
          });
          const edges: ShopifyProduct[] = res?.data?.products?.edges ?? [];
          for (const e of edges) {
            const v = (e.node.vendor ?? "").trim();
            if (v) vendorByProduct.set(e.node.id, v);
          }
        }

        // 3. Fetch new arrivals from the last 7 days
        const newRes = await storefrontApiRequest<any>(PRODUCTS_QUERY, {
          first: 100,
          query: `created_at:>=${daysAgoISO(DAYS)} -tag:KIDS`,
          sortKey: "CREATED_AT",
          reverse: true,
        });
        const newArrivals: ShopifyProduct[] = (newRes?.data?.products?.edges ?? []).filter(
          (e: ShopifyProduct) => !isKidsProduct(e),
        );
        if (newArrivals.length === 0) {
          return Response.json({ ok: true, usersConsidered: byUser.size, notified: 0, reason: "no_new" });
        }

        const newByVendor = new Map<string, ShopifyProduct[]>();
        for (const p of newArrivals) {
          const v = (p.node.vendor ?? "").trim();
          if (!v) continue;
          if (!newByVendor.has(v)) newByVendor.set(v, []);
          newByVendor.get(v)!.push(p);
        }

        // 4. Load device tokens per user
        const userIds = Array.from(byUser.keys());
        const { data: tokenRows, error: tErr } = await admin
          .from("device_tokens")
          .select("user_id, token")
          .in("user_id", userIds);
        if (tErr) return Response.json({ error: tErr.message }, { status: 500 });

        const tokensByUser = new Map<string, string[]>();
        for (const r of tokenRows ?? []) {
          if (!tokensByUser.has(r.user_id)) tokensByUser.set(r.user_id, []);
          tokensByUser.get(r.user_id)!.push(r.token);
        }

        const { sendFcmToTokens } = await import("@/lib/fcm.server");

        let notified = 0;
        let totalDevices = 0;
        const invalidTokens: string[] = [];

        for (const [userId, wishedIds] of byUser) {
          const tokens = tokensByUser.get(userId) ?? [];
          if (tokens.length === 0) continue;

          const vendors = new Set<string>();
          for (const pid of wishedIds) {
            const v = vendorByProduct.get(pid);
            if (v) vendors.add(v);
          }

          const matches: ShopifyProduct[] = [];
          for (const v of vendors) {
            const arr = newByVendor.get(v);
            if (arr) matches.push(...arr);
          }
          if (matches.length === 0) continue;

          const brandsHit = Array.from(new Set(matches.map((m) => m.node.vendor).filter(Boolean))) as string[];
          const brandList =
            brandsHit.length === 1
              ? brandsHit[0]
              : brandsHit.length === 2
                ? `${brandsHit[0]} & ${brandsHit[1]}`
                : `${brandsHit[0]}, ${brandsHit[1]} +${brandsHit.length - 2}`;

          const title = `New in from ${brandList}`;
          const body =
            matches.length === 1
              ? `A fresh piece just landed — take a look.`
              : `${matches.length} new pieces from the brands on your wishlist.`;

          const results = await sendFcmToTokens(tokens, {
            title,
            body,
            url: "/new-arrivals",
          });

          totalDevices += tokens.length;
          let anySuccess = false;
          for (const r of results) {
            if (r.ok) anySuccess = true;
            else if (r.error && /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i.test(r.error)) {
              invalidTokens.push(r.token);
            }
          }
          if (anySuccess) notified++;
        }

        if (invalidTokens.length > 0) {
          await admin.from("device_tokens").delete().in("token", invalidTokens);
        }

        return Response.json({
          ok: true,
          usersConsidered: byUser.size,
          notified,
          totalDevices,
          prunedTokens: invalidTokens.length,
          newArrivalsFetched: newArrivals.length,
        });
      },
    },
  },
});
