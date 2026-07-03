import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getOrCreateFirstOrderDiscount } from "@/lib/discount.functions";

interface DiscountResult {
  code: string;
  percentOff: number;
  scope: string;
  used: boolean;
}

export function FirstOrderDiscountCard() {
  const { user, loading: authLoading } = useAuth();
  const fetchDiscount = useServerFn(getOrCreateFirstOrderDiscount);
  const [state, setState] = useState<
    | { status: "idle" | "loading" | "error" }
    | { status: "ready"; data: DiscountResult }
  >({ status: "idle" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setState({ status: "loading" });
    fetchDiscount()
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data: data as DiscountResult });
      })
      .catch((err) => {
        console.error("first-order discount", err);
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [user, fetchDiscount]);

  if (authLoading) return null;

  if (!user) {
    return (
      <div className="mx-4 my-6 border border-foreground/20 bg-background p-5 text-center">
        <p className="font-serif text-lg text-foreground">
          15% off your first order
        </p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Clothing & Shoes · App exclusive
        </p>
        <Link
          to="/auth"
          className="mt-4 inline-flex items-center justify-center bg-foreground px-6 py-3 text-[11px] uppercase tracking-[0.25em] text-background"
        >
          Sign in to reveal
        </Link>
      </div>
    );
  }

  if (state.status === "loading" || state.status === "idle") {
    return (
      <div className="mx-4 my-6 flex items-center justify-center border border-foreground/20 bg-background p-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state.status !== "ready") return null;

  const { code, percentOff, scope } = state.data;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Code copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div className="mx-4 my-6 border border-foreground/20 bg-background p-5 text-center">
      <p className="font-serif text-lg text-foreground">
        {percentOff}% off your first order
      </p>
      <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {scope} · One use
      </p>
      <button
        type="button"
        onClick={copy}
        className="mt-4 inline-flex w-full items-center justify-between gap-3 border border-foreground bg-background px-4 py-3 text-left"
      >
        <span className="font-mono text-sm tracking-[0.15em] text-foreground">{code}</span>
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.25em] text-foreground">
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </span>
      </button>
      <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Apply at checkout · Excludes Bags & Accessories
      </p>
    </div>
  );
}
