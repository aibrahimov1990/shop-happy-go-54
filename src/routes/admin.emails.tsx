import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getEmailStats } from "@/lib/email-admin.functions";
import { MobileLayout } from "@/components/MobileLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/emails")({
  head: () => ({ meta: [{ title: "Email activity — Sellier admin" }] }),
  component: AdminEmailsPage,
});

type Range = "24h" | "7d" | "30d";

function AdminEmailsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>("7d");
  const [templateFilter, setTemplateFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const isAdminQuery = useQuery({
    queryKey: ["isAdmin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user!.id,
        _role: "admin",
      });
      if (error) throw error;
      return data === true;
    },
  });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { next: "/admin/emails" } });
  }, [loading, user, navigate]);

  const fetchStats = useServerFn(getEmailStats);
  const statsQuery = useQuery({
    queryKey: ["emailStats", range, templateFilter, statusFilter],
    enabled: isAdminQuery.data === true,
    queryFn: () => fetchStats({ data: { range, templateFilter, statusFilter } }),
    refetchInterval: 15_000,
  });

  if (loading || isAdminQuery.isLoading) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  if (isAdminQuery.data === false) {
    return (
      <MobileLayout>
        <div className="px-6 py-20 text-center">
          <h1 className="font-serif text-2xl mb-2">Admins only</h1>
          <p className="text-sm text-muted-foreground">You don't have access to this page.</p>
        </div>
      </MobileLayout>
    );
  }

  const stats = statsQuery.data?.stats;
  const rows = statsQuery.data?.rows ?? [];
  const templates = statsQuery.data?.templates ?? [];

  return (
    <MobileLayout>
      <div className="px-6 pt-4 pb-2">
        <Link to="/" className="inline-flex items-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          <ArrowLeft className="h-3 w-3 mr-1" /> Back
        </Link>
      </div>

      <div className="px-6 pt-2 pb-4 border-b border-border/60">
        <h1 className="font-serif text-3xl">Email activity</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Edits sent from personal shoppers to clients.
        </p>
      </div>

      {/* Time range filter */}
      <div className="px-6 py-4 border-b border-border/60 flex gap-2">
        {(["24h", "7d", "30d"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`flex-1 text-[10px] uppercase tracking-[0.25em] py-2 border ${
              range === r ? "bg-foreground text-background border-foreground" : "border-border"
            }`}
          >
            {r === "24h" ? "24 hours" : r === "7d" ? "7 days" : "30 days"}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="px-6 py-4 grid grid-cols-2 gap-3 border-b border-border/60">
        <StatCard label="Total" value={stats?.total ?? 0} />
        <StatCard label="Sent" value={stats?.sent ?? 0} tone="ok" />
        <StatCard label="Failed" value={stats?.failed ?? 0} tone="error" />
        <StatCard label="Suppressed" value={stats?.suppressed ?? 0} tone="warn" />
      </div>

      {/* Filters */}
      <div className="px-6 py-4 space-y-3 border-b border-border/60">
        <div>
          <label className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground block mb-2">
            Template
          </label>
          <select
            value={templateFilter ?? ""}
            onChange={(e) => setTemplateFilter(e.target.value || null)}
            className="w-full h-10 px-3 text-sm bg-background border border-border"
          >
            <option value="">All templates</option>
            {templates.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground block mb-2">
            Status
          </label>
          <select
            value={statusFilter ?? ""}
            onChange={(e) => setStatusFilter(e.target.value || null)}
            className="w-full h-10 px-3 text-sm bg-background border border-border"
          >
            <option value="">All statuses</option>
            <option value="sent">Sent</option>
            <option value="pending">Pending</option>
            <option value="dlq">Failed</option>
            <option value="bounced">Bounced</option>
            <option value="suppressed">Suppressed</option>
            <option value="complained">Complained</option>
          </select>
        </div>
      </div>

      {/* Log */}
      <div className="px-6 py-4">
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
          Recent ({rows.length})
        </p>
        {statsQuery.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No emails yet.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="border border-border/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs truncate">{r.recipient_email}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {r.template_name} · {new Date(r.created_at).toLocaleString()}
                    </p>
                    {r.error_message ? (
                      <p className="text-[10px] text-red-600 mt-1">{r.error_message}</p>
                    ) : null}
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "error" | "warn";
}) {
  const color =
    tone === "ok"
      ? "text-green-700"
      : tone === "error"
        ? "text-red-700"
        : tone === "warn"
          ? "text-amber-700"
          : "text-foreground";
  return (
    <div className="border border-border/60 p-3">
      <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</p>
      <p className={`font-serif text-2xl mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    sent: "bg-green-100 text-green-800",
    pending: "bg-gray-100 text-gray-800",
    dlq: "bg-red-100 text-red-800",
    failed: "bg-red-100 text-red-800",
    bounced: "bg-red-100 text-red-800",
    suppressed: "bg-amber-100 text-amber-800",
    complained: "bg-amber-100 text-amber-800",
  };
  return (
    <span
      className={`text-[9px] uppercase tracking-[0.15em] px-2 py-1 ${map[status] ?? "bg-gray-100 text-gray-800"}`}
    >
      {status}
    </span>
  );
}
