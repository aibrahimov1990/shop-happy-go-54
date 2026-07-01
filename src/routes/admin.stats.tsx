import { useEffect } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MobileLayout } from "@/components/MobileLayout";
import { useAuth } from "@/hooks/useAuth";
import { getAdminStats } from "@/lib/stats.functions";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/stats")({
  head: () => ({
    meta: [
      { title: "Statistics — Sellier Admin" },
      { name: "description", content: "App usage statistics." },
    ],
  }),
  component: StatsPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="font-serif text-xl">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Button className="mt-4" onClick={() => { router.invalidate(); reset(); }}>
          Try again
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-8">Not found</div>,
});

function formatDuration(ms: number) {
  if (!ms) return "0s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function StatsPage() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const fetchStats = useServerFn(getAdminStats);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { next: "/admin/stats" } });
  }, [loading, user, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => fetchStats(),
    enabled: !!user && isAdmin,
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
          <Link to="/account"><Button className="mt-4">Back</Button></Link>
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

  const maxTrend = Math.max(1, ...data.users.signupTrend.map((r) => r.count));

  return (
    <MobileLayout>
      <div className="px-6 pt-8 pb-4 border-b border-border/60">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1">Admin</p>
        <h1 className="font-serif text-3xl">Statistics</h1>
      </div>

      <Section title="Users">
        <StatGrid>
          <Stat label="Total users" value={data.users.total.toLocaleString()} />
          <Stat label="New (14d)" value={data.users.newLast14d.toLocaleString()} />
        </StatGrid>
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
            Signups — last 14 days
          </p>
          <div className="flex items-end gap-1 h-24">
            {data.users.signupTrend.map((row) => (
              <div key={row.date} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-foreground/80 rounded-sm"
                  style={{ height: `${(row.count / maxTrend) * 100}%`, minHeight: row.count ? 2 : 0 }}
                  title={`${row.date}: ${row.count}`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
            <span>{data.users.signupTrend[0]?.date.slice(5)}</span>
            <span>{data.users.signupTrend[data.users.signupTrend.length - 1]?.date.slice(5)}</span>
          </div>
        </div>
      </Section>

      <Section title="Engagement (30d)">
        <StatGrid>
          <Stat label="Sessions" value={data.engagement.sessions30d.toLocaleString()} />
          <Stat label="Avg session" value={formatDuration(data.engagement.avgSessionMs)} />
          <Stat label="Sessions (24h)" value={data.engagement.sessions24h.toLocaleString()} />
          <Stat label="Active users (24h)" value={data.engagement.uniqueUsers24h.toLocaleString()} />
        </StatGrid>

        <div className="mt-6">
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
            Most engaged users
          </p>
          {data.engagement.topUsers.length === 0 ? (
            <p className="text-xs text-muted-foreground">No data yet.</p>
          ) : (
            <div className="divide-y divide-border/60 border-y border-border/60">
              {data.engagement.topUsers.map((u) => (
                <div key={u.email} className="flex items-center justify-between py-3 gap-3">
                  <span className="text-sm truncate flex-1">{u.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDuration(u.totalMs)} · {u.sessions} sess.
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6">
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
            Most viewed screens
          </p>
          {data.engagement.topScreens.length === 0 ? (
            <p className="text-xs text-muted-foreground">No data yet.</p>
          ) : (
            <div className="divide-y divide-border/60 border-y border-border/60">
              {data.engagement.topScreens.map((s) => (
                <div key={s.screen} className="flex items-center justify-between py-3 gap-3">
                  <span className="text-sm font-mono truncate flex-1">{s.screen}</span>
                  <span className="text-xs text-muted-foreground">{s.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section title="Push reach">
        <StatGrid>
          <Stat label="Total devices" value={data.push.totalTokens.toLocaleString()} />
          <Stat label="Signed in" value={data.push.signedIn.toLocaleString()} />
          <Stat label="Anonymous" value={data.push.anonymous.toLocaleString()} />
        </StatGrid>
      </Section>

      <Section title="Edits">
        <StatGrid>
          <Stat label="Total" value={data.edits.total.toLocaleString()} />
          <Stat label="Sent" value={data.edits.sent.toLocaleString()} />
          <Stat label="Viewed" value={data.edits.viewed.toLocaleString()} />
        </StatGrid>
      </Section>
    </MobileLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-6 py-6 border-b border-border/60">
      <h2 className="font-serif text-xl mb-4">{title}</h2>
      {children}
    </section>
  );
}
function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border/60 p-4">
      <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1">{label}</p>
      <p className="font-serif text-2xl">{value}</p>
    </div>
  );
}
