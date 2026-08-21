import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * App-wide unread message counter.
 *
 * Counts incoming messages the signed-in user has not read yet, and shows a
 * live in-app notification (toast) whenever a new message arrives while the
 * app is open — so a reply never goes unnoticed even if push is unavailable.
 */
export function useUnreadMessages(options?: { notify?: boolean }) {
  const notify = options?.notify ?? false;
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) {
      setUnread(0);
      return;
    }
    const [asClient, asShopper] = await Promise.all([
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("client_user_id", user.id)
        .neq("sender_id", user.id)
        .is("read_by_client_at", null),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("shopper_id", user.id)
        .neq("sender_id", user.id)
        .is("read_by_shopper_at", null),
    ]);
    setUnread((asClient.count ?? 0) + (asShopper.count ?? 0));
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`unread-messages-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        (payload) => {
          void refresh();
          if (!notify || payload.eventType !== "INSERT") return;
          const row = payload.new as {
            sender_id?: string;
            shopper_id?: string;
            client_user_id?: string;
            body?: string;
          };
          if (!row?.sender_id || row.sender_id === user.id) return;
          const mine = row.shopper_id === user.id || row.client_user_id === user.id;
          if (!mine) return;
          const otherId = row.shopper_id === user.id ? row.client_user_id : row.shopper_id;
          toast("New message", {
            description: (row.body ?? "").slice(0, 120),
            action: otherId
              ? {
                  label: "Open",
                  onClick: () => {
                    window.location.href = `/messages/${otherId}`;
                  },
                }
              : undefined,
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, notify, refresh]);

  return { unread, refresh };
}
