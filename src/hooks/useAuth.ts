import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "shopper" | "client";

interface AuthState {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
}

export function useAuth(): AuthState & {
  isShopper: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchRoles = async (userId: string | undefined) => {
      if (!userId) {
        if (!cancelled) setRoles([]);
        return;
      }
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (cancelled) return;
      if (error) {
        console.error("Failed to load roles", error);
        setRoles([]);
      } else {
        setRoles((data ?? []).map((r) => r.role as AppRole));
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      // Defer Supabase call to avoid deadlock inside the callback
      setTimeout(() => fetchRoles(newSession?.user.id), 0);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      fetchRoles(data.session?.user.id).finally(() => {
        if (!cancelled) setLoading(false);
      });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    user: session?.user ?? null,
    roles,
    loading,
    isShopper: roles.includes("shopper") || roles.includes("admin"),
    isAdmin: roles.includes("admin"),
    signOut: async () => {
      await supabase.auth.signOut();
      const { clearNativeSessionPersistence } = await import("@/lib/native-session");
      await clearNativeSessionPersistence();
    },
  };
}
