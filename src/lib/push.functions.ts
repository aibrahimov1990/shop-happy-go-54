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
    const { userId, supabase } = context;
    // Use the user-scoped client so the insert passes RLS as the authenticated user.
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
    const errorSamples: string[] = [];
    const errorCounts: Record<string, number> = {};

    if (tokens.length > 0) {
      const { BROADCAST_TOPIC, sendFcmToTokens, sendFcmToTopic } = await import("./fcm.server");
      const payload = {
        title: data.title,
        body: data.body,
        url: data.url,
      };
      const topicResult = await sendFcmToTopic(BROADCAST_TOPIC, payload);
      if (!topicResult.ok) {
        console.error("[broadcast] FCM topic send failed; falling back to device tokens", {
          topic: BROADCAST_TOPIC,
          error: topicResult.error,
        });
      }

      // Transitional safety: older App Store installs may not yet be subscribed to
      // the broadcast topic, so keep the direct token fan-out active as well.
      const results = await sendFcmToTokens(tokens, payload);
      for (const r of results) {
        if (r.ok) successCount++;
        else {
          failureCount++;
          const err = r.error ?? "unknown";
          // Bucket by short signature (status code + FCM error code if present)
          const status = err.match(/^(\d{3})/)?.[1] ?? "?";
          const code = err.match(/"status"\s*:\s*"([A-Z_]+)"/)?.[1]
            ?? err.match(/(UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND|SENDER_ID_MISMATCH|THIRD_PARTY_AUTH_ERROR|QUOTA_EXCEEDED|UNAVAILABLE|INTERNAL)/)?.[1]
            ?? "OTHER";
          const key = `${status} ${code}`;
          errorCounts[key] = (errorCounts[key] ?? 0) + 1;
          if (errorSamples.length < 3) errorSamples.push(err.slice(0, 300));
          // Drop tokens FCM has invalidated
          if (/UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND|registration token is not|Requested entity was not found/i.test(err)) {
            invalidTokens.push(r.token);
          }
        }
      }
      if (failureCount > 0) {
        console.error("[broadcast] FCM failures", {
          totalTokens: tokens.length,
          successCount,
          failureCount,
          errorCounts,
          errorSamples,
        });
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
      prunedTokens: invalidTokens.length,
      errorCounts,
      errorSamples,
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

const editNotifySchema = z.object({
  editId: z.string().uuid(),
  clientEmail: z.string().email(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
});

/**
 * Push-notify the client recipient of an edit. Requires the caller to own
 * the edit. No-ops if the recipient hasn't signed into the app on a device.
 */
export const notifyEditRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => editNotifySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: edit, error: editErr } = await supabase
      .from("edits")
      .select("id, shopper_id")
      .eq("id", data.editId)
      .maybeSingle();
    if (editErr) throw new Error(editErr.message);
    if (!edit || edit.shopper_id !== userId) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", data.clientEmail)
      .maybeSingle();

    if (!profile) return { notified: false, reason: "no_account", successCount: 0 };

    const { data: tokenRows, error: tokenErr } = await supabaseAdmin
      .from("device_tokens")
      .select("token")
      .eq("user_id", profile.id);
    if (tokenErr) throw new Error(tokenErr.message);

    const tokens = (tokenRows ?? []).map((r) => r.token);
    if (tokens.length === 0) {
      return { notified: false, reason: "no_devices", successCount: 0 };
    }

    const { sendFcmToTokens } = await import("./fcm.server");
    const results = await sendFcmToTokens(tokens, {
      title: data.title,
      body: data.body,
      url: `/edits/${data.editId}`,
    });

    const invalidTokens: string[] = [];
    let successCount = 0;
    for (const r of results) {
      if (r.ok) successCount++;
      else if (r.error && /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i.test(r.error)) {
        invalidTokens.push(r.token);
      }
    }
    if (invalidTokens.length > 0) {
      await supabaseAdmin.from("device_tokens").delete().in("token", invalidTokens);
    }

    return { notified: successCount > 0, successCount };
  });
