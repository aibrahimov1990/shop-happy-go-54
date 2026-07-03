import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MobileLayout } from "@/components/MobileLayout";
import { OrdersList } from "@/components/OrdersList";
import { useAuth } from "@/hooks/useAuth";
import { getMyOrders } from "@/lib/orders.functions";
import { Loader2, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "My Orders — Sellier Knightsbridge" },
      { name: "description", content: "Your Sellier order history." },
    ],
  }),
  component: MyOrdersPage,
  errorComponent: ({ error }) => (
    <MobileLayout>
      <div className="px-6 py-16 text-center text-sm text-muted-foreground">{error.message}</div>
    </MobileLayout>
  ),
  notFoundComponent: () => <MobileLayout><div className="p-8">Not found</div></MobileLayout>,
});

function MyOrdersPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fetchOrders = useServerFn(getMyOrders);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { next: "/orders" } });
  }, [loading, user, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["my-orders", user?.id],
    queryFn: () => fetchOrders(),
    enabled: !!user,
    staleTime: 60_000,
  });

  if (loading || (user && isLoading)) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  const orders = data?.orders ?? [];

  return (
    <MobileLayout>
      <div className="px-6 pt-6 pb-4 border-b border-border/60">
        <Link
          to="/account"
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3"
        >
          <ChevronLeft className="h-3 w-3" /> Account
        </Link>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1">
          Order history
        </p>
        <h1 className="font-serif text-2xl leading-tight">My orders</h1>
        {data?.email && (
          <p className="text-xs text-muted-foreground mt-1">Matched to {data.email}</p>
        )}
      </div>

      <section className="px-6 py-2">
        <OrdersList
          orders={orders}
          emptyLabel="No orders linked to your account yet. Purchases made with this email address will appear here."
        />
      </section>
    </MobileLayout>
  );
}
