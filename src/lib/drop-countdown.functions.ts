import { createServerFn } from "@tanstack/react-start";

export const getDropCountdown = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { toIso } = await import("./drop-countdown.server");
  type DropCountdown = import("./drop-countdown.server").DropCountdown;

  const { data, error } = await supabaseAdmin
    .from("drop_countdown_config")
    .select("enabled, headline, starts_at, hide_at, live_message")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || !data.enabled) return null;

  const result: DropCountdown = {
    enabled: true,
    headline: data.headline,
    startsAt: toIso(data.starts_at, "starts_at"),
    hideAt: toIso(data.hide_at, "hide_at"),
    liveMessage: data.live_message,
  };
  return result;
});
