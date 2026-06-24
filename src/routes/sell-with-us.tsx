import { createFileRoute } from "@tanstack/react-router";
import { MobileLayout } from "@/components/MobileLayout";

export const Route = createFileRoute("/sell-with-us")({
  head: () => ({
    meta: [
      { title: "Sell With Us — Sellier Knightsbridge" },
      { name: "description", content: "Consign or sell your luxury items with Sellier Knightsbridge." },
    ],
  }),
  component: SellPage,
});

function SellPage() {
  return (
    <MobileLayout>
      <article className="px-6 py-10 space-y-4">
        <h1 className="font-serif text-3xl">Sell With Us</h1>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Sellier Knightsbridge buys and consigns authentic luxury handbags,
          ready-to-wear, shoes and accessories. We pay cash on the spot for
          eligible items.
        </p>
        <p className="text-sm text-foreground/80 leading-relaxed">
          To get a valuation, visit us at 6 Cheval Place, London, or call
          020 7581 2380. You can also email photos of your items for an
          initial quote.
        </p>
      </article>
    </MobileLayout>
  );
}
