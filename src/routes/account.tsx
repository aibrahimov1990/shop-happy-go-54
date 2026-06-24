import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MobileLayout } from "@/components/MobileLayout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { User, LogOut, Sparkles, Crown, Loader2 } from "lucide-react";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account — Sellier Knightsbridge" },
      { name: "description", content: "Your Sellier account." },
    ],
  }),
  component: Account,
});

function Account() {
  const { user, loading, isShopper, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  if (!user) {
    return (
      <MobileLayout>
        <div className="px-6 py-16 text-center">
          <div className="h-14 w-14 rounded-full bg-secondary mx-auto flex items-center justify-center mb-4">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="font-serif text-2xl mb-2">Account</h1>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6">
            Sign in to view personal edits from your shopper, manage saved pieces and orders.
          </p>
          <Link to="/auth">
            <Button className="text-[11px] uppercase tracking-[0.25em]">Sign in</Button>
          </Link>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="px-6 pt-12 pb-6 text-center border-b border-border/60">
        <div className="h-14 w-14 rounded-full bg-secondary mx-auto flex items-center justify-center mb-3">
          <User className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="font-serif text-xl">{user.email}</p>
      </div>

      <div className="divide-y divide-border/60">
        <Link to="/edits" className="flex items-center justify-between px-6 py-5 active:bg-muted/40">
          <div className="flex items-center gap-3">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm">My edits</span>
          </div>
          <span className="text-muted-foreground">›</span>
        </Link>

        {isShopper && (
          <Link to="/shopper" className="flex items-center justify-between px-6 py-5 active:bg-muted/40">
            <div className="flex items-center gap-3">
              <Crown className="h-4 w-4" />
              <span className="text-sm">Shopper area</span>
            </div>
            <span className="text-muted-foreground">›</span>
          </Link>
        )}

        <button
          onClick={async () => {
            await signOut();
            navigate({ to: "/" });
          }}
          className="flex items-center justify-between px-6 py-5 active:bg-muted/40 w-full text-left"
        >
          <div className="flex items-center gap-3 text-muted-foreground">
            <LogOut className="h-4 w-4" />
            <span className="text-sm">Sign out</span>
          </div>
        </button>
      </div>
    </MobileLayout>
  );
}
