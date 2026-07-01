import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MobileLayout } from "@/components/MobileLayout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { User, LogOut, Sparkles, Crown, Loader2, Shield, Trash2, Lock, Megaphone } from "lucide-react";
import { deleteMyAccount } from "@/lib/account.functions";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
  const { user, loading, isShopper, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const deleteAccount = useServerFn(deleteMyAccount);
  const [deleting, setDeleting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const handleSetPassword = async () => {
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password set. You can now sign in with email + password.");
      setNewPassword("");
      setPwOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not set password");
    } finally {
      setSavingPassword(false);
    }
  };

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

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      toast.success("Your account has been deleted.");
      await signOut();
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete account.");
      setDeleting(false);
    }
  };

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

        <Dialog open={pwOpen} onOpenChange={setPwOpen}>
          <DialogTrigger asChild>
            <button className="flex items-center justify-between px-6 py-5 active:bg-muted/40 w-full text-left">
              <div className="flex items-center gap-3">
                <Lock className="h-4 w-4" />
                <span className="text-sm">Set password</span>
              </div>
              <span className="text-muted-foreground">›</span>
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Set a password</DialogTitle>
              <DialogDescription>
                Lets you sign in with email + password instead of a magic link.
              </DialogDescription>
            </DialogHeader>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="New password (min 8 chars)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-11"
            />
            <DialogFooter>
              <Button
                onClick={handleSetPassword}
                disabled={savingPassword}
                className="text-[11px] uppercase tracking-[0.25em]"
              >
                {savingPassword ? "Saving…" : "Save password"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        <a
          href="https://www.sellierknightsbridge.com/pages/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between px-6 py-5 active:bg-muted/40"
        >
          <div className="flex items-center gap-3">
            <Shield className="h-4 w-4" />
            <span className="text-sm">Privacy policy</span>
          </div>
          <span className="text-muted-foreground">›</span>
        </a>

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

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="flex items-center justify-between px-6 py-5 active:bg-muted/40 w-full text-left">
              <div className="flex items-center gap-3 text-destructive">
                <Trash2 className="h-4 w-4" />
                <span className="text-sm">Delete account</span>
              </div>
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes your Sellier account, personal edits, wishlist, and notification devices.
                This cannot be undone. Past orders placed through Shopify are kept for legal and accounting reasons.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleDelete();
                }}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MobileLayout>
  );
}
