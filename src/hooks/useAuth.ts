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
      // Release this device's FCM token from the current user BEFORE signing
      // out — the session is still valid here, so the authenticated server fn
      // can verify the caller owns the row. Never let this block sign-out.
      try {
        const { getPushDiagnostics } = await import("@/lib/push-client");
        const token = getPushDiagnostics().fcmToken;
        if (token) {
          const { unlinkDeviceToken } = await import("@/lib/push.functions");
          await unlinkDeviceToken({ data: { token } });
        }
      } catch (err) {
        console.warn("Failed to unlink device token on sign-out", err);
      }

      // Clear native storage FIRST so any late token-refresh setItem that
      // fires during signOut() is dropped by the mirror's signed-out gate,
      // then clear again to remove anything Supabase just wrote.
      const { clearNativeSessionPersistence } = await import("@/lib/native-session");
      await clearNativeSessionPersistence();
      await supabase.auth.signOut();
      await clearNativeSessionPersistence();
    },
  };
}
