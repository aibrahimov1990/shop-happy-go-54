import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

    // Shopify sales — paginate orders (any status) and sum totals
    const sales = { total: 0, last30d: 0, last24h: 0, orderCount: 0, currency: "GBP" };
    try {
      const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
      if (token) {
        const domain = "sellier-knightsbridge.myshopify.com";
        const version = "2025-07";
        let url: string | null =
          `https://${domain}/admin/api/${version}/orders.json?status=any&financial_status=paid&limit=250&fields=id,total_price,currency,created_at,cancelled_at`;
        const now = Date.now();
        while (url) {
          const res: Response = await fetch(url, {
            headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
          });
          if (!res.ok) break;
          const json: any = await res.json();
          for (const o of json.orders ?? []) {
            if (o.cancelled_at) continue;
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
