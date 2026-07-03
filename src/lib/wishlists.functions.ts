import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listClientsWithWishlists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: isShopper }, { data: isAdmin }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "shopper" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);
    if (!isShopper && !isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: rows, error } = await admin
      .from("wishlists")
      .select("user_id, created_at");
    if (error) throw error;

    const map = new Map<string, { count: number; last: string }>();
    for (const row of rows ?? []) {
      const cur = map.get(row.user_id) ?? { count: 0, last: row.created_at };
      cur.count++;
      if (row.created_at > cur.last) cur.last = row.created_at;
      map.set(row.user_id, cur);
    }

    if (map.size === 0) return [] as Array<{ userId: string; email: string; fullName: string | null; count: number; lastSaved: string }>;

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", Array.from(map.keys()));

    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    return Array.from(map.entries())
      .map(([uid, info]) => {
        const p: any = profMap.get(uid);
        return {
          userId: uid,
          email: p?.email ?? "(unknown)",
          fullName: p?.full_name ?? null,
          count: info.count,
          lastSaved: info.last,
        };
      })
      .sort((a, b) => b.count - a.count);
  });

export const getClientWishlist = createServerFn({ method: "GET" })
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

    const [{ data: items }, { data: profile }] = await Promise.all([
      admin
        .from("wishlists")
        .select("shopify_product_id, created_at")
        .eq("user_id", data.clientUserId)
        .order("created_at", { ascending: false }),
      admin.from("profiles").select("id, email, full_name").eq("id", data.clientUserId).maybeSingle(),
    ]);

    return {
      client: profile ?? { id: data.clientUserId, email: "(unknown)", full_name: null },
      productIds: (items ?? []).map((r: any) => r.shopify_product_id as string),
    };
  });
