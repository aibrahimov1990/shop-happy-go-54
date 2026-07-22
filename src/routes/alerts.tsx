import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { MobileLayout } from "@/components/MobileLayout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
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
import { BellRing, Loader2, Plus, Trash2 } from "lucide-react";
import {
  listMySavedSearches,
  createSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
} from "@/lib/saved-searches.functions";
import { initPushNotifications } from "@/lib/push-client";
import { formatPrice } from "@/lib/shopify";

const PRODUCT_TYPES = [
  "Accessories", "Bag", "Blazer", "Blouse", "Cardigan", "Coat", "Dress", "Gilet",
  "Jacket", "Jeans", "Jumper", "Jumpsuit", "Shirt", "Shoes", "Shorts", "Skirt",
  "Sweater", "Swimwear", "Top", "Trousers", "T-Shirt", "Two Piece",
];

const DESIGNERS = [
  "Alaia", "Alexander McQueen", "Alexander Wang", "Balenciaga", "Balmain",
  "Bottega Veneta", "Brunello Cucinelli", "Burberry", "Bvlgari", "Cartier",
  "Celine", "Chanel", "Chloe", "Christian Dior", "Christian Louboutin",
  "Dolce & Gabbana", "Fendi", "Givenchy", "Goyard", "Gucci", "Hermès",
  "Isabel Marant", "Jimmy Choo", "Loewe", "Louis Vuitton", "Manolo Blahnik",
  "Max Mara", "Miu Miu", "Off-White", "Prada", "Ralph Lauren", "Saint Laurent",
  "Stella McCartney", "Tom Ford", "Valentino", "Van Cleef & Arpels", "Versace",
];

const NONE = "__none__";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Stock Alerts — Sellier Knightsbridge" },
      {
        name: "description",
        content:
          "Save a search and get notified the moment a matching preloved luxury piece lands at Sellier.",
      },
      { property: "og:title", content: "Stock Alerts — Sellier Knightsbridge" },
      {
        property: "og:description",
        content:
          "Save a search and get notified the moment a matching piece lands.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AlertsPage,
});

interface SavedSearch {
  id: string;
  brand: string | null;
  keyword: string | null;
  product_type: string | null;
  max_price: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function summarise(s: SavedSearch): string {
  const bits: string[] = [];
  if (s.brand) bits.push(s.brand);
  if (s.product_type) bits.push(s.product_type);
  if (s.keyword) bits.push(`“${s.keyword}”`);
  let out = bits.join(" · ");
  if (!out) out = "Any";
  if (s.max_price != null) out += ` — under ${formatPrice(s.max_price)}`;
  return out;
}

function AlertsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const listFn = useServerFn(listMySavedSearches);
  const createFn = useServerFn(createSavedSearch);
  const updateFn = useServerFn(updateSavedSearch);
  const deleteFn = useServerFn(deleteSavedSearch);

  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: searches = [], isLoading } = useQuery({
    queryKey: ["saved-searches"],
    queryFn: () => listFn(),
    enabled: !!user,
  });

  const toggleActive = useMutation({
    mutationFn: (s: SavedSearch) =>
      updateFn({
        data: {
          id: s.id,
          active: !s.active,
          brand: s.brand,
          keyword: s.keyword,
          product_type: s.product_type,
          max_price: s.max_price,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-searches"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-searches"] });
      toast.success("Alert deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete"),
  });

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
            <BellRing className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="font-serif text-2xl mb-2">Stock Alerts</h1>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6">
            Sign in to save a search and be notified the moment a matching piece lands.
          </p>
          <Button
            onClick={() => navigate({ to: "/auth" })}
            className="text-[11px] uppercase tracking-[0.25em]"
          >
            Sign in
          </Button>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="px-4 pt-6 pb-3 flex items-end justify-between">
        <div>
          <h1 className="font-serif text-3xl">Stock Alerts</h1>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mt-1">
            {searches.length} {searches.length === 1 ? "alert" : "alerts"} saved
          </p>
        </div>
        <button
          onClick={() => setSheetOpen(true)}
          className="text-[10px] uppercase tracking-[0.25em] bg-foreground text-background px-4 py-2 flex items-center gap-2"
        >
          <Plus className="h-3.5 w-3.5" /> New
        </button>
      </div>

      <section className="px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : searches.length === 0 ? (
          <div className="text-center py-14 border border-border/60 bg-[#f5f1ea] px-6">
            <BellRing className="h-6 w-6 mx-auto mb-3 text-muted-foreground" />
            <p className="font-serif text-lg mb-2">Never miss the piece</p>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-5">
              Save what you're hunting for — a brand, a style, a price ceiling — and
              we'll ping you the second it arrives.
            </p>
            <Button
              onClick={() => setSheetOpen(true)}
              className="text-[11px] uppercase tracking-[0.25em]"
            >
              Create your first alert
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border/60 border-y border-border/60">
            {(searches as SavedSearch[]).map((s) => (
              <li key={s.id} className="py-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-serif text-lg leading-tight truncate">
                    {summarise(s)}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
                    {s.active ? "Active" : "Paused"}
                  </p>
                </div>
                <Switch
                  checked={s.active}
                  disabled={toggleActive.isPending}
                  onCheckedChange={() => toggleActive.mutate(s)}
                />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="p-2 text-muted-foreground hover:text-destructive"
                      aria-label="Delete alert"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this alert?</AlertDialogTitle>
                      <AlertDialogDescription>
                        You'll stop receiving notifications for this saved search.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteMut.mutate(s.id)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[11px] text-muted-foreground text-center mt-6 px-4">
          Our inventory is one-of-one. When a match lands we'll notify the moment it
          goes live so you can be first.
        </p>
      </section>

      <NewAlertSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onCreate={async (input) => {
          await createFn({ data: input });
          qc.invalidateQueries({ queryKey: ["saved-searches"] });
          setSheetOpen(false);
          toast.success("Alert saved. We'll ping you the moment it lands.");
          // If this is their first alert, try to enable push notifications.
          if (searches.length === 0) {
            try {
              await initPushNotifications();
            } catch (err) {
              console.warn("Could not init push notifications", err);
            }
          }
        }}
      />
    </MobileLayout>
  );
}

interface NewAlertInput {
  brand: string | null;
  keyword: string | null;
  product_type: string | null;
  max_price: number | null;
}

function NewAlertSheet({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (input: NewAlertInput) => Promise<void>;
}) {
  const [brand, setBrand] = useState<string>(NONE);
  const [keyword, setKeyword] = useState("");
  const [productType, setProductType] = useState<string>(NONE);
  const [maxPrice, setMaxPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setBrand(NONE);
    setKeyword("");
    setProductType(NONE);
    setMaxPrice("");
  };

  const submit = async () => {
    const brandVal = brand === NONE ? null : brand;
    const ptVal = productType === NONE ? null : productType;
    const kwVal = keyword.trim() || null;
    const priceNum = maxPrice.trim() ? Number(maxPrice.trim()) : null;
    if (priceNum != null && (!Number.isFinite(priceNum) || priceNum <= 0)) {
      toast.error("Max price must be a positive number");
      return;
    }
    if (!brandVal && !kwVal && !ptVal) {
      toast.error("Add at least one criterion (brand, keyword, or type)");
      return;
    }
    setSaving(true);
    try {
      await onCreate({
        brand: brandVal,
        keyword: kwVal,
        product_type: ptVal,
        max_price: priceNum,
      });
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save alert");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl text-left">New alert</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 pt-4">
          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Brand
            </label>
            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Any brand" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={NONE}>Any brand</SelectItem>
                {DESIGNERS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Keyword (in product title)
            </label>
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. Kelly 25, Timeless, black lambskin"
              className="mt-1.5"
              maxLength={100}
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Category
            </label>
            <Select value={productType} onValueChange={setProductType}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Any category" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={NONE}>Any category</SelectItem>
                {PRODUCT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Max price (£)
            </label>
            <Input
              type="number"
              inputMode="numeric"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Optional"
              className="mt-1.5"
              min={0}
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            Set at least one criterion. We'll notify you as soon as a piece matching
            all of them arrives.
          </p>
        </div>
        <SheetFooter className="pt-6">
          <Button
            onClick={submit}
            disabled={saving}
            className="w-full text-[11px] uppercase tracking-[0.25em]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save alert"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
