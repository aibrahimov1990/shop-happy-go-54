import { useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { listBroadcasts, sendBroadcast } from "@/lib/push.functions";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import sellierLogo from "@/assets/sellier-logo.svg";
import { storefrontApiRequest, PRODUCTS_QUERY, COLLECTIONS_QUERY, isKidsProduct, type ShopifyProduct } from "@/lib/shopify";


export const Route = createFileRoute("/admin/broadcast")({
  component: BroadcastPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="font-serif text-xl">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Button
          className="mt-4"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          Try again
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-8">Not found</div>,
});

function BroadcastPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fetchBroadcasts = useServerFn(listBroadcasts);
  const send = useServerFn(sendBroadcast);
  const qc = useQueryClient();

  const adminQuery = useQuery({
    queryKey: ["isAdmin", user?.id],
    enabled: !loading && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user!.id,
        _role: "admin",
      });
      if (error) throw error;
      return data === true;
    },
  });

  const broadcastsQuery = useQuery({
    queryKey: ["broadcasts"],
    queryFn: () => fetchBroadcasts(),
    enabled: adminQuery.data === true,
  });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const newArrivalsQuery = useInfiniteQuery({
    queryKey: ["broadcast-new-arrivals"],
    enabled: adminQuery.data === true,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await storefrontApiRequest<any>(PRODUCTS_QUERY, {
        first: 24,
        after: pageParam,
        query: "-tag:KIDS",
        sortKey: "CREATED_AT",
        reverse: true,
      });
      const edges: ShopifyProduct[] = res?.data?.products?.edges ?? [];
      const pageInfo = res?.data?.products?.pageInfo ?? { hasNextPage: false, endCursor: null };
      return { edges: edges.filter((e) => !isKidsProduct(e)), pageInfo };
    },
    getNextPageParam: (last) => (last.pageInfo.hasNextPage ? last.pageInfo.endCursor : undefined),
  });
  const newArrivals: ShopifyProduct[] =
    newArrivalsQuery.data?.pages.flatMap((p) => p.edges) ?? [];

  const collectionsQuery = useQuery({
    queryKey: ["broadcast-collections"],
    enabled: adminQuery.data === true,
    queryFn: async () => {
      const res = await storefrontApiRequest<any>(COLLECTIONS_QUERY, { first: 100 });
      const edges: Array<{ node: { id: string; handle: string; title: string } }> =
        res?.data?.collections?.edges ?? [];
      return edges
        .map((e) => e.node)
        .filter((c) => c.handle && !/kids/i.test(c.handle) && !/kids/i.test(c.title));
    },
  });



  const mutation = useMutation({
    mutationFn: (input: { title: string; body: string; url: string; imagePath?: string; imageUrl?: string }) =>
      send({
        data: {
          title: input.title,
          body: input.body,
          url: input.url || undefined,
          imagePath: input.imagePath,
          imageUrl: input.imageUrl,
        },
      }),
    onSuccess: (res) => {
      const errBreakdown = Object.entries(res.errorCounts ?? {})
        .map(([k, n]) => `${n}× ${k}`)
        .join(", ");
      const registeredCount = res.registeredTokenCount ?? res.totalTokens;
      const apnsCredentialMessage = res.apnsCredentialIssue
        ? " — APNs credential issue in Firebase: upload/replace the Apple Push Notifications Auth Key (.p8) for com.sellierknightsbridge.app"
        : "";
      toast.success(
        (res.topicSubmitted
          ? `Submitted to app broadcast channel (${registeredCount} registered device${registeredCount === 1 ? "" : "s"} currently visible)`
          : `Submitted to ${res.successCount} of ${res.totalTokens} registered device${res.totalTokens === 1 ? "" : "s"}`) +
          (res.failureCount ? ` — ${res.failureCount} failed${errBreakdown ? ` (${errBreakdown})` : ""}` : "") +
          apnsCredentialMessage +
          (res.topicError && !res.topicSubmitted ? ` — channel error: ${res.topicError.slice(0, 120)}` : "") +
          (res.prunedTokens ? `; pruned ${res.prunedTokens} stale token${res.prunedTokens === 1 ? "" : "s"}` : ""),
        { duration: res.apnsCredentialIssue ? 14000 : 8000 },
      );
      if (res.errorSamples && res.errorSamples.length > 0) {
        console.warn("[broadcast] FCM error samples", res.errorSamples);
      }
      setTitle("");
      setBody("");
      setUrl("");
      setImageFile(null);
      setImagePreview(null);
      setProductImageUrl(null);
      setSelectedProductId(null);
      qc.invalidateQueries({ queryKey: ["broadcasts"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setImageFile(null);
      setImagePreview(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please pick an image file");
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error("Image must be under 1 MB (FCM limit ≈300 KB works best)");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setProductImageUrl(null);
    setSelectedProductId(null);
  }


  if (loading || (user && (adminQuery.isLoading || adminQuery.isFetching))) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="font-serif text-2xl">Sign in required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with your admin account to send broadcasts.
        </p>
        <Button
          className="mt-6"
          onClick={() => navigate({ to: "/auth", search: { next: "/admin/broadcast" } })}
        >
          Sign in
        </Button>
      </div>
    );
  }

  if (adminQuery.isError || adminQuery.data !== true) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="font-serif text-2xl">Restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You need an admin account to send broadcasts.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center bg-foreground px-6 py-3 text-[11px] uppercase tracking-[0.25em] text-background"
        >
          Go home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-serif text-3xl">Send a push broadcast</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sent through the app broadcast channel, plus registered devices as fallback.
      </p>

      <form
        className="mt-8 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim() || !body.trim()) {
            toast.error("Title and message are required");
            return;
          }
          if (!confirm(`Send "${title}" to all devices?`)) return;

          let imagePath: string | undefined;
          if (imageFile) {
            setUploading(true);
            const ext = imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
            const path = `${user!.id}/${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from("broadcast-images")
              .upload(path, imageFile, {
                contentType: imageFile.type,
                cacheControl: "31536000",
                upsert: false,
              });
            setUploading(false);
            if (upErr) {
              toast.error(`Image upload failed: ${upErr.message}`);
              return;
            }
            imagePath = path;
          }

          mutation.mutate({
            title: title.trim(),
            body: body.trim(),
            url: url.trim(),
            imagePath,
            imageUrl: !imagePath && productImageUrl ? productImageUrl : undefined,
          });
        }}
      >
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="New arrivals just dropped"
            required
          />
        </div>
        <div>
          <Label htmlFor="body">Message</Label>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Hermès, Chanel and more — shop now before they're gone."
            required
          />
        </div>
        <div>
          <Label htmlFor="image">Image (optional)</Label>
          <Input
            id="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImageChange}
          />
          {imagePreview && (
            <div className="mt-2 flex items-start gap-3">
              <img
                src={imagePreview}
                alt="preview"
                className="h-24 w-24 rounded border border-border object-cover"
              />
              <button
                type="button"
                className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground underline"
                onClick={() => {
                  setImageFile(null);
                  setImagePreview(null);
                  setProductImageUrl(null);
                  setSelectedProductId(null);
                }}
              >
                Remove
              </button>
            </div>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Shown as a banner in the notification. JPG/PNG/WebP, under 1 MB (≈300 KB works best). 2:1 landscape looks best on Android.
          </p>
        </div>

        <div>
          <Label>Or pick a hero product from new arrivals</Label>
          <p className="mt-1 text-[11px] text-muted-foreground">
            The product's main image is used as the notification banner. Overrides any uploaded file.
          </p>
          {newArrivalsQuery.isLoading ? (
            <p className="mt-3 text-xs text-muted-foreground">Loading new arrivals…</p>
          ) : newArrivals.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">No new arrivals available.</p>
          ) : (
            <div className="mt-3">
              <ProductPickerDropdown
                products={newArrivals}
                selectedId={selectedProductId}
                hasNextPage={!!newArrivalsQuery.hasNextPage}
                isFetchingNextPage={newArrivalsQuery.isFetchingNextPage}
                onLoadMore={() => newArrivalsQuery.fetchNextPage()}
                onSelect={(p) => {
                  if (!p) {
                    setProductImageUrl(null);
                    setSelectedProductId(null);
                    setImagePreview(null);
                    return;
                  }
                  const img = p.node.images?.edges?.[0]?.node?.url;
                  if (!img) {
                    toast.error("This product has no image");
                    return;
                  }
                  setProductImageUrl(img);
                  setSelectedProductId(p.node.id);
                  setImagePreview(img);
                  setImageFile(null);
                  if (!url.trim()) setUrl(`/product/${p.node.handle}`);
                }}
              />
            </div>
          )}
          {selectedProductId && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Using product hero image.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setProductImageUrl(null);
                  setSelectedProductId(null);
                  setImagePreview(null);
                }}
              >
                Clear
              </button>
            </p>
          )}
        </div>
        <div>
          <Label>Where should the notification open?</Label>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Pick a screen inside the app. Users who tap the notification land here.
          </p>
          <DestinationPicker
            url={url}
            onChange={setUrl}
            collections={collectionsQuery.data ?? []}
            collectionsLoading={collectionsQuery.isLoading}
            products={newArrivals}
            productsHasMore={!!newArrivalsQuery.hasNextPage}
            productsFetchingMore={newArrivalsQuery.isFetchingNextPage}
            onLoadMoreProducts={() => newArrivalsQuery.fetchNextPage()}
          />
        </div>


        <div>
          <Label>Preview</Label>
          <div className="mt-2 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 p-4">
            <p className="mb-2 text-center text-[10px] uppercase tracking-[0.2em] text-white/60">
              iOS lock screen
            </p>
            <NotificationPreview
              title={title || "Title preview"}
              body={body || "Your message will appear here."}
              imagePreview={imagePreview}
            />
            <p className="mb-2 mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-white/60">
              Android
            </p>
            <AndroidNotificationPreview
              title={title || "Title preview"}
              body={body || "Your message will appear here."}
              imagePreview={imagePreview}
            />
          </div>
        </div>

        <Button type="submit" disabled={mutation.isPending || uploading} className="w-full">
          {uploading ? "Uploading image…" : mutation.isPending ? "Sending…" : "Send broadcast"}
        </Button>
      </form>



      <div className="mt-12">
        <h2 className="font-serif text-xl">Recent broadcasts</h2>
        <div className="mt-4 space-y-3">
          {broadcastsQuery.data?.broadcasts.length === 0 && (
            <p className="text-sm text-muted-foreground">No broadcasts sent yet.</p>
          )}
          {broadcastsQuery.data?.broadcasts.map((b) => (
            <div key={b.id} className="border border-border p-4">
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-serif text-base">{b.title}</p>
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {new Date(b.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{b.body}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                ✓ submitted · {b.success_count} registered · ✕ {b.failure_count} failed
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotificationPreview({
  title,
  body,
  imagePreview,
}: {
  title: string;
  body: string;
  imagePreview: string | null;
}) {
  return (
    <div className="mx-auto max-w-sm rounded-2xl bg-white/90 p-3 shadow-xl backdrop-blur">
      <div className="flex items-start gap-3">
        <img
          src={sellierLogo}
          alt=""
          className="h-10 w-10 shrink-0 rounded-lg border border-black/10 bg-white object-contain p-1"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-black/70">
              Sellier
            </p>
            <span className="shrink-0 text-[10px] text-black/50">now</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[13px] font-semibold text-black">{title}</p>
          <p className="mt-0.5 line-clamp-3 text-[13px] text-black/80">{body}</p>
        </div>
        {imagePreview && (
          <img
            src={imagePreview}
            alt=""
            className="h-11 w-11 shrink-0 rounded-md object-cover"
          />
        )}
      </div>
      {imagePreview && (
        <img
          src={imagePreview}
          alt=""
          className="mt-3 max-h-64 w-full rounded-lg object-cover"
        />
      )}
    </div>
  );
}

function AndroidNotificationPreview({
  title,
  body,
  imagePreview,
}: {
  title: string;
  body: string;
  imagePreview: string | null;
}) {
  return (
    <div className="mx-auto max-w-sm rounded-lg bg-neutral-100 p-3 shadow-xl">
      <div className="flex items-start gap-2">
        <img
          src={sellierLogo}
          alt=""
          className="mt-0.5 h-4 w-4 shrink-0 object-contain"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-black/60">
            Sellier <span className="text-black/40">· now</span>
          </p>
          <p className="mt-0.5 line-clamp-1 text-[13px] font-medium text-black">{title}</p>
          <p className="line-clamp-2 text-[13px] text-black/70">{body}</p>
        </div>
        {imagePreview && (
          <img
            src={imagePreview}
            alt=""
            className="h-11 w-11 shrink-0 rounded object-cover"
          />
        )}
      </div>
      {imagePreview && (
        <img
          src={imagePreview}
          alt=""
          className="mt-2 aspect-[2/1] w-full rounded object-cover"
        />
      )}
    </div>
  );
}

function ProductPickerDropdown({
  products,
  selectedId,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onSelect,
}: {
  products: ShopifyProduct[];
  selectedId: string | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onSelect: (p: ShopifyProduct | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = products.find((p) => p.node.id === selectedId) ?? null;
  const selectedImg = selected?.node.images?.edges?.[0]?.node?.url;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-full items-center gap-2 border border-input bg-background px-2 text-left text-sm"
      >
        {selected ? (
          <>
            {selectedImg ? (
              <img
                src={selectedImg}
                alt=""
                className="h-8 w-8 shrink-0 rounded border border-border object-cover"
              />
            ) : (
              <div className="h-8 w-8 shrink-0 rounded border border-border bg-muted" />
            )}
            <span className="min-w-0 flex-1 truncate">{selected.node.title}</span>
          </>
        ) : (
          <span className="text-muted-foreground">— Select a product —</span>
        )}
        <span className="shrink-0 text-muted-foreground">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto border border-border bg-background shadow-lg">
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
            className="flex w-full items-center px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
          >
            — None —
          </button>
          {products.map((p) => {
            const img = p.node.images?.edges?.[0]?.node?.url;
            const isSelected = p.node.id === selectedId;
            return (
              <button
                type="button"
                key={p.node.id}
                onClick={() => {
                  onSelect(p);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted ${
                  isSelected ? "bg-muted" : ""
                }`}
              >
                {img ? (
                  <img
                    src={img}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded border border-border object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 shrink-0 rounded border border-border bg-muted" />
                )}
                <span className="min-w-0 flex-1 truncate">{p.node.title}</span>
              </button>
            );
          })}
          {hasNextPage && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLoadMore();
              }}
              disabled={isFetchingNextPage}
              className="w-full border-t border-border py-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              {isFetchingNextPage
                ? "Loading…"
                : `Load more (${products.length} loaded)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type DestKind =
  | "none"
  | "home"
  | "shop"
  | "new-arrivals"
  | "wishlist"
  | "account"
  | "orders"
  | "edits"
  | "sell"
  | "collection"
  | "product"
  | "edit"
  | "custom";

const SIMPLE_DESTINATIONS: Record<string, DestKind> = {
  "": "none",
  "/": "home",
  "/shop": "shop",
  "/new-arrivals": "new-arrivals",
  "/wishlist": "wishlist",
  "/account": "account",
  "/orders": "orders",
  "/edits": "edits",
  "/sell-with-us": "sell",
};

function kindFromUrl(url: string): DestKind {
  const trimmed = url.trim();
  if (trimmed in SIMPLE_DESTINATIONS) return SIMPLE_DESTINATIONS[trimmed];
  if (trimmed.startsWith("/collections/")) return "collection";
  if (trimmed.startsWith("/product/")) return "product";
  if (trimmed.startsWith("/edits/")) return "edit";
  if (trimmed) return "custom";
  return "none";
}

function DestinationPicker({
  url,
  onChange,
  collections,
  collectionsLoading,
  products,
  productsHasMore,
  productsFetchingMore,
  onLoadMoreProducts,
}: {
  url: string;
  onChange: (next: string) => void;
  collections: Array<{ id: string; handle: string; title: string }>;
  collectionsLoading: boolean;
  products: ShopifyProduct[];
  productsHasMore: boolean;
  productsFetchingMore: boolean;
  onLoadMoreProducts: () => void;
}) {
  const kind = kindFromUrl(url);

  const collectionHandle =
    kind === "collection" ? url.replace("/collections/", "").split(/[?#]/)[0] : "";
  const productHandle =
    kind === "product" ? url.replace("/product/", "").split(/[?#]/)[0] : "";
  const editId = kind === "edit" ? url.replace("/edits/", "").split(/[?#]/)[0] : "";
  const selectedProductId =
    kind === "product"
      ? products.find((p) => p.node.handle === productHandle)?.node.id ?? null
      : null;

  function setKind(next: DestKind) {
    switch (next) {
      case "none":
        onChange("");
        return;
      case "home":
        onChange("/");
        return;
      case "shop":
        onChange("/shop");
        return;
      case "new-arrivals":
        onChange("/new-arrivals");
        return;
      case "wishlist":
        onChange("/wishlist");
        return;
      case "account":
        onChange("/account");
        return;
      case "orders":
        onChange("/orders");
        return;
      case "edits":
        onChange("/edits");
        return;
      case "sell":
        onChange("/sell-with-us");
        return;
      case "collection":
        onChange("/collections/");
        return;
      case "product":
        onChange("/product/");
        return;
      case "edit":
        onChange("/edits/");
        return;
      case "custom":
        onChange(url && !["/", "/shop", "/new-arrivals", "/wishlist", "/account", "/orders", "/edits", "/sell-with-us"].includes(url) ? url : "/");
        return;
    }
  }

  return (
    <div className="mt-2 space-y-3">
      <select
        className="h-10 w-full border border-input bg-background px-3 text-sm"
        value={kind}
        onChange={(e) => setKind(e.target.value as DestKind)}
      >
        <option value="none">— Nowhere (just show the notification) —</option>
        <optgroup label="Main screens">
          <option value="home">Home</option>
          <option value="shop">Shop</option>
          <option value="new-arrivals">New arrivals</option>
          <option value="wishlist">Wishlist</option>
          <option value="orders">Orders</option>
          <option value="account">Account</option>
          <option value="edits">My edits</option>
          <option value="sell">Sell with us</option>
        </optgroup>
        <optgroup label="Specific content">
          <option value="collection">A collection…</option>
          <option value="product">A product…</option>
          <option value="edit">A specific edit (by ID)…</option>
        </optgroup>
        <optgroup label="Advanced">
          <option value="custom">Custom in-app path or https URL…</option>
        </optgroup>
      </select>

      {kind === "collection" && (
        <div>
          <Label className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Choose collection
          </Label>
          <select
            className="mt-1 h-10 w-full border border-input bg-background px-3 text-sm"
            value={collectionHandle}
            onChange={(e) =>
              onChange(e.target.value ? `/collections/${e.target.value}` : "/collections/")
            }
            disabled={collectionsLoading}
          >
            <option value="">
              {collectionsLoading ? "Loading collections…" : "— Select a collection —"}
            </option>
            {collections.map((c) => (
              <option key={c.id} value={c.handle}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {kind === "product" && (
        <div>
          <Label className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Choose product
          </Label>
          <div className="mt-1">
            <ProductPickerDropdown
              products={products}
              selectedId={selectedProductId}
              hasNextPage={productsHasMore}
              isFetchingNextPage={productsFetchingMore}
              onLoadMore={onLoadMoreProducts}
              onSelect={(p) => {
                if (!p) {
                  onChange("/product/");
                  return;
                }
                onChange(`/product/${p.node.handle}`);
              }}
            />
          </div>
        </div>
      )}

      {kind === "edit" && (
        <div>
          <Label className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Edit ID
          </Label>
          <Input
            className="mt-1"
            value={editId}
            onChange={(e) => onChange(`/edits/${e.target.value.trim()}`)}
            placeholder="e.g. 8f3c…"
          />
        </div>
      )}

      {kind === "custom" && (
        <div>
          <Label className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Custom path or URL
          </Label>
          <Input
            className="mt-1"
            value={url}
            onChange={(e) => onChange(e.target.value)}
            placeholder="/shop or https://…"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Paths starting with <code>/</code> open inside the app. A full <code>https://</code> URL opens the website.
          </p>
        </div>
      )}

      {url && (
        <p className="text-[11px] text-muted-foreground">
          Opens: <code className="rounded bg-muted px-1 py-0.5">{url}</code>
        </p>
      )}
    </div>
  );
}



