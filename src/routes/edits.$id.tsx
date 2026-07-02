import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MobileLayout } from "@/components/MobileLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2 } from "lucide-react";
import { EditItemCard } from "@/components/EditItemCard";
import { ChatThread } from "@/components/ChatThread";
import { getAccessibleEdit, type AccessibleEdit } from "@/lib/edits.functions";

export const Route = createFileRoute("/edits/$id")({
  head: () => ({
    meta: [
      { title: "Your Edit — Sellier Knightsbridge" },
      { name: "description", content: "A personal edit from your Sellier shopper." },
    ],
  }),
  component: EditDetail,
});

function EditDetail() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fetchEdit = useServerFn(getAccessibleEdit);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", search: { next: `/edits/${id}` } });
    }
  }, [loading, user, navigate, id]);

  const { data: edit, isLoading } = useQuery({
    queryKey: ["edit", id, user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AccessibleEdit | null> => fetchEdit({ data: { id } }),
  });

  useEffect(() => {
    if (!edit || edit.status === "viewed") return;
    supabase
      .from("edits")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", id)
      .then(() => {});
  }, [edit, id]);

  if (loading || !user || isLoading) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  if (!edit) {
    return (
      <MobileLayout>
        <div className="px-6 py-20 text-center">
          <h2 className="font-serif text-xl mb-2">Edit not found</h2>
          <p className="text-sm text-muted-foreground">Sign in with the email address this edit was sent to.</p>
          <Link to="/edits" className="inline-block mt-6 text-[11px] uppercase tracking-[0.25em] underline">
            Back to my edits
          </Link>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="px-6 pt-4 pb-2">
        <Link to="/edits" className="inline-flex items-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          <ArrowLeft className="h-3 w-3 mr-1" /> My Edits
        </Link>
      </div>

      <div className="px-6 pt-4 pb-8 border-b border-border/60">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
          From your shopper
        </p>
        <h1 className="font-serif text-3xl leading-tight">{edit.title}</h1>
        {edit.note && (
          <p className="font-serif italic text-lg text-muted-foreground mt-4 leading-relaxed">
            "{edit.note}"
          </p>
        )}
      </div>

      <div className="px-4 py-6">
        {edit.edit_items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            This edit has no pieces yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-8">
            {edit.edit_items.map((item) => (
              <EditItemCard
                key={item.id}
                handle={item.shopify_handle}
                title={item.title}
                imageUrl={item.image_url}
                priceAmount={item.price_amount}
                priceCurrency={item.price_currency}
              />
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pb-10">
        <ChatThread
          otherUserId={edit.shopper_id}
          otherLabel="your shopper"
          heading="Reply to your shopper"
        />
      </div>
    </MobileLayout>
  );
}
