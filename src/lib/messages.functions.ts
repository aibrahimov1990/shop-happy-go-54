import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const sendSchema = z.object({
  otherUserId: z.string().uuid(),
  body: z.string().min(1).max(2000),
});

/**
 * Send a message between the signed-in user and `otherUserId`.
 * The signed-in user must be either the shopper or client party.
 * We infer roles from either the users involved (one is a shopper, other a client)
 * or from any shared edit; we default the shopper to whoever has the shopper role.
 */
export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => sendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const other = data.otherUserId;
    if (other === userId) throw new Error("Cannot message yourself");

    // Figure out who is the shopper. Preferred source: an existing edit between the pair.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: edit } = await supabaseAdmin
      .from("edits")
      .select("shopper_id, client_user_id")
      .or(
        `and(shopper_id.eq.${userId},client_user_id.eq.${other}),and(shopper_id.eq.${other},client_user_id.eq.${userId})`,
      )
      .limit(1)
      .maybeSingle();

    let shopperId: string;
    let clientUserId: string;
    if (edit) {
      shopperId = edit.shopper_id;
      clientUserId = edit.client_user_id ?? (edit.shopper_id === userId ? other : userId);
    } else {
      // Fallback: check user_roles to determine which one is a shopper.
      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", [userId, other])
        .in("role", ["shopper", "admin"]);
      const shopperCandidates = new Set((roles ?? []).map((r) => r.user_id));
      if (shopperCandidates.has(userId) && !shopperCandidates.has(other)) {
        shopperId = userId;
        clientUserId = other;
      } else if (shopperCandidates.has(other)) {
        shopperId = other;
        clientUserId = userId;
      } else {
        throw new Error("No shopper found for this conversation");
      }
    }

    const { data: inserted, error } = await supabase
      .from("messages")
      .insert({
        shopper_id: shopperId,
        client_user_id: clientUserId,
        sender_id: userId,
        body: data.body.trim(),
      })
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message);

    // Push notify the other party (best-effort)
    try {
      const { data: tokenRows } = await supabaseAdmin
        .from("device_tokens")
        .select("token")
        .eq("user_id", other);
      const tokens = (tokenRows ?? []).map((r) => r.token);
      if (tokens.length > 0) {
        const { data: senderProfile } = await supabaseAdmin
          .from("profiles")
          .select("full_name, email")
          .eq("id", userId)
          .maybeSingle();
        const senderName =
          senderProfile?.full_name ||
          (senderProfile?.email ? senderProfile.email.split("@")[0] : "Sellier");
        const preview = data.body.trim().slice(0, 140);
        const { sendFcmToTokens } = await import("./fcm.server");
        const isShopperSender = userId === shopperId;
        await sendFcmToTokens(tokens, {
          title: isShopperSender ? `${senderName} · Sellier` : `${senderName}`,
          body: preview,
          url: isShopperSender ? "/messages" : "/messages",
        });
      }
    } catch (err) {
      console.error("[sendMessage] push failed", err);
    }

    return { id: inserted.id, createdAt: inserted.created_at };
  });

const markReadSchema = z.object({ otherUserId: z.string().uuid() });

/**
 * Mark every message from `otherUserId` to the signed-in user as read.
 */
export const markMessagesRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => markReadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();
    // Update messages where I'm the recipient and they're unread
    const { error: e1 } = await supabase
      .from("messages")
      .update({ read_by_client_at: now })
      .eq("client_user_id", userId)
      .eq("shopper_id", data.otherUserId)
      .is("read_by_client_at", null);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await supabase
      .from("messages")
      .update({ read_by_shopper_at: now })
      .eq("shopper_id", userId)
      .eq("client_user_id", data.otherUserId)
      .is("read_by_shopper_at", null);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });
