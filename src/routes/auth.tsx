import { useState } from "react";
import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Loader2, ArrowLeft } from "lucide-react";
import sellierLogo from "@/assets/sellier-logo.svg";


const searchSchema = z.object({
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Sign in — Sellier Knightsbridge" },
      { name: "description", content: "Sign in to your Sellier account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const redirectTo = typeof window !== "undefined"
    ? `${window.location.origin}${next ?? "/edits"}`
    : undefined;

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setSent(true);
      toast.success("Check your inbox for the sign-in link.");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send link");
    } finally {
      setSending(false);
    }
  };

  const handleGoogle = async () => {
    try {
      if (next && typeof window !== "undefined") {
        sessionStorage.setItem("post_auth_redirect", next);
      }
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Google sign-in failed");
        return;
      }
      if (result.redirected) return;
      const stored = typeof window !== "undefined" ? sessionStorage.getItem("post_auth_redirect") : null;
      if (stored) sessionStorage.removeItem("post_auth_redirect");
      navigate({ to: stored ?? next ?? "/edits" });
    } catch (err: any) {
      toast.error(err.message ?? "Sign-in failed");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pt-[env(safe-area-inset-top)]">
      <div className="px-4 pt-4">
        <Link
          to="/"
          className="inline-flex items-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground active:opacity-60"
        >
          <ArrowLeft className="h-3 w-3 mr-1.5" /> Back to shop
        </Link>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">

        <div className="w-full max-w-sm">
          <img src={sellierLogo} alt="Sellier" className="h-5 w-auto mx-auto mb-2" />
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground text-center mb-10">
            Preloved Luxury
          </p>

          {sent ? (
            <div className="text-center space-y-4">
              <Mail className="h-10 w-10 mx-auto text-foreground" />
              <h2 className="font-serif text-xl">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                We sent a sign-in link to <span className="text-foreground">{email}</span>.
                Tap it to continue.
              </p>
              <button
                onClick={() => setSent(false)}
                className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={handleMagicLink} className="space-y-3">
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12"
                />
                <Button type="submit" disabled={sending} className="w-full h-12 text-[11px] uppercase tracking-[0.25em]">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue with email"}
                </Button>
              </form>

              <div className="flex items-center gap-3 my-5">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Button
                onClick={handleGoogle}
                variant="outline"
                className="w-full h-12 text-[11px] uppercase tracking-[0.25em]"
              >
                <GoogleIcon className="h-4 w-4 mr-2" />
                Continue with Google
              </Button>

              <p className="text-[10px] text-muted-foreground text-center mt-8 leading-relaxed">
                By continuing you agree to receive personal edits and updates from your Sellier shopper.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#EA4335" d="M12 5.04c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.8 1.59 15.13.5 12 .5 7.34.5 3.34 3.18 1.39 7.07l3.84 2.98C6.18 7.13 8.87 5.04 12 5.04z" />
      <path fill="#4285F4" d="M23.5 12.27c0-.82-.07-1.6-.2-2.36H12v4.46h6.46c-.28 1.5-1.13 2.78-2.42 3.64l3.72 2.88c2.18-2.01 3.74-4.97 3.74-8.62z" />
      <path fill="#FBBC05" d="M5.23 14.05A7.07 7.07 0 014.84 12c0-.71.13-1.4.35-2.05L1.39 6.97A11.5 11.5 0 00.5 12c0 1.85.45 3.6 1.24 5.15l3.49-3.1z" />
      <path fill="#34A853" d="M12 23.5c3.13 0 5.77-1.03 7.7-2.81l-3.72-2.88c-1.04.7-2.38 1.11-3.98 1.11-3.13 0-5.82-2.09-6.77-4.99L1.39 17.03C3.34 20.92 7.34 23.5 12 23.5z" />
    </svg>
  );
}
