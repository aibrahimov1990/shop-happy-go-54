import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const inputSchema = z.object({
  filter: z.enum(["all", "sellier"]).default("all"),
}).default({ filter: "all" });

export const listAllUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    let query = admin
      .from("profiles")
      .select("id, email, full_name, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (data.filter === "sellier") {
      query = query.ilike("email", "%@sellierknightsbridge.com");
    }

    const { data: profiles, error } = await query;
    if (error) throw new Error(error.message);

    const ids = (profiles ?? []).map((p: any) => p.id);
    const rolesMap = new Map<string, string[]>();
    if (ids.length) {
      const { data: roles } = await admin
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", ids);
      for (const r of (roles ?? []) as Array<{ user_id: string; role: string }>) {
        const arr = rolesMap.get(r.user_id) ?? [];
        arr.push(r.role);
        rolesMap.set(r.user_id, arr);
      }
    }

    const users = (profiles ?? []).map((p: any) => ({
      id: p.id as string,
      email: p.email as string,
      fullName: (p.full_name as string) ?? null,
      createdAt: p.created_at as string,
      roles: rolesMap.get(p.id) ?? [],
      isSellier: typeof p.email === "string"
        && p.email.toLowerCase().endsWith("@sellierknightsbridge.com"),
    }));

    return {
      users,
      totalAll: users.length,
    };
  });
