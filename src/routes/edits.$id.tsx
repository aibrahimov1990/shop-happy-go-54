import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MobileLayout } from "@/components/MobileLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/shopify";
import { ArrowLeft, Loader2 } from "lucide-react";

export const Route = createFileRoute("/edits/$id")({
  head: ({ params }) => ({
    meta: [
      { title: "Your Edit — Sellier Knightsbridge" },
      { name: "description", content: "A personal edit from your Sellier shopper." },
    ],
  }),
  component: EditDetail,
});

interface EditItem {
  id: string;
  shopify_handle: string;
  title: string;
  image_url: string | null;
  price_amount: number | null;
  price_currency: string | null;
}

interface EditFull {
  id: string;
  title: string;
  note: string | null;
  status: "draft" | "sent" | "viewed";
  sent_at: string | null;
  edit_items: EditItem[];
}

function EditDetail() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", search: { next: `/edits/${id}` } });
    }
  }, [loading, user, navigate, id]);

  const { data: edit, isLoading } = useQuery({
    queryKey: ["edit", id],
    enabled: !!user,
    queryFn: async (): Promise<EditFull | null> => {
      const { data, error } = await supabase
        .from("edits")
        .select("id, title, note, status, sent_at, edit_items(id, shopify_handle, title, image_url, price_amount, price_currency)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as EditFull | null;
    },
  });

  // Mark as viewed once
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
          <p className="text-sm text-muted-foreground">It may have been removed.</p>
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
          <div className="grid grid-cols-2 gap-x-3 gap-y-6">
            {edit.edit_items.map((item) => (
              <Link
                key={item.id}
                to="/product/$handle"
                params={{ handle: item.shopify_handle }}
                className="block"
              >
                <div className="aspect-[3/4] bg-muted overflow-hidden mb-2">
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <p className="text-xs leading-tight line-clamp-2">{item.title}</p>
                {item.price_amount != null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatPrice(item.price_amount, item.price_currency ?? "GBP")}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
