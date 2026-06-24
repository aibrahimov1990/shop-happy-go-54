import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileLayout } from "@/components/MobileLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Crown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/shopper/")({
  head: () => ({
    meta: [
      { title: "Shopper — Sellier Knightsbridge" },
      { name: "description", content: "Create personal edits for your clients." },
    ],
  }),
  component: ShopperHome,
});

interface ShopperEdit {
  id: string;
  title: string;
  client_email: string;
  status: "draft" | "sent" | "viewed";
  created_at: string;
  sent_at: string | null;
  viewed_at: string | null;
}

function ShopperHome() {
  const { user, loading, isShopper, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", search: { next: "/shopper" } });
    }
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  if (!isShopper) {
    return <BootstrapAdmin />;
  }

  return <ShopperEditsList isAdmin={isAdmin} />;
}

function BootstrapAdmin() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const { data: adminExists, isLoading: checking } = useQuery({
    queryKey: ["admin-exists"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });

  const claim = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("user_roles")
        .insert([
          { user_id: user.id, role: "admin" },
          { user_id: user.id, role: "shopper" },
        ]);
      if (error) throw error;
      toast.success("You're now an admin. Reloading…");
      await queryClient.invalidateQueries();
      window.location.reload();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to claim admin");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="px-6 py-16 text-center">
        <Crown className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
        <h1 className="font-serif text-2xl mb-2">Shopper area</h1>
        {adminExists ? (
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            This area is for personal shoppers. Ask an existing admin to grant you shopper access.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6">
              No admin set up yet. Claim admin access to start creating personal edits for clients.
            </p>
            <Button onClick={claim} disabled={loading} className="text-[11px] uppercase tracking-[0.25em]">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Become first admin"}
            </Button>
          </>
        )}
      </div>
    </MobileLayout>
  );
}

function ShopperEditsList({ isAdmin }: { isAdmin: boolean }) {
  const { data: edits = [], isLoading } = useQuery({
    queryKey: ["shopper-edits"],
    queryFn: async (): Promise<ShopperEdit[]> => {
      const { data, error } = await supabase
        .from("edits")
        .select("id, title, client_email, status, created_at, sent_at, viewed_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ShopperEdit[];
    },
  });

  return (
    <MobileLayout>
      <div className="px-6 pt-8 pb-4 border-b border-border/60 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1">
            {isAdmin ? "Admin · Shopper" : "Personal shopper"}
          </p>
          <h1 className="font-serif text-3xl">Edits</h1>
        </div>
        <Link to="/shopper/new">
          <Button size="sm" className="text-[10px] uppercase tracking-[0.25em] h-10">
            <Plus className="h-3 w-3 mr-1" /> New
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : edits.length === 0 ? (
        <div className="px-6 py-20 text-center">
          <h2 className="font-serif text-xl mb-2">No edits yet</h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6">
            Curate pieces for a client and send them a personal edit.
          </p>
          <Link to="/shopper/new">
            <Button className="text-[11px] uppercase tracking-[0.25em]">Create your first edit</Button>
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {edits.map((edit) => (
            <div key={edit.id} className="px-6 py-5">
              <div className="flex items-start justify-between gap-3 mb-1">
                <h3 className="font-serif text-lg leading-tight flex-1">{edit.title}</h3>
                <StatusBadge status={edit.status} />
              </div>
              <p className="text-xs text-muted-foreground">{edit.client_email}</p>
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mt-2">
                {edit.sent_at
                  ? `Sent ${formatDistanceToNow(new Date(edit.sent_at), { addSuffix: true })}`
                  : `Created ${formatDistanceToNow(new Date(edit.created_at), { addSuffix: true })}`}
                {edit.viewed_at && ` · Viewed ${formatDistanceToNow(new Date(edit.viewed_at), { addSuffix: true })}`}
              </p>
            </div>
          ))}
        </div>
      )}
    </MobileLayout>
  );
}

function StatusBadge({ status }: { status: "draft" | "sent" | "viewed" }) {
  const styles = {
    draft: "bg-muted text-muted-foreground",
    sent: "bg-foreground text-background",
    viewed: "bg-secondary text-foreground",
  } as const;
  return (
    <span className={`text-[9px] uppercase tracking-[0.2em] px-2 py-1 ${styles[status]}`}>
      {status}
    </span>
  );
}
