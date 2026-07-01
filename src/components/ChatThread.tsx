import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { sendMessage, markMessagesRead } from "@/lib/messages.functions";

interface Message {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

interface Props {
  otherUserId: string;
  otherLabel: string;
  /** Optional heading override; defaults to "Message {otherLabel}" */
  heading?: string;
}

export function ChatThread({ otherUserId, otherLabel, heading }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const send = useServerFn(sendMessage);
  const markRead = useServerFn(markMessagesRead);

  const queryKey = ["messages", user?.id, otherUserId] as const;

  const { data: messages = [], isLoading } = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, body, created_at")
        .or(
          `and(shopper_id.eq.${user!.id},client_user_id.eq.${otherUserId}),and(shopper_id.eq.${otherUserId},client_user_id.eq.${user!.id})`,
        )
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as Message[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`msgs-${user.id}-${otherUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as any;
          const isPair =
            (m.shopper_id === user.id && m.client_user_id === otherUserId) ||
            (m.shopper_id === otherUserId && m.client_user_id === user.id);
          if (isPair) queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, otherUserId, queryClient]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  // Mark thread as read when opened / new incoming
  useEffect(() => {
    if (!user || messages.length === 0) return;
    const hasIncomingUnread = messages.some((m) => m.sender_id === otherUserId);
    if (hasIncomingUnread) {
      markRead({ data: { otherUserId } }).catch(() => {});
    }
  }, [user, messages.length, otherUserId, markRead]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await send({ data: { otherUserId, body } });
      setDraft("");
      queryClient.invalidateQueries({ queryKey });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border border-border/60 bg-background">
      <div className="px-4 py-3 border-b border-border/60">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {heading ?? `Message ${otherLabel}`}
        </p>
      </div>
      <div
        ref={scrollRef}
        className="max-h-80 min-h-40 overflow-y-auto px-4 py-3 space-y-3 bg-muted/20"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Start the conversation with {otherLabel}.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[80%]">
                  <div
                    className={`px-3 py-2 text-sm leading-snug ${
                      mine
                        ? "bg-foreground text-background"
                        : "bg-background border border-border/60"
                    }`}
                  >
                    {m.body}
                  </div>
                  <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground mt-1 px-1">
                    {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form onSubmit={handleSend} className="flex items-end gap-2 p-2 border-t border-border/60">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e as any);
            }
          }}
          placeholder={`Message ${otherLabel}…`}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm px-2 py-2 focus:outline-none max-h-28"
        />
        <Button type="submit" size="icon" disabled={sending || !draft.trim()} className="shrink-0">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
