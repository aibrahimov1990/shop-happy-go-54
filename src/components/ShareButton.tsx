import { Share } from "lucide-react";
import { toast } from "sonner";

// @capacitor/share is not installed; the Web Share API covers the iOS WKWebView.
export function ShareButton({ url, title, className = "" }: { url: string; title: string; className?: string }) {
  const onShare = async () => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { position: "top-center" });
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied", { position: "top-center" });
      } catch {
        /* fail silently */
      }
    }
  };

  return (
    <button type="button" onClick={onShare} aria-label="Share" className={`shrink-0 text-foreground ${className}`}>
      <Share className="h-4 w-4" strokeWidth={1.5} />
    </button>
  );
}
