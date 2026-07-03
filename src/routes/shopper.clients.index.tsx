import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MobileLayout } from "@/components/MobileLayout";
import { useAuth } from "@/hooks/useAuth";
import { listClientsWithWishlists } from "@/lib/wishlists.functions";
import { Heart, Loader2, ChevronLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/shopper/clients/")({
  head: () => ({
    meta: [
      { title: "Client Wishlists — Sellier Shopper" },
      { name: "description", content: "See what your clients have saved." },
    ],
  }),
  component: ClientsPage,
  errorComponent: ({ error }) => (
    <MobileLayout>
      <div className="px-6 py-16 text-center text-sm text-muted-foreground">{error.message}</div>
    </MobileLayout>
  ),
  notFoundComponent: () => <MobileLayout><div className="p-8">Not found</div></MobileLayout>,
});

function ClientsPage() {
  const { user, loading, isShopper } = useAuth();
  const navigate = useNavigate();
  const fetchClients = useServerFn(listClientsWithWishlists);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { next: "/shopper/clients" } });
  }, [loading, user, navigate]);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["shopper-clients-wishlists"],
    queryFn: () => fetchClients(),
    enabled: !!user && isShopper,
  });

  if (loading || (user && isShopper && isLoading)) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  if (user && !isShopper) {
    return (
      <MobileLayout>
        <div className="px-6 py-16 text-center">
          <h1 className="font-serif text-2xl mb-2">Shoppers only</h1>
          <Link to="/account" className="text-xs uppercase tracking-[0.25em] underline">Back</Link>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="px-6 pt-6 pb-4 border-b border-border/60">
        <Link to="/shopper" className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
          <ChevronLeft className="h-3 w-3" /> Shopper
        </Link>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1">Wishlists</p>
        <h1 className="font-serif text-3xl">Clients</h1>
      </div>

      {clients.length === 0 ? (
        <div className="px-6 py-20 text-center">
          <Heart className="h-8 w-8 mx-auto mb-4 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            No client has saved anything yet.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {clients.map((c) => (
            <Link
              key={c.userId}
              to="/shopper/clients/$id"
              params={{ id: c.userId }}
              className="block px-6 py-5 active:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="flex-1 min-w-0">
                  {c.fullName && (
                    <h3 className="font-serif text-lg leading-tight truncate">{c.fullName}</h3>
                  )}
                  <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] px-2 py-1 bg-foreground text-background whitespace-nowrap">
                  <Heart className="h-3 w-3" strokeWidth={1.5} /> {c.count}
                </span>
              </div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mt-2">
                Last saved {formatDistanceToNow(new Date(c.lastSaved), { addSuffix: true })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </MobileLayout>
  );
}
