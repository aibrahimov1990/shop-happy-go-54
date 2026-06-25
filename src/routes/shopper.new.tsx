import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MobileLayout } from "@/components/MobileLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  storefrontApiRequest,
  PRODUCTS_QUERY,
  formatPrice,
  type ShopifyProduct,
} from "@/lib/shopify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, X, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { sendTransactionalEmail } from "@/lib/email/send";

export const Route = createFileRoute("/shopper/new")({
  head: () => ({ meta: [{ title: "New edit — Sellier" }] }),
  component: NewEdit,
});

interface SelectedItem {
  productId: string;
  handle: string;
  title: string;
  imageUrl: string | null;
  priceAmount: number;
  priceCurrency: string;
}

function NewEdit() {
  const { user, loading, isShopper } = useAuth();
  const navigate = useNavigate();
  const [clientEmail, setClientEmail] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { next: "/shopper/new" } });
    if (!loading && user && !isShopper) navigate({ to: "/shopper" });
  }, [loading, user, isShopper, navigate]);

  const { data: products = [], isLoading: searching } = useQuery({
    queryKey: ["shopper-product-search", search],
    queryFn: async (): Promise<ShopifyProduct[]> => {
      const res = await storefrontApiRequest<any>(PRODUCTS_QUERY, {
        first: 20,
        query: search || null,
        sortKey: search ? "RELEVANCE" : "CREATED_AT",
        reverse: !search,
      });
      return res?.data?.products?.edges ?? [];
    },
  });

  const addItem = (p: ShopifyProduct) => {
    if (items.find((i) => i.productId === p.node.id)) return;
    setItems((prev) => [
      ...prev,
      {
        productId: p.node.id,
        handle: p.node.handle,
        title: p.node.title,
        imageUrl: p.node.images.edges[0]?.node.url ?? null,
        priceAmount: parseFloat(p.node.priceRange.minVariantPrice.amount),
        priceCurrency: p.node.priceRange.minVariantPrice.currencyCode,
      },
    ]);
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const save = async (sendNow: boolean) => {
    if (!user) return;
    if (!clientEmail.trim() || !title.trim()) {
      toast.error("Add a client email and a title");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one piece to the edit");
      return;
    }
    setSubmitting(true);
    try {
      const { data: edit, error } = await supabase
        .from("edits")
        .insert({
          shopper_id: user.id,
          client_email: clientEmail.trim().toLowerCase(),
          title: title.trim(),
          note: note.trim() || null,
          status: sendNow ? "sent" : "draft",
          sent_at: sendNow ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const rows = items.map((item, idx) => ({
        edit_id: edit.id,
        shopify_product_id: item.productId,
        shopify_handle: item.handle,
        title: item.title,
        image_url: item.imageUrl,
        price_amount: item.priceAmount,
        price_currency: item.priceCurrency,
        position: idx,
      }));
      const { error: itemsErr } = await supabase.from("edit_items").insert(rows);
      if (itemsErr) throw itemsErr;

      if (sendNow) {
        try {
          const origin =
            typeof window !== "undefined" ? window.location.origin : "https://sellierknightsbridge.com";
          await sendTransactionalEmail({
            templateName: "edit-invitation",
            recipientEmail: clientEmail.trim().toLowerCase(),
            idempotencyKey: `edit-${edit.id}`,
            templateData: {
              editTitle: title.trim(),
              note: note.trim() || null,
              shopperName: user.email ?? "Your Sellier shopper",
              items: items.map((i) => ({
                title: i.title,
                imageUrl: i.imageUrl,
                priceFormatted: formatPrice(i.priceAmount, i.priceCurrency),
              })),
              viewUrl: `${origin}/edits/${edit.id}`,
            },
          });
        } catch (emailErr: any) {
          console.error("Failed to send edit email", emailErr);
          toast.warning("Edit saved, but email could not be sent");
        }
      }

      toast.success(sendNow ? "Edit sent" : "Edit saved as draft");
      navigate({ to: "/shopper" });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save edit");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="px-6 pt-4 pb-2">
        <Link to="/shopper" className="inline-flex items-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          <ArrowLeft className="h-3 w-3 mr-1" /> Back
        </Link>
      </div>

      <div className="px-6 pt-2 pb-6 border-b border-border/60">
        <h1 className="font-serif text-3xl">New edit</h1>
      </div>

      <div className="px-6 py-6 space-y-4 border-b border-border/60">
        <div>
          <label className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground block mb-2">Client email</label>
          <Input
            type="email"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            placeholder="client@example.com"
            className="h-11"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground block mb-2">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Spring picks for you"
            className="h-11"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground block mb-2">Personal note</label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Saw this Birkin and thought of you…"
            rows={3}
          />
        </div>
      </div>

      {/* Selected items */}
      <div className="px-6 py-6 border-b border-border/60">
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
          In this edit ({items.length})
        </p>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pieces yet — search below to add.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.productId} className="flex items-center gap-3 bg-muted/40 p-2">
                <div className="h-14 w-14 bg-muted overflow-hidden shrink-0">
                  {item.imageUrl && <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatPrice(item.priceAmount, item.priceCurrency)}
                  </p>
                </div>
                <button
                  onClick={() => removeItem(item.productId)}
                  className="p-2 text-muted-foreground"
                  aria-label="Remove"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Product search */}
      <div className="px-6 py-6">
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">Add pieces</p>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, brand…"
          className="h-11 mb-4"
        />
        {searching ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5">
            {products.map((p) => {
              const selected = !!items.find((i) => i.productId === p.node.id);
              return (
                <button
                  key={p.node.id}
                  onClick={() => addItem(p)}
                  disabled={selected}
                  className="text-left group"
                >
                  <div className="aspect-[3/4] bg-muted overflow-hidden mb-2 relative">
                    {p.node.images.edges[0]?.node.url && (
                      <img
                        src={p.node.images.edges[0].node.url}
                        alt={p.node.title}
                        className="h-full w-full object-cover"
                      />
                    )}
                    <div className={`absolute top-2 right-2 h-7 w-7 flex items-center justify-center ${selected ? "bg-foreground text-background" : "bg-background/90 text-foreground"}`}>
                      {selected ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    </div>
                  </div>
                  <p className="text-xs line-clamp-2 leading-tight">{p.node.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatPrice(p.node.priceRange.minVariantPrice.amount, p.node.priceRange.minVariantPrice.currencyCode)}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Save bar */}
      <div className="sticky bottom-16 bg-background border-t border-border/60 px-6 py-3 flex gap-2">
        <Button
          variant="outline"
          onClick={() => save(false)}
          disabled={submitting}
          className="flex-1 text-[10px] uppercase tracking-[0.25em] h-11"
        >
          Save draft
        </Button>
        <Button
          onClick={() => save(true)}
          disabled={submitting}
          className="flex-1 text-[10px] uppercase tracking-[0.25em] h-11"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send to client"}
        </Button>
      </div>
    </MobileLayout>
  );
}
