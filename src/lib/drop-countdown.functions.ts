import { createServerFn } from "@tanstack/react-start";

export const getDropCountdown = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const { toIso } = await import("./drop-countdown.server");
  type DropCountdown = import("./drop-countdown.server").DropCountdown;
  type Database = import("@/integrations/supabase/types").Database;

  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["SUPABASE_ANON_KEY"]!;
  const supabasePublic = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });

  const { data, error } = await supabasePublic
    .from("drop_countdown_config")
    .select("enabled, headline, show_from, starts_at, hide_at, live_message")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || !data.enabled) return null;

  const result: DropCountdown = {
    enabled: true,
    headline: data.headline,
    showFrom: toIso(data.show_from, "show_from"),
    startsAt: toIso(data.starts_at, "starts_at"),
    hideAt: toIso(data.hide_at, "hide_at"),
    liveMessage: data.live_message,
  };
  return result;
});
