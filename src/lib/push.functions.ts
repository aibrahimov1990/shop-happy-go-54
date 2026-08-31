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

/**
 * Register a device token for an anonymous (signed-out) user.
 * Uses the service-role client because there is no bearer to satisfy RLS,
 * and only writes rows with user_id = NULL.
 */
export const registerAnonymousDeviceToken = createServerFn({ method: "POST" })
  .inputValidator((input) => registerSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("device_tokens")
      .upsert(
        { token: data.token, platform: data.platform, user_id: null, updated_at: new Date().toISOString() },
        { onConflict: "token" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const unlinkSchema = z.object({ token: z.string().min(10) });

/**
 * Release the caller's claim on a device token by setting user_id = NULL,
 * but only if the row currently belongs to the caller. Called on sign-out so
 * the phone stops receiving the previous user's personalised pushes while
 * still receiving anonymous broadcasts.
 */
export const unlinkDeviceToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => unlinkSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // The device_tokens UPDATE policy has WITH CHECK (auth.uid() = user_id),
    // which rejects any update that sets user_id = NULL through the
    // user-scoped client. Use the service-role client to perform the write,
    // but keep BOTH ownership filters so this can only ever release a token
    // that already belongs to the caller — never another user's row.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("device_tokens")
      .update({ user_id: null, updated_at: new Date().toISOString() })
      .eq("token", data.token)
      .eq("user_id", userId)
      .select("token");
    if (error) throw new Error(error.message);
    return { ok: true, released: (rows?.length ?? 0) > 0 };
  });

const broadcastSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  // Accepts either an in-app path (e.g. "/shop", "/edits/abc") — opens inside
  // the native app — or a full https URL. Paths are preferred so taps stay in-app.
  url: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v.trim() : undefined))
    .refine(
      (v) => !v || v.startsWith("/") || /^https?:\/\//i.test(v),
      { message: "URL must start with / (in-app path) or https://" },
    ),
  // Storage path inside the "broadcast-images" bucket. The server signs it
  // into a long-lived https URL before sending to FCM. Optional.
  imagePath: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v.trim() : undefined)),
  // Direct https image URL (e.g. Shopify CDN). Used when picking a product
  // hero image — no upload/signing required. Optional.
  imageUrl: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v.trim() : undefined))
    .refine((v) => !v || /^https:\/\//i.test(v), { message: "imageUrl must be https://" }),
});


/**
 * True if the caller has the admin or broadcaster role. Throws otherwise.
 */
async function assertCanBroadcast(supabase: {
  rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" | "broadcaster" }) => Promise<{ data: unknown; error: { message: string } | null }>;
}, userId: string) {
  const { data: isAdminRole, error: adminErr } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (adminErr) throw new Error(adminErr.message);
  if (isAdminRole) return;

  const { data: isBroadcaster, error: bErr } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "broadcaster",
  });
  if (bErr) throw new Error(bErr.message);
  if (!isBroadcaster) throw new Error("Forbidden: admin or broadcaster role required");
}

/**
 * Send a push notification to every registered device. Admins or broadcasters.
 */
export const sendBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => broadcastSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    await assertCanBroadcast(supabase as never, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Record the broadcast BEFORE any sending happens, so a throw, timeout or
    // request termination during the fan-out always leaves evidence behind.
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("broadcasts")
      .insert({
        sent_by: userId,
        title: data.title,
        body: data.body,
        url: data.url ?? null,
        image_path: data.imagePath ?? null,
        image_url: data.imageUrl ?? null,
        status: "sending",
        success_count: 0,
        failure_count: 0,
        total_tokens: 0,
        permanent_failure_count: 0,
        transient_failure_count: 0,
        suspect_failure_count: 0,
        pruned_token_count: 0,
        signed_in_recipients: 0,
        anonymous_recipients: 0,
        error_breakdown: {},
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    const { runBroadcast } = await import("./broadcast-runner.server");
    return await runBroadcast(inserted.id);
  });

const scheduleSchema = broadcastSchema.extend({
  scheduledFor: z.string().min(1),
});

/**
 * Schedule a broadcast for a future time. Sends nothing now — the
 * run-scheduled-broadcasts cron hook picks it up when it is due.
 */
export const scheduleBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => scheduleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanBroadcast(supabase as never, userId);

    const when = new Date(data.scheduledFor);
    if (Number.isNaN(when.getTime())) throw new Error("Invalid scheduled time");
    if (when.getTime() < Date.now() + 2 * 60 * 1000) {
      throw new Error("Scheduled time must be at least 2 minutes in the future");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error } = await supabaseAdmin
      .from("broadcasts")
      .insert({
        sent_by: userId,
        scheduled_by: userId,
        title: data.title,
        body: data.body,
        url: data.url ?? null,
        image_path: data.imagePath ?? null,
        image_url: data.imageUrl ?? null,
        status: "scheduled",
        scheduled_for: when.toISOString(),
        success_count: 0,
        failure_count: 0,
        total_tokens: 0,
        permanent_failure_count: 0,
        transient_failure_count: 0,
        suspect_failure_count: 0,
        pruned_token_count: 0,
        signed_in_recipients: 0,
        anonymous_recipients: 0,
        error_breakdown: {},
      })
      .select("id, scheduled_for")
      .single();
    if (error) throw new Error(error.message);
    return { broadcastId: inserted.id, scheduledFor: inserted.scheduled_for };
  });

export const listScheduledBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertCanBroadcast(supabase as never, userId);

    const { data, error } = await supabase
      .from("broadcasts")
      .select("id, title, body, url, scheduled_for, created_at")
      .eq("status", "scheduled")
      .order("scheduled_for", { ascending: true })
      .limit(100);
    if (error) throw new Error(error.message);
    return { scheduled: data ?? [] };
  });

export const cancelScheduledBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanBroadcast(supabase as never, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Conditional update: can never cancel one the runner already claimed.
    const { data: rows, error } = await supabaseAdmin
      .from("broadcasts")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "scheduled")
      .select("id");
    if (error) throw new Error(error.message);
    if ((rows?.length ?? 0) === 0) {
      throw new Error("This broadcast is no longer scheduled — it may have already been sent.");
    }
    return { cancelled: true };
  });




/**
 * Admin action: silently probe every registered token and report which are
 * dead. `confirm: false` (default) is a dry run — nothing is deleted; it
 * exists so the admin sees the error breakdown before approving. With
 * `confirm: true` the mass-deletion circuit breaker is bypassed for this one
 * run, and only unambiguously permanent failures are archived and removed.
 */
export const cleanupDeadTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ confirm: z.boolean().default(false) }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdminRole, error: roleError } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdminRole) throw new Error("Forbidden: admin role required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchAllDeviceTokens } = await import("./device-tokens.server");
    const { rows } = await fetchAllDeviceTokens(supabaseAdmin as never);

    const tokens = rows.map((r) => r.token);
    if (tokens.length === 0) {
      return {
        dryRun: !data.confirm,
        attempted: 0,
        aliveCount: 0,
        permanentCount: 0,
        suspectCount: 0,
        transientCount: 0,
        errorCounts: {} as Record<string, number>,
        deletedCount: 0,
        archivedCount: 0,
        dominantErrorCode: null as string | null,
        warning: null as string | null,
      };
    }

    const { probeFcmTokens } = await import("./fcm.server");
    const results = await probeFcmTokens(tokens);

    const errorCounts: Record<string, number> = {};
    const deadTokens: string[] = [];
    let aliveCount = 0;
    let permanentCount = 0;
    let suspectCount = 0;
    let transientCount = 0;

    for (const r of results) {
      if (r.ok) {
        aliveCount++;
        continue;
      }
      const kind = r.kind ?? "transient";
      errorCounts[`${kind}:${r.code ?? "OTHER"}`] = (errorCounts[`${kind}:${r.code ?? "OTHER"}`] ?? 0) + 1;
      if (kind === "permanent") {
        permanentCount++;
        deadTokens.push(r.token);
      } else if (kind === "suspect") suspectCount++;
      else transientCount++;
    }

    if (!data.confirm) {
      // Dry run: show the breakdown, touch nothing.
      const { MASS_DELETION_THRESHOLD } = await import("./token-retirement.server");
      return {
        dryRun: true,
        attempted: tokens.length,
        aliveCount,
        permanentCount,
        suspectCount,
        transientCount,
        errorCounts,
        deletedCount: 0,
        archivedCount: 0,
        dominantErrorCode:
          Object.entries(errorCounts).sort((a, b) => b[1] - a[1])[0]?.[0]?.split(":").pop() ?? null,
        warning:
          permanentCount / tokens.length > MASS_DELETION_THRESHOLD
            ? `${permanentCount} of ${tokens.length} tokens are reported dead. Review the breakdown below — confirming will bypass the safety breaker for this run.`
            : null,
      };
    }

    const { retireDeadTokens } = await import("./token-retirement.server");
    const retirement = await retireDeadTokens(supabaseAdmin as never, {
      candidates: deadTokens,
      attempted: tokens.length,
      errorCounts,
      suspectCount,
      reason: "admin_cleanup_dead_tokens",
      // Explicit, deliberate one-time override of the circuit breaker.
      force: true,
    });

    return {
      dryRun: false,
      attempted: tokens.length,
      aliveCount,
      permanentCount,
      suspectCount,
      transientCount,
      errorCounts,
      deletedCount: retirement.deletedCount,
      archivedCount: retirement.archivedCount,
      dominantErrorCode: retirement.dominantErrorCode,
      warning: retirement.warning,
    };
  });

export const listBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("broadcasts")
      .select(
        "id, title, body, url, success_count, failure_count, total_tokens, permanent_failure_count, transient_failure_count, suspect_failure_count, systemic_suspected, dominant_error_code, pruned_token_count, signed_in_recipients, anonymous_recipients, error_breakdown, topic_submitted, topic_error, token_page_count, created_at",
      )

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

export const canBroadcast = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: adminRole, error: adminErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (adminErr) throw new Error(adminErr.message);
    if (adminRole) return { canBroadcast: true };

    const { data: broadcasterRole, error: bErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "broadcaster",
    });
    if (bErr) throw new Error(bErr.message);
    return { canBroadcast: Boolean(broadcasterRole) };
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
      else if (r.kind === "permanent") {
        invalidTokens.push(r.token);
      }
    }
    if (invalidTokens.length > 0) {
      await supabaseAdmin.from("device_tokens").delete().in("token", invalidTokens);
    }

    return { notified: successCount > 0, successCount };
  });
