import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileLayout } from "@/components/MobileLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Loader2, Mail } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/edits")({
  head: () => ({
    meta: [
      { title: "My Edits — Sellier Knightsbridge" },
      { name: "description", content: "Personal edits curated for you by your Sellier shopper." },
    ],
  }),
  component: EditsPage,
});

interface EditRow {
  id: string;
  title: string;
  note: string | null;
  status: "draft" | "sent" | "viewed";
  created_at: string;
  sent_at: string | null;
}

function EditsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", search: { next: "/edits" } });
    }
  }, [loading, user, navigate]);

  // Realtime: refresh list when a new edit arrives
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("edits-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "edits" },
        () => queryClient.invalidateQueries({ queryKey: ["my-edits"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const { data: edits = [], isLoading } = useQuery({
    queryKey: ["my-edits", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<EditRow[]> => {
      const { data, error } = await supabase
        .from("edits")
        .select("id, title, note, status, created_at, sent_at")
        .neq("status", "draft")
        .order("sent_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data as EditRow[];
    },
  });

  if (loading || !user) {
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
      <div className="px-6 pt-8 pb-4 border-b border-border/60">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1">For you</p>
        <h1 className="font-serif text-3xl">My Edits</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Curated by your personal shopper.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : edits.length === 0 ? (
        <div className="px-6 py-20 text-center">
          <Sparkles className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
          <h2 className="font-serif text-xl mb-2">No edits yet</h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            When your shopper sends you a personal edit, it'll appear here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {edits.map((edit) => (
            <Link
              key={edit.id}
              to="/edits/$id"
              params={{ id: edit.id }}
              className="block px-6 py-5 active:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
                    {edit.sent_at
                      ? formatDistanceToNow(new Date(edit.sent_at), { addSuffix: true })
                      : "Just now"}
                  </p>
                  <h3 className="font-serif text-lg leading-tight">{edit.title}</h3>
                  {edit.note && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{edit.note}</p>
                  )}
                </div>
                {edit.status === "sent" && (
                  <span className="mt-1 h-2 w-2 rounded-full bg-foreground shrink-0" />
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </MobileLayout>
  );
}
