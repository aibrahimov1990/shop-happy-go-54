import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const editSchema = z.object({
  id: z.string().uuid(),
});

export interface AccessibleEditItem {
  id: string;
  shopify_handle: string;
  title: string;
  image_url: string | null;
  price_amount: number | null;
  price_currency: string | null;
}

export interface AccessibleEdit {
  id: string;
  title: string;
  note: string | null;
  status: "draft" | "sent" | "viewed";
  sent_at: string | null;
  shopper_id: string;
  edit_items: AccessibleEditItem[];
}

export const getAccessibleEdit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => editSchema.parse(input))
  .handler(async ({ data, context }): Promise<AccessibleEdit | null> => {
    const { userId, claims, supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: edit, error } = await supabaseAdmin
      .from("edits")
      .select(
        "id, title, note, status, sent_at, shopper_id, client_email, client_user_id, edit_items(id, shopify_handle, title, image_url, price_amount, price_currency)",
      )
      .eq("id", data.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!edit) return null;

    const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
    const clientEmail = typeof edit.client_email === "string" ? edit.client_email.toLowerCase() : "";
    const ownsEdit = edit.client_user_id === userId || edit.shopper_id === userId || (email && clientEmail === email);

    let isAdmin = false;
    if (!ownsEdit) {
      const { data: roleResult, error: roleError } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      if (roleError) throw new Error(roleError.message);
      isAdmin = roleResult === true;
    }

    if (!ownsEdit && !isAdmin) return null;

    return {
      id: edit.id,
      title: edit.title,
      note: edit.note,
      status: edit.status,
      sent_at: edit.sent_at,
      shopper_id: edit.shopper_id,
      edit_items: (edit.edit_items ?? []) as AccessibleEditItem[],
    };
  });
