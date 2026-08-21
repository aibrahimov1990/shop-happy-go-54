import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ConversationSummary {
  otherUserId: string;
  otherLabel: string;
  lastBody: string;
  lastAt: string;
  unread: number;
  iAmShopper: boolean;
}

/**
 * List every conversation the signed-in user is part of, newest first.
 */
export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConversationSummary[]> => {
    const { supabase, userId } = context;

    const { data, error } = await supabase
      .from("messages")
      .select(
        "id, shopper_id, client_user_id, sender_id, body, created_at, read_by_client_at, read_by_shopper_at",
      )
      .or(`shopper_id.eq.${userId},client_user_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const map = new Map<string, ConversationSummary>();
    for (const m of rows) {
      const iAmShopper = m.shopper_id === userId;
      const other = iAmShopper ? m.client_user_id : m.shopper_id;
      if (!other) continue;
      const existing = map.get(other);
      const incomingUnread =
        m.sender_id !== userId &&
        (iAmShopper ? m.read_by_shopper_at === null : m.read_by_client_at === null);
      if (!existing) {
        map.set(other, {
          otherUserId: other,
          otherLabel: other,
          lastBody: m.body,
          lastAt: m.created_at,
          unread: incomingUnread ? 1 : 0,
          iAmShopper,
        });
      } else if (incomingUnread) {
        existing.unread += 1;
      }
    }

    const ids = [...map.keys()];
    if (ids.length === 0) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", ids);
    for (const p of profiles ?? []) {
      const conv = map.get(p.id);
      if (conv) conv.otherLabel = p.full_name || p.email || p.id;
    }

    return [...map.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  });

const counterpartSchema = z.object({ otherUserId: z.string().uuid() });

/**
 * Resolve a display label for a chat counterpart the signed-in user shares
 * a conversation or an edit with.
 */
export const getCounterpartLabel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => counterpartSchema.parse(input))
  .handler(async ({ data, context }): Promise<string> => {
    const { supabase, userId } = context;
    const other = data.otherUserId;

    const { data: msg } = await supabase
      .from("messages")
      .select("id")
      .or(
        `and(shopper_id.eq.${userId},client_user_id.eq.${other}),and(shopper_id.eq.${other},client_user_id.eq.${userId})`,
      )
      .limit(1)
      .maybeSingle();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!msg) {
      const { data: edit } = await supabaseAdmin
        .from("edits")
        .select("id")
        .or(
          `and(shopper_id.eq.${userId},client_user_id.eq.${other}),and(shopper_id.eq.${other},client_user_id.eq.${userId})`,
        )
        .limit(1)
        .maybeSingle();
      if (!edit) throw new Error("No conversation with this person");
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("id", other)
      .maybeSingle();
    return profile?.full_name || profile?.email || "Sellier";
  });
