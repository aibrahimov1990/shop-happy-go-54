import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_ACTIVE_SEARCHES = 10;

const nullableTrimmed = z
  .string()
  .max(100)
  .transform((v) => v.trim())
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const createSchema = z
  .object({
    brand: nullableTrimmed,
    keyword: nullableTrimmed,
    product_type: nullableTrimmed,
    max_price: z
      .number()
      .positive()
      .max(10_000_000)
      .nullable()
      .optional()
      .transform((v) => v ?? null),
  })
  .refine((v) => v.brand || v.keyword || v.product_type, {
    message: "Set at least one of brand, keyword, or product type",
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean().optional(),
  brand: nullableTrimmed,
  keyword: nullableTrimmed,
  product_type: nullableTrimmed,
  max_price: z
    .number()
    .positive()
    .max(10_000_000)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

const idSchema = z.object({ id: z.string().uuid() });

export const listMySavedSearches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("saved_searches")
      .select("id, brand, keyword, product_type, max_price, active, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { count, error: countErr } = await supabase
      .from("saved_searches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("active", true);
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) >= MAX_ACTIVE_SEARCHES) {
      throw new Error(
        `You can have up to ${MAX_ACTIVE_SEARCHES} active alerts. Pause or delete one to add another.`,
      );
    }

    const { data: row, error } = await supabase
      .from("saved_searches")
      .insert({
        user_id: userId,
        brand: data.brand,
        keyword: data.keyword,
        product_type: data.product_type,
        max_price: data.max_price,
        active: true,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // If activating this one, enforce the cap.
    if (data.active === true) {
      const { count } = await supabase
        .from("saved_searches")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("active", true)
        .neq("id", data.id);
      if ((count ?? 0) >= MAX_ACTIVE_SEARCHES) {
        throw new Error(
          `You can have up to ${MAX_ACTIVE_SEARCHES} active alerts. Pause or delete one to activate this.`,
        );
      }
    }

    const patch = {
      brand: data.brand,
      keyword: data.keyword,
      product_type: data.product_type,
      max_price: data.max_price,
      ...(typeof data.active === "boolean" ? { active: data.active } : {}),
    };

    const { data: row, error } = await supabase
      .from("saved_searches")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("saved_searches")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
