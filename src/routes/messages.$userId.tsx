import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MobileLayout } from "@/components/MobileLayout";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ChatThread } from "@/components/ChatThread";
import { getCounterpartLabel } from "@/lib/conversations.functions";

export const Route = createFileRoute("/messages/$userId")({
  head: () => ({
    meta: [
      { title: "Conversation — Sellier Knightsbridge" },
      { name: "description", content: "Chat with your Sellier personal shopper." },
      { property: "og:title", content: "Conversation — Sellier Knightsbridge" },
      { property: "og:description", content: "Chat with your Sellier personal shopper." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConversationPage,
});

function ConversationPage() {
  const { userId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fetchLabel = useServerFn(getCounterpartLabel);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", search: { next: `/messages/${userId}` } });
    }
  }, [loading, user, navigate, userId]);

  const { data: label } = useQuery({
    queryKey: ["counterpart", userId, user?.id],
    enabled: !!user,
    queryFn: async (): Promise<string> => fetchLabel({ data: { otherUserId: userId } }),
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
      <div className="px-6 pt-4 pb-2">
        <Link to="/messages" className="inline-flex items-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          <ArrowLeft className="h-3 w-3 mr-1" /> Messages
        </Link>
      </div>

      <div className="px-6 pt-2 pb-6 border-b border-border/60">
        <h1 className="font-serif text-2xl">{label ?? "Conversation"}</h1>
      </div>

      <div className="px-4 py-6">
        <ChatThread otherUserId={userId} otherLabel={label ?? "them"} heading="Conversation" />
      </div>
    </MobileLayout>
  );
}
