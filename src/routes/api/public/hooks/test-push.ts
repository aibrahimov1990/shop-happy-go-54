import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/test-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body = (await request.json()) as {
          email: string;
          title: string;
          body: string;
          url?: string;
          imageUrl?: string;
        };

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as any;

        const { data: profile } = await admin
          .from("profiles")
          .select("id")
          .ilike("email", body.email)
          .maybeSingle();
        if (!profile) return Response.json({ error: "no_profile" }, { status: 404 });

        const { data: tokenRows } = await admin
          .from("device_tokens")
          .select("token")
          .eq("user_id", profile.id);
        const tokens = (tokenRows ?? []).map((r: any) => r.token);
        if (tokens.length === 0) return Response.json({ error: "no_devices" }, { status: 404 });

        const { sendFcmToTokens } = await import("@/lib/fcm.server");
        const results = await sendFcmToTokens(tokens, {
          title: body.title,
          body: body.body,
          url: body.url,
          imageUrl: body.imageUrl,
        });

        return Response.json({
          tokens: tokens.length,
          results: results.map((r) => ({ ok: r.ok, error: r.error?.slice(0, 400) })),
        });
      },
    },
  },
});
