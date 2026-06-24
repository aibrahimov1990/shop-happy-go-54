import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const registerSchema = z.object({
  token: z.string().min(10),
  platform: z.enum(["ios", "android", "web"]),
});

/**
 * Register or update a device token for the currently signed-in user.
 */
export const registerDeviceToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => registerSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("device_tokens")
      .upsert(
        { token: data.token, platform: data.platform, user_id: userId, updated_at: new Date().toISOString() },
        { onConflict: "token" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const broadcastSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  url: z.string().url().optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
});

/**
 * Send a push notification to every registered device. Admins only.
 */
export const sendBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => broadcastSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify admin role
    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin) throw new Error("Forbidden: admin role required");

    // Load all tokens (admin client to bypass RLS for the fan-out read)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tokenRows, error: tokenErr } = await supabaseAdmin
      .from("device_tokens")
      .select("token");
    if (tokenErr) throw new Error(tokenErr.message);

    const tokens = (tokenRows ?? []).map((r) => r.token);

    let successCount = 0;
    let failureCount = 0;
    const invalidTokens: string[] = [];

    if (tokens.length > 0) {
      const { sendFcmToTokens } = await import("./fcm.server");
      const results = await sendFcmToTokens(tokens, {
        title: data.title,
        body: data.body,
        url: data.url,
      });
      for (const r of results) {
        if (r.ok) successCount++;
        else {
          failureCount++;
          // Drop tokens FCM has invalidated
          if (r.error && /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i.test(r.error)) {
            invalidTokens.push(r.token);
          }
        }
      }
      if (invalidTokens.length > 0) {
        await supabaseAdmin.from("device_tokens").delete().in("token", invalidTokens);
      }
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("broadcasts")
      .insert({
        sent_by: userId,
        title: data.title,
        body: data.body,
        url: data.url ?? null,
        success_count: successCount,
        failure_count: failureCount,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    return {
      broadcastId: inserted.id,
      totalTokens: tokens.length,
      successCount,
      failureCount,
    };
  });

export const listBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("broadcasts")
      .select("id, title, body, url, success_count, failure_count, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { broadcasts: data ?? [] };
  });

export const isAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw new Error(error.message);
    return { isAdmin: Boolean(data) };
  });
