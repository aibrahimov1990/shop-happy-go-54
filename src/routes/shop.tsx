import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MobileLayout } from "@/components/MobileLayout";
import { ProductCard } from "@/components/ProductCard";
import { storefrontApiRequest, PRODUCTS_QUERY, type ShopifyProduct } from "@/lib/shopify";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SlidersHorizontal, X } from "lucide-react";

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

const SORTS = [
  { label: "New In", sortKey: "CREATED_AT", reverse: true },
  { label: "Price: Low to High", sortKey: "PRICE", reverse: false },
  { label: "Price: High to Low", sortKey: "PRICE", reverse: true },
  { label: "Best Selling", sortKey: "BEST_SELLING", reverse: false },
] as const;

export const Route = createFileRoute("/shop")({
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

  const [types, setTypes] = useState<string[]>([]);
  const [designers, setDesigners] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [colours, setColours] = useState<string[]>([]);

  const sort = SORTS[sortIdx];
  const query = buildQuery({ types, designers, conditions, colours });
  const activeCount = types.length + designers.length + conditions.length + colours.length;

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", "shop", query, sort.label],
    queryFn: async (): Promise<ShopifyProduct[]> => {
      const res = await storefrontApiRequest<any>(PRODUCTS_QUERY, {
        first: 60,
        query,
        sortKey: sort.sortKey,
        reverse: sort.reverse,
      });
      return res?.data?.products?.edges ?? [];
    },
  });

  const toggle =
    (setter: React.Dispatch<React.SetStateAction<string[]>>) => (v: string) =>
      setter((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));

  const clearAll = () => {
    setTypes([]);
    setDesigners([]);
    setConditions([]);
    setColours([]);
  };

  // Quick chips for top categories
  const quickChips: Array<{ label: string; type: string }> = [
    { label: "Bags", type: "Bag" },
    { label: "Shoes", type: "Shoes" },
    { label: "Dresses", type: "Dress" },
    { label: "Jackets", type: "Jacket" },
    { label: "Coats", type: "Coat" },
    { label: "Accessories", type: "Accessories" },
  ];

  return (
    <MobileLayout>
      <div className="px-4 pt-6 pb-3">
        <h1 className="font-serif text-3xl">Shop</h1>
      </div>

      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-sm border-b border-border/60">
        <div className="flex gap-1 overflow-x-auto px-4 py-3 no-scrollbar">
          {quickChips.map((c) => {
            const active = types.length === 1 && types[0] === c.type;
            return (
              <button
                key={c.label}
                onClick={() => setTypes(active ? [] : [c.type])}
                className={`shrink-0 px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] border transition-colors ${
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                {c.label}
              </button>
            );
          })}
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
            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
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
              </div>
              <SheetFooter className="mt-6 sticky bottom-0 bg-background pb-4">
                <Button className="w-full" onClick={() => setFilterOpen(false)}>
                  Show {isLoading ? "…" : products.length} results
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
          <div className="grid grid-cols-2 gap-x-3 gap-y-6">
            {products.map((p) => (
              <ProductCard key={p.node.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </MobileLayout>
  );
}
