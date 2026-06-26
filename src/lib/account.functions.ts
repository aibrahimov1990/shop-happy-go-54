import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Permanently delete the signed-in user's account and all associated data.
 * Required for Apple App Store compliance (Guideline 5.1.1(v)).
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Best-effort cleanup of user-owned rows. Most tables also cascade via
    // FK on auth.users delete, but we clean explicitly to be safe.
    await supabaseAdmin.from("device_tokens").delete().eq("user_id", userId);
    await supabaseAdmin.from("edits").delete().eq("client_user_id", userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    // Finally remove the auth user. This signs them out everywhere.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
