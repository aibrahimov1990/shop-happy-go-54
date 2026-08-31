import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "shopper" | "client" | "broadcaster";

interface AuthState {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
}

export function useAuth(): AuthState & {
  isShopper: boolean;
  isAdmin: boolean;
  canBroadcast: boolean;
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
      try {
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
      } catch (err) {
        console.error("Failed to load roles", err);
        if (!cancelled) setRoles([]);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      // Any auth event means the client has resolved its state — never keep the
      // UI stuck on a spinner waiting for getSession() alone.
      setLoading(false);
      // Defer Supabase call to avoid deadlock inside the callback
      setTimeout(() => void fetchRoles(newSession?.user.id), 0);
    });

    // Fail-safe: a hanging or rejected network call must not leave the app
    // spinning forever. Resolve the loading state no matter what.
    const failSafe = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 4000);

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        await fetchRoles(data.session?.user.id);
      })
      .catch((err) => {
        console.error("Failed to load session", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(failSafe);
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
    canBroadcast: roles.includes("admin") || roles.includes("broadcaster"),
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
