import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MobileLayout } from "@/components/MobileLayout";
import { useAuth } from "@/hooks/useAuth";
import {
  getLaunchCreditAdminStatus,
  setLaunchCreditEnabled,
  killAllLaunchCredits,
} from "@/lib/launch-credit.functions";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/launch-credit")({
  head: () => ({
    meta: [
      { title: "Launch credit — Sellier Admin" },
      { name: "description", content: "Monitor and control the launch credit promotion." },
    ],
  }),
  component: LaunchCreditAdminPage,
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

const LONDON = "Europe/London";

function formatLondon(value: string | null | undefined) {
  if (!value) return "—";
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

function LaunchCreditAdminPage() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchStatus = useServerFn(getLaunchCreditAdminStatus);
  const setEnabled = useServerFn(setLaunchCreditEnabled);
  const killAll = useServerFn(killAllLaunchCredits);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [killResult, setKillResult] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { next: "/admin/launch-credit" } });
  }, [loading, user, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-launch-credit"],
    queryFn: () => fetchStatus(),
    enabled: !!user && isAdmin,
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setEnabled({ data: { enabled } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-launch-credit"] }),
  });

  const kill = useMutation({
    mutationFn: () => killAll({ data: { reason: "Bulk kill switch (admin console)" } }),
    onSuccess: (res) => {
      setKillResult(`${res.deactivated} code${res.deactivated === 1 ? "" : "s"} deactivated.`);
      setConfirmOpen(false);
      setConfirmText("");
      queryClient.invalidateQueries({ queryKey: ["admin-launch-credit"] });
    },
  });

  if (loading || (user && isAdmin && isLoading)) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  if (user && !isAdmin) {
    return (
      <MobileLayout>
        <div className="px-6 py-16 text-center">
          <h1 className="font-serif text-2xl mb-2">Admins only</h1>
          <Link to="/account">
            <Button className="mt-4">Back</Button>
          </Link>
        </div>
      </MobileLayout>
    );
  }

  if (error) {
    return (
      <MobileLayout>
        <div className="px-6 py-16 text-center text-sm text-muted-foreground">{error.message}</div>
      </MobileLayout>
    );
  }

  if (!data) return null;

  const config = data.config;
  const enabled = !!config?.enabled;
  const liveCount = data.counts.live;

  return (
    <MobileLayout>
      <div className="px-6 pt-8 pb-4 border-b border-border/60">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1">Admin</p>
        <h1 className="font-serif text-3xl">Launch credit</h1>
      </div>

      <section className="px-6 py-6 border-b border-border/60">
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
          Status
        </p>
        <p className="font-serif text-3xl">{enabled ? "ENABLED" : "DISABLED"}</p>
        {!config && (
          <p className="mt-2 text-xs text-muted-foreground">
            No configuration row found (launch_credit_config id = 1).
          </p>
        )}
        {config && (
          <div className="mt-4 space-y-1 text-sm">
            <p>
              Amount: <span className="font-serif">£{Number(config.amount_gbp)}</span> per code
            </p>
            <p className="text-muted-foreground text-xs">
              Opens {formatLondon(config.starts_at)} (London)
            </p>
            <p className="text-muted-foreground text-xs">
              Closes {formatLondon(config.ends_at)} (London)
            </p>
            <p className="text-muted-foreground text-xs">
              Max codes: {config.max_codes} · Verified email required:{" "}
              {config.require_verified_email ? "yes" : "no"}
            </p>
          </div>
        )}
      </section>

      <section className="px-6 py-6 border-b border-border/60">
        <h2 className="font-serif text-xl mb-4">Codes</h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Issued" value={data.counts.total.toLocaleString()} />
          <Stat label="Redeemed" value={data.counts.redeemed.toLocaleString()} />
          <Stat label="Revoked" value={data.counts.revoked.toLocaleString()} />
          <Stat label="Live" value={liveCount.toLocaleString()} />
        </div>
      </section>

      <section className="px-6 py-6 border-b border-border/60">
        <h2 className="font-serif text-xl mb-4">Issuance</h2>
        <div className="flex items-center gap-3">
          <Button
            variant={enabled ? "outline" : "default"}
            disabled={toggle.isPending || !config}
            onClick={() => toggle.mutate(!enabled)}
          >
            {toggle.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : enabled ? (
              "Disable promotion"
            ) : (
              "Enable promotion"
            )}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Disabling stops new codes being issued. It does NOT stop codes already issued from being
          redeemed.
        </p>
        {toggle.error && (
          <p className="mt-2 text-xs text-destructive">{(toggle.error as Error).message}</p>
        )}
      </section>

      <section className="px-6 py-6 border-b border-border/60">
        <h2 className="font-serif text-xl mb-2">Danger zone</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Deactivates every outstanding code in Shopify. Already-redeemed codes are left alone.
          This cannot be undone.
        </p>
        <Button
          variant="destructive"
          disabled={kill.isPending}
          onClick={() => {
            setKillResult(null);
            kill.reset();
            setConfirmText("");
            setConfirmOpen(true);
          }}
        >
          Kill all outstanding codes
        </Button>
        {killResult && <p className="mt-3 text-sm">{killResult}</p>}
        {kill.error && (
          <p className="mt-3 text-xs text-destructive">{(kill.error as Error).message}</p>
        )}
      </section>

      <section className="px-6 py-6">
        <h2 className="font-serif text-xl mb-4">Recent redemptions</h2>
        {data.recentRedemptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No codes have been redeemed yet.</p>
        ) : (
          <div className="divide-y divide-border/60 border-y border-border/60">
            {data.recentRedemptions.map((r) => (
              <div key={r.code} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-mono">{r.code}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatLondon(r.redeemed_at)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{r.email}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kill all outstanding codes?</DialogTitle>
            <DialogDescription>
              This will deactivate {liveCount} live code{liveCount === 1 ? "" : "s"} in Shopify.
              Codes that have already been redeemed are left alone. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Type KILL to confirm.
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="KILL"
              autoComplete="off"
            />
          </div>
          {kill.error && (
            <p className="text-xs text-destructive">{(kill.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={kill.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== "KILL" || kill.isPending}
              onClick={() => kill.mutate()}
            >
              {kill.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kill codes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MobileLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border/60 p-4">
      <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1">{label}</p>
      <p className="font-serif text-2xl">{value}</p>
    </div>
  );
}
