import { createFileRoute } from "@tanstack/react-router";

// Runs due scheduled push broadcasts. Called by pg_cron every 5 minutes.
// Auth: shared x-push-hook-secret header (same pattern as the other push hooks).

export const Route = createFileRoute("/api/public/hooks/run-scheduled-broadcasts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-push-hook-secret") ?? "";
        const expected = process.env.PUSH_HOOK_SECRET ?? "";
        if (!expected) {
          console.error("[run-scheduled-broadcasts] PUSH_HOOK_SECRET is not configured");
          return new Response("Server misconfigured", { status: 500 });
        }
        // Timing-safe comparison to avoid leaking the secret via response timing.
        const a = new TextEncoder().encode(provided);
        const b = new TextEncoder().encode(expected);
        let equal = a.length === b.length;
        const len = Math.max(a.length, b.length);
        for (let i = 0; i < len; i++) {
          if ((a[i] ?? 0) !== (b[i] ?? 0)) equal = false;
        }
        if (!equal) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as any;

        const { data: due, error } = await admin
          .from("broadcasts")
          .select("id")
          .eq("status", "scheduled")
          .lte("scheduled_for", new Date().toISOString())
          .order("scheduled_for", { ascending: true })
          .limit(10);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const considered = (due ?? []).length;
        let claimed = 0;
        let sent = 0;
        let failed = 0;

        const { runBroadcast } = await import("@/lib/broadcast-runner.server");

        for (const row of due ?? []) {
          // Atomic claim — the only thing preventing a double-send.
          const { data: claimedRows, error: claimErr } = await admin
            .from("broadcasts")
            .update({ status: "sending" })
            .eq("id", row.id)
            .eq("status", "scheduled")
            .select("id");
          if (claimErr) {
            console.error("[run-scheduled-broadcasts] claim failed", row.id, claimErr.message);
            continue;
          }
          if ((claimedRows?.length ?? 0) === 0) continue; // another run took it
          claimed++;

          try {
            await runBroadcast(row.id);
            sent++;
          } catch (err) {
            failed++;
            const message = err instanceof Error ? err.message : String(err);
            console.error("[run-scheduled-broadcasts] send failed", row.id, message);
            await admin
              .from("broadcasts")
              .update({ status: "failed", completed_at: new Date().toISOString() })
              .eq("id", row.id);
          }
        }

        return Response.json({ ok: true, considered, claimed, sent, failed });
      },
    },
  },
});
