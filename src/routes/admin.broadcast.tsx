import { useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { listBroadcasts, sendBroadcast } from "@/lib/push.functions";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/broadcast")({
  component: BroadcastPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="font-serif text-xl">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Button
          className="mt-4"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          Try again
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-8">Not found</div>,
});

function BroadcastPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fetchBroadcasts = useServerFn(listBroadcasts);
  const send = useServerFn(sendBroadcast);
  const qc = useQueryClient();

  const adminQuery = useQuery({
    queryKey: ["isAdmin", user?.id],
    enabled: !loading && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user!.id,
        _role: "admin",
      });
      if (error) throw error;
      return data === true;
    },
  });

  const broadcastsQuery = useQuery({
    queryKey: ["broadcasts"],
    queryFn: () => fetchBroadcasts(),
    enabled: adminQuery.data === true,
  });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");

  const mutation = useMutation({
    mutationFn: (input: { title: string; body: string; url: string }) =>
      send({ data: { title: input.title, body: input.body, url: input.url || undefined } }),
    onSuccess: (res) => {
      const errBreakdown = Object.entries(res.errorCounts ?? {})
        .map(([k, n]) => `${n}× ${k}`)
        .join(", ");
      const registeredCount = res.registeredTokenCount ?? res.totalTokens;
      const apnsCredentialMessage = res.apnsCredentialIssue
        ? " — APNs credential issue in Firebase: upload/replace the Apple Push Notifications Auth Key (.p8) for com.sellierknightsbridge.app"
        : "";
      toast.success(
        (res.topicSubmitted
          ? `Submitted to app broadcast channel (${registeredCount} registered device${registeredCount === 1 ? "" : "s"} currently visible)`
          : `Submitted to ${res.successCount} of ${res.totalTokens} registered device${res.totalTokens === 1 ? "" : "s"}`) +
          (res.failureCount ? ` — ${res.failureCount} failed${errBreakdown ? ` (${errBreakdown})` : ""}` : "") +
          apnsCredentialMessage +
          (res.topicError && !res.topicSubmitted ? ` — channel error: ${res.topicError.slice(0, 120)}` : "") +
          (res.prunedTokens ? `; pruned ${res.prunedTokens} stale token${res.prunedTokens === 1 ? "" : "s"}` : ""),
        { duration: res.apnsCredentialIssue ? 14000 : 8000 },
      );
      if (res.errorSamples && res.errorSamples.length > 0) {
        console.warn("[broadcast] FCM error samples", res.errorSamples);
      }
      setTitle("");
      setBody("");
      setUrl("");
      qc.invalidateQueries({ queryKey: ["broadcasts"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!loading && !user) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="font-serif text-2xl">Sign in required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with your admin account to send broadcasts.
        </p>
        <Button
          className="mt-6"
          onClick={() => navigate({ to: "/auth", search: { next: "/admin/broadcast" } })}
        >
          Sign in
        </Button>
      </div>
    );
  }

  if (loading || adminQuery.isLoading || adminQuery.isFetching) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (adminQuery.isError || adminQuery.data !== true) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="font-serif text-2xl">Restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You need an admin account to send broadcasts.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center bg-foreground px-6 py-3 text-[11px] uppercase tracking-[0.25em] text-background"
        >
          Go home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-serif text-3xl">Send a push broadcast</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sent through the app broadcast channel, plus registered devices as fallback.
      </p>

      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim() || !body.trim()) {
            toast.error("Title and message are required");
            return;
          }
          if (!confirm(`Send "${title}" to all devices?`)) return;
          mutation.mutate({ title: title.trim(), body: body.trim(), url: url.trim() });
        }}
      >
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="New arrivals just dropped"
            required
          />
        </div>
        <div>
          <Label htmlFor="body">Message</Label>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Hermès, Chanel and more — shop now before they're gone."
            required
          />
        </div>
        <div>
          <Label htmlFor="url">Open in app (optional)</Label>
          <Input
            id="url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/shop"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Use an in-app path like <code>/shop</code>, <code>/wishlist</code>, or <code>/edits/&lt;id&gt;</code> so the tap opens the app screen. A full https link will open the website instead.
          </p>
        </div>
        <Button type="submit" disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? "Sending…" : "Send broadcast"}
        </Button>
      </form>

      <div className="mt-12">
        <h2 className="font-serif text-xl">Recent broadcasts</h2>
        <div className="mt-4 space-y-3">
          {broadcastsQuery.data?.broadcasts.length === 0 && (
            <p className="text-sm text-muted-foreground">No broadcasts sent yet.</p>
          )}
          {broadcastsQuery.data?.broadcasts.map((b) => (
            <div key={b.id} className="border border-border p-4">
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-serif text-base">{b.title}</p>
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {new Date(b.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{b.body}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                ✓ submitted · {b.success_count} registered · ✕ {b.failure_count} failed
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
