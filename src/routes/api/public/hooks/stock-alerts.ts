import { createFileRoute } from "@tanstack/react-router";
import {
  storefrontApiRequest,
  PRODUCTS_QUERY,
  isKidsProduct,
  type ShopifyProduct,
} from "@/lib/shopify";

// Stock Alerts push job. Called by pg_cron every 15 minutes.
// Auth: x-push-hook-secret header, timing-safe compare against PUSH_HOOK_SECRET.
//
// 1. Pull new arrivals from the last 24h (idempotency: matches already sent are
//    recorded in saved_search_notifications, so this window can overlap safely).
// 2. Load all active saved_searches.
// 3. For each matching (user, product) not already notified, push up to 3
//    products per user per run (record all matches to prevent re-notify).

const PER_USER_CAP = 3;

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function timingSafeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let equal = ea.length === eb.length;
  const len = Math.max(ea.length, eb.length);
  for (let i = 0; i < len; i++) {
    if ((ea[i] ?? 0) !== (eb[i] ?? 0)) equal = false;
  }
  return equal;
}

interface SavedSearch {
  id: string;
  user_id: string;
  brand: string | null;
  keyword: string | null;
  product_type: string | null;
  max_price: number | null;
}

function matches(search: SavedSearch, p: ShopifyProduct): boolean {
  const node = p.node as ShopifyProduct["node"] & { productType?: string };
  if (search.brand) {
    const v = (node.vendor ?? "").trim().toLowerCase();
    if (v !== search.brand.trim().toLowerCase()) return false;
  }
  if (search.keyword) {
    const t = (node.title ?? "").toLowerCase();
    if (!t.includes(search.keyword.trim().toLowerCase())) return false;
  }
  if (search.product_type) {
    const pt = (node.productType ?? "").trim().toLowerCase();
    if (pt !== search.product_type.trim().toLowerCase()) return false;
  }
  if (search.max_price != null) {
    const price = parseFloat(node.priceRange?.minVariantPrice?.amount ?? "0");
    if (!Number.isFinite(price) || price > search.max_price) return false;
  }
  return true;
}

// Extend product query to include productType (not in default PRODUCTS_QUERY).
const NEW_ARRIVALS_QUERY = PRODUCTS_QUERY.replace(
  "vendor\n          tags",
  "vendor\n          productType\n          tags",
);

export const Route = createFileRoute("/api/public/hooks/stock-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-push-hook-secret") ?? "";
        const expected = process.env.PUSH_HOOK_SECRET ?? "";
        if (!expected) {
          console.error("[stock-alerts] PUSH_HOOK_SECRET is not configured");
          return new Response("Server misconfigured", { status: 500 });
        }
        if (!timingSafeEqual(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as any;

        // 1. Fetch new arrivals from the last 24h
        const newRes = await storefrontApiRequest<any>(NEW_ARRIVALS_QUERY, {
          first: 100,
          query: `created_at:>=${daysAgoISO(1)} -tag:KIDS`,
          sortKey: "CREATED_AT",
          reverse: true,
        });
        const newArrivals: ShopifyProduct[] = (newRes?.data?.products?.edges ?? [])
          .filter((e: ShopifyProduct) => !isKidsProduct(e));
        if (newArrivals.length === 0) {
          return Response.json({ ok: true, newArrivals: 0, notified: 0 });
        }

        // 2. Load active saved searches
        const { data: searches, error: sErr } = await admin
          .from("saved_searches")
          .select("id, user_id, brand, keyword, product_type, max_price")
          .eq("active", true);
        if (sErr) return Response.json({ error: sErr.message }, { status: 500 });
        if (!searches || searches.length === 0) {
          return Response.json({ ok: true, newArrivals: newArrivals.length, notified: 0 });
        }

        // 3. Compute matches per user
        //    matchesByUser: userId -> Map<productId, { product, searchId }>
        const matchesByUser = new Map<
          string,
          Map<string, { product: ShopifyProduct; searchId: string }>
        >();
        for (const s of searches as SavedSearch[]) {
          for (const p of newArrivals) {
            if (!matches(s, p)) continue;
            if (!matchesByUser.has(s.user_id)) matchesByUser.set(s.user_id, new Map());
            const map = matchesByUser.get(s.user_id)!;
            if (!map.has(p.node.id)) map.set(p.node.id, { product: p, searchId: s.id });
          }
        }
        if (matchesByUser.size === 0) {
          return Response.json({ ok: true, newArrivals: newArrivals.length, notified: 0 });
        }

        const userIds = Array.from(matchesByUser.keys());

        // 4. Filter out already-notified (user, product) pairs
        const productIds = Array.from(
          new Set(
            Array.from(matchesByUser.values()).flatMap((m) => Array.from(m.keys())),
          ),
        );
        const { data: existing, error: eErr } = await admin
          .from("saved_search_notifications")
          .select("user_id, shopify_product_id")
          .in("user_id", userIds)
          .in("shopify_product_id", productIds);
        if (eErr) return Response.json({ error: eErr.message }, { status: 500 });

        const alreadyNotified = new Set<string>(
          (existing ?? []).map((r: any) => `${r.user_id}|${r.shopify_product_id}`),
        );

        // 5. Load device tokens for candidate users
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

        let notifiedUsers = 0;
        let pushedProducts = 0;
        const invalidTokens: string[] = [];
        const notificationRowsToInsert: Array<{
          saved_search_id: string;
          user_id: string;
          shopify_product_id: string;
        }> = [];

        for (const [userId, productMap] of matchesByUser) {
          // Newest first — newArrivals is already sorted CREATED_AT desc.
          const orderedMatches = newArrivals
            .filter((p) => productMap.has(p.node.id))
            .map((p) => ({
              product: p,
              searchId: productMap.get(p.node.id)!.searchId,
            }))
            .filter((m) => !alreadyNotified.has(`${userId}|${m.product.node.id}`));

          if (orderedMatches.length === 0) continue;

          // Record all matches so unpushed ones (beyond the per-run cap)
          // don't refire next time.
          for (const m of orderedMatches) {
            notificationRowsToInsert.push({
              saved_search_id: m.searchId,
              user_id: userId,
              shopify_product_id: m.product.node.id,
            });
          }

          const toPush = orderedMatches.slice(0, PER_USER_CAP);
          const tokens = tokensByUser.get(userId) ?? [];
          if (tokens.length === 0) continue;

          let anySuccess = false;
          for (const m of toPush) {
            const results = await sendFcmToTokens(tokens, {
              title: `Just in: ${m.product.node.title}`,
              body: "A new piece matches your saved search.",
              url: `/product/${m.product.node.handle}`,
            });
            for (const r of results) {
              if (r.ok) anySuccess = true;
              else if (r.error && /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i.test(r.error)) {
                invalidTokens.push(r.token);
              }
            }
            pushedProducts++;
          }
          if (anySuccess) notifiedUsers++;
        }

        if (notificationRowsToInsert.length > 0) {
          const { error: iErr } = await admin
            .from("saved_search_notifications")
            .upsert(notificationRowsToInsert, {
              onConflict: "user_id,shopify_product_id",
              ignoreDuplicates: true,
            });
          if (iErr) console.error("[stock-alerts] failed to record notifications", iErr.message);
        }

        if (invalidTokens.length > 0) {
          await admin.from("device_tokens").delete().in("token", invalidTokens);
        }

        return Response.json({
          ok: true,
          newArrivals: newArrivals.length,
          activeSearches: searches.length,
          usersWithMatches: matchesByUser.size,
          notifiedUsers,
          pushedProducts,
          recordedMatches: notificationRowsToInsert.length,
          prunedTokens: invalidTokens.length,
        });
      },
    },
  },
});
