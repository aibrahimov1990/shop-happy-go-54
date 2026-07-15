import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MobileLayout } from "@/components/MobileLayout";
import { ProductCard } from "@/components/ProductCard";
import { storefrontApiRequest, PRODUCTS_QUERY, isKidsProduct, type ShopifyProduct } from "@/lib/shopify";
import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SlidersHorizontal, X, Loader2, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HermesBanner } from "@/components/HermesBanner";
import React from "react";

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

const CONDITIONS = ["Fair", "Good", "Very Good", "Excellent", "Pristine", "Store Fresh"];

const COLOURS = [
  "Beige", "Black", "Blue", "Brown", "Burgundy", "Cream", "Gold", "Green",
  "Grey", "Khaki", "Lilac", "Multi-Colour", "Navy", "Orange", "Pink", "Purple",
  "Red", "Silver", "White", "Yellow",
];

const SIZES = ["4", "6", "8", "10", "12", "14", "16", "18"];

const SHOE_SIZES = [
  "35", "35.5", "36", "36.5", "37", "37.5", "38", "38.5", "39", "39.5",
  "40", "40.5", "41", "41.5", "42",
];

const SORTS = [
  { label: "New In", sortKey: "CREATED_AT", reverse: true },
  { label: "Price: Low to High", sortKey: "PRICE", reverse: false },
  { label: "Price: High to Low", sortKey: "PRICE", reverse: true },
  { label: "Best Selling", sortKey: "BEST_SELLING", reverse: false },
] as const;

type ShopSearch = { category?: "clothing" | "bags" | "shoes" | "accessories" };

export const Route = createFileRoute("/shop")({
  validateSearch: (search: Record<string, unknown>): ShopSearch => {
    const c = search.category;
    if (c === "clothing" || c === "bags" || c === "shoes" || c === "accessories") {
      return { category: c };
    }
    return {};
  },
  head: () => ({
    meta: [
      { title: "Shop — Sellier Knightsbridge" },
      {
        name: "description",
        content: "Browse authenticated preloved luxury bags, shoes, clothing and accessories.",
      },
      { property: "og:title", content: "Shop — Sellier Knightsbridge" },
      {
        property: "og:description",
        content: "Browse authenticated preloved luxury at Sellier.",
      },
    ],
  }),
  component: Shop,
});

function buildQuery(filters: {
  types: string[];
  designers: string[];
  conditions: string[];
  colours: string[];
  sizes: string[];
  shoeSizes: string[];
}) {
  const parts: string[] = [];
  if (filters.types.length) {
    parts.push("(" + filters.types.map((t) => `product_type:"${t}"`).join(" OR ") + ")");
  }
  if (filters.designers.length) {
    // Designer lives in title / tags on this store
    parts.push(
      "(" +
        filters.designers
          .map((d) => `title:"${d}" OR tag:"${d}" OR vendor:"${d}"`)
          .join(" OR ") +
        ")",
    );
  }
  if (filters.conditions.length) {
    parts.push("(" + filters.conditions.map((c) => `tag:"${c}"`).join(" OR ") + ")");
  }
  if (filters.colours.length) {
    parts.push(
      "(" +
        filters.colours
          .map((c) => `title:"${c}" OR tag:"${c}"`)
          .join(" OR ") +
        ")",
    );
  }
  if (filters.sizes.length) {
    // Clothing sizes: match "UK <size>" anywhere in the product's default
    // search fields (title, description, tags, vendor, product_type).
    parts.push(
      "(" +
        filters.sizes.map((s) => `"UK ${s}"`).join(" OR ") +
        ")",
    );
  }
  if (filters.shoeSizes.length) {
    // Shoe sizes: match "EU <size>" anywhere in default search fields
    // (Shopify Storefront search includes the product description/body).
    parts.push(
      "(" +
        filters.shoeSizes.map((s) => `"EU ${s}"`).join(" OR ") +
        ")",
    );
  }
  return parts.length ? parts.join(" AND ") : null;
}

function FacetGroup({
  title,
  options,
  selected,
  onToggle,
  onClear,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between py-4 text-left"
      >
        <span className="text-[11px] uppercase tracking-[0.2em]">
          {title}
          {selected.length > 0 && (
            <span className="ml-2 text-muted-foreground">({selected.length})</span>
          )}
        </span>
        <span className="text-muted-foreground text-xs">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="pb-4 space-y-2">
          {selected.length > 0 && (
            <button
              onClick={onClear}
              className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground underline"
            >
              Clear
            </button>
          )}
          <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-2">
            {options.map((opt) => {
              const checked = selected.includes(opt);
              return (
                <label
                  key={opt}
                  className="flex items-center gap-3 text-sm cursor-pointer py-1"
                >
                  <Checkbox checked={checked} onCheckedChange={() => onToggle(opt)} />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Shop() {
  const [sortIdx, setSortIdx] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [newIn, setNewIn] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Debounce the search input so we don't hammer Shopify on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [types, setTypes] = useState<string[]>([]);
  const [designers, setDesigners] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [colours, setColours] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [shoeSizes, setShoeSizes] = useState<string[]>([]);

  const searchActive = search.length > 0;
  const sort = newIn && !searchActive ? SORTS[0] : SORTS[sortIdx];
  const filterQuery = buildQuery({ types, designers, conditions, colours, sizes, shoeSizes });
  // Always exclude KIDS-tagged products from the main shop.
  const EXCLUDE_KIDS = "-tag:KIDS";
  const baseQuery = searchActive
    ? [filterQuery, `(title:*${search}* OR tag:*${search}* OR vendor:*${search}* OR product_type:*${search}*)`]
        .filter(Boolean)
        .join(" AND ")
    : filterQuery;
  const query = baseQuery ? `${baseQuery} AND ${EXCLUDE_KIDS}` : EXCLUDE_KIDS;
  const activeCount =
    types.length + designers.length + conditions.length + colours.length + sizes.length + shoeSizes.length;

  // Collection query used when New In is active — pulls the first 100 products
  // from Shopify's automatic "All" collection.
  const NEW_IN_COLLECTION_QUERY = `
    query NewInCollection($handle: String!, $first: Int!, $after: String) {
      collection(handle: $handle) {
        products(first: $first, after: $after, sortKey: COLLECTION_DEFAULT) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id title description handle vendor tags
              priceRange { minVariantPrice { amount currencyCode } }
              images(first: 5) { edges { node { url(transform: { preferredContentType: JPG }) altText } } }
              variants(first: 10) {
                edges { node { id title price { amount currencyCode } availableForSale selectedOptions { name value } } }
              }
              options { name values }
            }
          }
        }
      }
    }
  `;

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["products", "shop", newIn && !searchActive ? "all-collection-first-100" : query, sort.label, newIn, searchActive],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (newIn && !searchActive) {
        const res = await storefrontApiRequest<any>(NEW_IN_COLLECTION_QUERY, {
          handle: "all",
          first: 100,
          after: null,
        });
        const products = res?.data?.collection?.products;
        return {
          edges: (products?.edges ?? []) as ShopifyProduct[],
          endCursor: products?.pageInfo?.endCursor ?? null,
          hasNextPage: false,
        };
      }
      const res = await storefrontApiRequest<any>(PRODUCTS_QUERY, {
        first: 24,
        after: pageParam,
        query,
        sortKey: sort.sortKey,
        reverse: sort.reverse,
      });
      const products = res?.data?.products;
      return {
        edges: (products?.edges ?? []) as ShopifyProduct[],
        endCursor: products?.pageInfo?.endCursor ?? null,
        hasNextPage: products?.pageInfo?.hasNextPage ?? false,
      };
    },
    getNextPageParam: (last) => (last.hasNextPage ? last.endCursor : undefined),
  });


  const products: ShopifyProduct[] = (data?.pages.flatMap((p) => p.edges) ?? []).filter(
    (p) => !isKidsProduct(p),
  );

  // When any refine filter is active, auto-fetch all remaining pages so the
  // user sees the full catalogue for that filter — not just the first page.
  useEffect(() => {
    if (activeCount > 0 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [activeCount, hasNextPage, isFetchingNextPage, fetchNextPage, products.length]);

  // Infinite scroll sentinel (used when no filters are active)
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const toggle =
    (setter: React.Dispatch<React.SetStateAction<string[]>>) => (v: string) =>
      setter((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));

  const clearAll = () => {
    setTypes([]);
    setDesigners([]);
    setConditions([]);
    setColours([]);
    setSizes([]);
    setShoeSizes([]);
  };

  // Top category nav
  const CLOTHING_TYPES = [
    "Blazer", "Blouse", "Cardigan", "Coat", "Dress", "Gilet", "Jacket", "Jeans",
    "Jumper", "Jumpsuit", "Shirt", "Shorts", "Skirt", "Sweater", "Swimwear",
    "Top", "Trousers", "T-Shirt", "Two Piece",
  ];
  const isAllClothing =
    types.length === CLOTHING_TYPES.length &&
    CLOTHING_TYPES.every((t) => types.includes(t));
  const clothingActive =
    isAllClothing ||
    (types.length === 1 && CLOTHING_TYPES.includes(types[0]));
  const bagsActive = types.length === 1 && types[0] === "Bag";
  const shoesActive = types.length === 1 && types[0] === "Shoes";
  const accessoriesActive = types.length === 1 && types[0] === "Accessories";
  const [clothingOpen, setClothingOpen] = useState(false);

  // Reset size / shoe-size selections when the category no longer matches,
  // so stale filters don't silently constrain the query.
  useEffect(() => {
    if (!clothingActive && sizes.length) setSizes([]);
    if (!shoesActive && shoeSizes.length) setShoeSizes([]);
  }, [clothingActive, shoesActive, sizes.length, shoeSizes.length]);

  const navBtn = (active: boolean) =>
    `shrink-0 px-4 py-2 text-[10px] uppercase tracking-[0.2em] border transition-colors ${
      active
        ? "bg-foreground text-background border-foreground"
        : "border-border text-muted-foreground"
    }`;


  return (
    <MobileLayout>
      <div className="px-4 pt-6 pb-3">
        <h1 className="font-serif text-3xl">Shop</h1>
      </div>

      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-sm border-b border-border/60">
        <div className="px-4 pt-3 pb-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              inputMode="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search products, designers…"
              className="w-full h-10 pl-9 pr-9 text-sm bg-muted/40 border border-border/60 focus:outline-none focus:border-foreground/60 placeholder:text-muted-foreground"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto px-4 py-3 no-scrollbar">
          <button
            onClick={() => {
              const next = !newIn;
              setNewIn(next);
              if (next) {
                setTypes([]);
                setDesigners([]);
                setConditions([]);
                setColours([]);
              }
            }}
            className={navBtn(newIn)}
          >
            New In
          </button>
          <button
            onClick={() => {
              setNewIn(false);
              setTypes(bagsActive ? [] : ["Bag"]);
            }}
            className={navBtn(bagsActive && !newIn)}
          >
            Bags
          </button>

          <Popover open={clothingOpen} onOpenChange={setClothingOpen}>
            <PopoverTrigger asChild>
              <button className={`${navBtn(clothingActive)} inline-flex items-center gap-1`}>
                Clothing
                <ChevronDown className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-2">
              <button
                onClick={() => {
                  setTypes(isAllClothing ? [] : CLOTHING_TYPES);
                  setClothingOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-[11px] uppercase tracking-[0.18em] hover:bg-muted"
              >
                All Clothing
              </button>
              <div className="max-h-72 overflow-y-auto mt-1 border-t border-border/60 pt-1">
                {CLOTHING_TYPES.map((t) => {
                  const active = types.length === 1 && types[0] === t;
                  return (
                    <button
                      key={t}
                      onClick={() => {
                        setTypes(active ? [] : [t]);
                        setClothingOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${
                        active ? "font-medium" : ""
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <button
            onClick={() => setTypes(shoesActive ? [] : ["Shoes"])}
            className={navBtn(shoesActive)}
          >
            Shoes
          </button>
          <button
            onClick={() => setTypes(accessoriesActive ? [] : ["Accessories"])}
            className={navBtn(accessoriesActive)}
          >
            Accessories
          </button>
        </div>

        <div className="flex items-center justify-between px-4 pb-3 gap-3">
          <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
            <SheetTrigger asChild>
              <button className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] border border-border px-3 py-2">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Refine
                {activeCount > 0 && (
                  <span className="bg-foreground text-background text-[10px] rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                    {activeCount}
                  </span>
                )}
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto pt-[calc(env(safe-area-inset-top)+1rem)] [&>button.absolute]:!top-[calc(env(safe-area-inset-top)+1rem)]">
              <SheetHeader>
                <SheetTitle className="font-serif text-2xl text-left">Refine By</SheetTitle>
              </SheetHeader>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {activeCount} selected
                </span>
                {activeCount > 0 && (
                  <button
                    onClick={clearAll}
                    className="text-[10px] uppercase tracking-[0.2em] underline"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="mt-2">
                <FacetGroup
                  title="Product Type"
                  options={PRODUCT_TYPES}
                  selected={types}
                  onToggle={toggle(setTypes)}
                  onClear={() => setTypes([])}
                />
                <FacetGroup
                  title="Designers"
                  options={DESIGNERS}
                  selected={designers}
                  onToggle={toggle(setDesigners)}
                  onClear={() => setDesigners([])}
                />
                <FacetGroup
                  title="Condition"
                  options={CONDITIONS}
                  selected={conditions}
                  onToggle={toggle(setConditions)}
                  onClear={() => setConditions([])}
                />
                <FacetGroup
                  title="Colour"
                  options={COLOURS}
                  selected={colours}
                  onToggle={toggle(setColours)}
                  onClear={() => setColours([])}
                />
                {clothingActive && (
                  <FacetGroup
                    title="Size"
                    options={SIZES}
                    selected={sizes}
                    onToggle={toggle(setSizes)}
                    onClear={() => setSizes([])}
                  />
                )}
                {shoesActive && (
                  <FacetGroup
                    title="Shoe Size"
                    options={SHOE_SIZES}
                    selected={shoeSizes}
                    onToggle={toggle(setShoeSizes)}
                    onClear={() => setShoeSizes([])}
                  />
                )}
              </div>
              <SheetFooter className="mt-6 sticky bottom-0 bg-background pb-4">
                <Button className="w-full" onClick={() => setFilterOpen(false)}>
                  Show {isLoading ? "…" : products.length}
                  {hasNextPage || isFetchingNextPage ? "+" : ""} results
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
          <select
            value={sortIdx}
            onChange={(e) => setSortIdx(Number(e.target.value))}
            className="text-[11px] uppercase tracking-[0.15em] bg-transparent border border-border px-2 py-2"
          >
            {SORTS.map((s, i) => (
              <option key={s.label} value={i}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {activeCount > 0 && (
          <div className="flex gap-1 overflow-x-auto px-4 pb-3 no-scrollbar">
            {[
              ...types.map((v) => ({ label: v, clear: () => setTypes((s) => s.filter((x) => x !== v)) })),
              ...designers.map((v) => ({ label: v, clear: () => setDesigners((s) => s.filter((x) => x !== v)) })),
              ...conditions.map((v) => ({ label: v, clear: () => setConditions((s) => s.filter((x) => x !== v)) })),
              ...colours.map((v) => ({ label: v, clear: () => setColours((s) => s.filter((x) => x !== v)) })),
              ...sizes.map((v) => ({ label: `UK ${v}`, clear: () => setSizes((s) => s.filter((x) => x !== v)) })),
              ...shoeSizes.map((v) => ({ label: `EU ${v}`, clear: () => setShoeSizes((s) => s.filter((x) => x !== v)) })),
            ].map((chip, i) => (
              <button
                key={i}
                onClick={chip.clear}
                className="shrink-0 flex items-center gap-1 px-3 py-1 text-[10px] uppercase tracking-[0.18em] bg-foreground text-background rounded-full"
              >
                {chip.label}
                <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}
      </div>

      <section className="px-4 py-6">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-[3/4] bg-muted animate-pulse" />
                <div className="h-3 bg-muted animate-pulse w-1/2" />
                <div className="h-3 bg-muted animate-pulse w-3/4" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No products found.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-6">
              {products.map((p, i) => (
                <React.Fragment key={p.node.id}>
                  <ProductCard product={p} />
                  {!searchActive && (i + 1) % 20 === 0 && i < products.length - 1 && (
                    <HermesBanner variant={((i + 1) / 20) % 2 === 1 ? 1 : 2} />
                  )}
                </React.Fragment>
              ))}
            </div>
            <div ref={sentinelRef} className="h-10" />
            {isFetchingNextPage && (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!hasNextPage && products.length > 0 && (
              <p className="text-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground py-8">
                End of results
              </p>
            )}
          </>
        )}
      </section>
    </MobileLayout>
  );
}
