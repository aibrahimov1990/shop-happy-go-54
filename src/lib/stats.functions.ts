import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ShopifyOrderAttribute = { name?: string; key?: string; value?: string | number | null };
type ShopifyDiscountCode = { code?: string | null };
type ShopifyStatsOrder = {
  total_price?: string | null;
  currency?: string | null;
  created_at?: string | null;
  cancelled_at?: string | null;
  note_attributes?: ShopifyOrderAttribute[] | null;
  source_name?: string | null;
  landing_site?: string | null;
  referring_site?: string | null;
  discount_codes?: ShopifyDiscountCode[] | null;
};

function normaliseOrderAttributes(attrs: ShopifyOrderAttribute[] | null | undefined) {
  const values = new Map<string, string>();
  for (const attr of attrs ?? []) {
    const key = String(attr.name ?? attr.key ?? "").trim().toLowerCase();
    if (!key) continue;
    values.set(key, String(attr.value ?? "").trim().toLowerCase());
  }
  return values;
}

function hasAppDiscountCode(order: ShopifyStatsOrder) {
  return (order.discount_codes ?? []).some((discount) =>
    String(discount.code ?? "").trim().toUpperCase().startsWith("APP15-"),
  );
}

function hasLovableSalesAttribution(order: ShopifyStatsOrder) {
  const attrs = normaliseOrderAttributes(order.note_attributes);
  const source = attrs.get("source") ?? "";
  const channel = attrs.get("channel") ?? "";
  const campaign = attrs.get("utm_campaign") ?? "";
  const sourceName = String(order.source_name ?? "").toLowerCase();
  const landing = String(order.landing_site ?? "").toLowerCase();
  const referring = String(order.referring_site ?? "").toLowerCase();
  const urlAttribution = `${landing} ${referring}`;

  if (source === "ios_app" || source === "android_app" || source === "lovable_web") return true;
  if (channel === "mobile_app" || channel === "lovable_storefront") return true;
  if (source === "web" && channel === "web") return true; // Legacy Lovable storefront carts.
  if (campaign === "sellier_app") return true;
  if (hasAppDiscountCode(order)) return true;
  if (sourceName.includes("lovable") || sourceName.includes("sellier app")) return true;
  return (
    urlAttribution.includes("utm_campaign=sellier_app") ||
    urlAttribution.includes("utm_source=ios_app") ||
    urlAttribution.includes("utm_source=android_app") ||
    urlAttribution.includes("utm_source=lovable_web")
  );
}

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const since30 = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const since14 = new Date(Date.now() - 14 * 24 * 3600_000).toISOString();
    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();

    // Users
    const { count: totalUsers } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true });

    const { data: recentProfiles } = await admin
      .from("profiles")
      .select("id, created_at")
      .gte("created_at", since14)
      .order("created_at", { ascending: true });

    // signup trend by day (14d)
    const signupTrend: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600_000);
      const key = d.toISOString().slice(0, 10);
      signupTrend.push({ date: key, count: 0 });
    }
    const trendMap = new Map(signupTrend.map((r) => [r.date, r]));
    (recentProfiles ?? []).forEach((p: any) => {
      const key = String(p.created_at).slice(0, 10);
      const row = trendMap.get(key);
      if (row) row.count++;
    });

    // Device tokens
    const { count: totalTokens } = await admin
      .from("device_tokens")
      .select("id", { count: "exact", head: true });
    const { count: signedInTokens } = await admin
      .from("device_tokens")
      .select("id", { count: "exact", head: true })
      .not("user_id", "is", null);
    const { count: anonTokens } = await admin
      .from("device_tokens")
      .select("id", { count: "exact", head: true })
      .is("user_id", null);

    // Edits
    const { count: totalEdits } = await admin
      .from("edits")
      .select("id", { count: "exact", head: true });
    const { count: sentEdits } = await admin
      .from("edits")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent");
    const { count: viewedEdits } = await admin
      .from("edits")
      .select("id", { count: "exact", head: true })
      .eq("status", "viewed");

    // App events — sessions in last 30d
    const { data: events } = await admin
      .from("app_events")
      .select("user_id, session_id, event_type, screen, duration_ms, created_at")
      .gte("created_at", since30)
      .limit(50000);

    const evts = (events ?? []) as Array<{
      user_id: string | null;
      session_id: string;
      event_type: string;
      screen: string | null;
      duration_ms: number | null;
      created_at: string;
    }>;

    // Best duration per session (max heartbeat or session_end)
    const sessionDur = new Map<string, { userId: string | null; duration: number }>();
    for (const e of evts) {
      if (e.event_type !== "session_end" && e.event_type !== "session_heartbeat") continue;
      const cur = sessionDur.get(e.session_id);
      const dur = e.duration_ms ?? 0;
      if (!cur || dur > cur.duration) {
        sessionDur.set(e.session_id, { userId: e.user_id, duration: dur });
      }
    }

    const sessionsLast24h = evts.filter(
      (e) => e.event_type === "session_start" && e.created_at >= since24h,
    ).length;
    const uniqueUsers24h = new Set(
      evts
        .filter((e) => e.created_at >= since24h && e.user_id)
        .map((e) => e.user_id!),
    ).size;

    // Top engaged users by total session time (signed-in only)
    const userTotals = new Map<string, { totalMs: number; sessions: Set<string> }>();
    for (const [sid, info] of sessionDur) {
      if (!info.userId) continue;
      const t = userTotals.get(info.userId) ?? { totalMs: 0, sessions: new Set() };
      t.totalMs += info.duration;
      t.sessions.add(sid);
      userTotals.set(info.userId, t);
    }
    const topUserIds = Array.from(userTotals.entries())
      .sort((a, b) => b[1].totalMs - a[1].totalMs)
      .slice(0, 10);

    let topUsers: Array<{ email: string; totalMs: number; sessions: number }> = [];
    if (topUserIds.length) {
      const { data: profs } = await admin
        .from("profiles")
        .select("id, email")
        .in(
          "id",
          topUserIds.map(([id]) => id),
        );
      const emailMap = new Map((profs ?? []).map((p: any) => [p.id, p.email]));
      topUsers = topUserIds.map(([id, info]) => ({
        email: (emailMap.get(id) as string) ?? "(unknown)",
        totalMs: info.totalMs,
        sessions: info.sessions.size,
      }));
    }

    // Top screens by view count
    const screenCounts = new Map<string, number>();
    for (const e of evts) {
      if (e.event_type !== "screen_view" || !e.screen) continue;
      screenCounts.set(e.screen, (screenCounts.get(e.screen) ?? 0) + 1);
    }
    const topScreens = Array.from(screenCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([screen, count]) => ({ screen, count }));

    const totalSessionMs = Array.from(sessionDur.values()).reduce((s, v) => s + v.duration, 0);
    const avgSessionMs = sessionDur.size ? Math.round(totalSessionMs / sessionDur.size) : 0;

    // Shopify sales — paginate paid orders and sum only Lovable/app-attributed totals.
    const sales = { total: 0, last30d: 0, last24h: 0, orderCount: 0, currency: "GBP" };
    try {
      const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
      if (token) {
        const domain = "sellier-knightsbridge.myshopify.com";
        const version = "2025-07";
        const fields = [
          "id",
          "total_price",
          "currency",
          "created_at",
          "cancelled_at",
          "note_attributes",
          "source_name",
          "landing_site",
          "referring_site",
          "discount_codes",
        ].join(",");
        let url: string | null =
          `https://${domain}/admin/api/${version}/orders.json?status=any&financial_status=paid&limit=250&fields=${encodeURIComponent(fields)}`;
        const now = Date.now();
        while (url) {
          const res: Response = await fetch(url, {
            headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
          });
          if (!res.ok) break;
          const json: any = await res.json();
          for (const o of (json.orders ?? []) as ShopifyStatsOrder[]) {
            if (o.cancelled_at) continue;
            if (!hasLovableSalesAttribution(o)) continue;
            const amt = parseFloat(o.total_price ?? "0") || 0;
            sales.total += amt;
            sales.orderCount++;
            if (o.currency) sales.currency = o.currency;
            const created = new Date(o.created_at).getTime();
            if (now - created <= 30 * 24 * 3600_000) sales.last30d += amt;
            if (now - created <= 24 * 3600_000) sales.last24h += amt;
          }
          const link = res.headers.get("link") ?? "";
          const next = /<([^>]+)>;\s*rel="next"/.exec(link);
          url = next ? next[1] : null;
        }
      }
    } catch {
      // ignore — sales stays zeroed
    }

    return {
      users: {
        total: totalUsers ?? 0,
        newLast14d: (recentProfiles ?? []).length,
        signupTrend,
      },
      push: {
        totalTokens: totalTokens ?? 0,
        signedIn: signedInTokens ?? 0,
        anonymous: anonTokens ?? 0,
      },
      edits: {
        total: totalEdits ?? 0,
        sent: sentEdits ?? 0,
        viewed: viewedEdits ?? 0,
      },
      engagement: {
        sessions30d: sessionDur.size,
        sessions24h: sessionsLast24h,
        uniqueUsers24h,
        avgSessionMs,
        topUsers,
        topScreens,
      },
      sales,
    };
  });
