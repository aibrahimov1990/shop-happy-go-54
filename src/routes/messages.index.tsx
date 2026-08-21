import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MobileLayout } from "@/components/MobileLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { listConversations, type ConversationSummary } from "@/lib/conversations.functions";

export const Route = createFileRoute("/messages/")({
  head: () => ({
    meta: [
      { title: "Messages — Sellier Knightsbridge" },
      { name: "description", content: "Your conversations with your Sellier personal shopper." },
      { property: "og:title", content: "Messages — Sellier Knightsbridge" },
      { property: "og:description", content: "Chat directly with your Sellier personal shopper." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchConversations = useServerFn(listConversations);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", search: { next: "/messages" } });
    }
  }, [loading, user, navigate]);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ConversationSummary[]> => fetchConversations(),
  });

  // Realtime refresh when any new message lands
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`inbox-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as { shopper_id: string; client_user_id: string };
          if (m.shopper_id === user.id || m.client_user_id === user.id) {
            queryClient.invalidateQueries({ queryKey: ["conversations", user.id] });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  if (loading || !user || isLoading) {
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
      <div className="px-6 pt-8 pb-6 border-b border-border/60">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">Sellier</p>
        <h1 className="font-serif text-3xl">Messages</h1>
      </div>

      {conversations.length === 0 ? (
        <div className="px-6 py-20 text-center">
          <MessageCircle className="h-6 w-6 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">
            No messages yet. Open an edit to start a conversation.
          </p>
          <Link to="/edits" className="inline-block mt-6 text-[11px] uppercase tracking-[0.25em] underline">
            My edits
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {conversations.map((c) => (
            <Link
              key={c.otherUserId}
              to="/messages/$userId"
              params={{ userId: c.otherUserId }}
              className="flex items-start justify-between gap-3 px-6 py-5 active:bg-muted/40"
            >
              <div className="min-w-0">
                <p className="text-sm truncate">{c.otherLabel}</p>
                <p className="text-xs text-muted-foreground truncate mt-1">{c.lastBody}</p>
                <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground mt-2">
                  {formatDistanceToNow(new Date(c.lastAt), { addSuffix: true })}
                </p>
              </div>
              {c.unread > 0 && (
                <span className="mt-1 shrink-0 min-w-5 h-5 px-1.5 grid place-items-center rounded-full bg-foreground text-background text-[10px]">
                  {c.unread}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </MobileLayout>
  );
}
