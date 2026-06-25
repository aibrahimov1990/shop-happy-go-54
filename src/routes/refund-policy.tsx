import { createFileRoute } from "@tanstack/react-router";
import { MobileLayout } from "@/components/MobileLayout";

export const Route = createFileRoute("/refund-policy")({
  head: () => ({
    meta: [
      { title: "Refund Policy — Sellier Knightsbridge" },
      { name: "description", content: "Sellier Knightsbridge refund and returns policy." },
    ],
  }),
  component: RefundPage,
});

function RefundPage() {
  return (
    <MobileLayout>
      <article className="px-6 py-10 space-y-4">
        <h1 className="font-serif text-3xl">Refund Policy</h1>
        <p className="text-sm text-foreground/80 leading-relaxed uppercase">
          Items marketed on our website are sold through our platform for
          individual private sellers. This means that like many other luxury
          resale platforms, all sales are final and Sellier Knightsbridge
          <strong> cannot </strong> accept any returns, refunds or exchanges
          for items bought in this way. We note that at all material times
          legal title to the items sold through Sellier Knightsbridge remains
          with the individual private sellers until sale.
        </p>
        <p className="text-sm text-foreground/80 leading-relaxed uppercase">
          <strong>All sales through our platform are consumer to consumer</strong> and
          this returns policy is in line with the current statutory framework.
        </p>
        <p className="text-sm text-foreground/80 leading-relaxed uppercase">
          Items are priced in accordance with their condition and meticulous
          care is taken to check each item before it is shipped to the buyer.
          As such, please do read the product description and all photographs
          of the item before proceeding to purchase. We guarantee the
          authenticity of any item bought with Sellier Knightsbridge. As such,
          we will offer a full refund for any item that is <strong>proven</strong> not
          to be authentic.
        </p>
      </article>
    </MobileLayout>
  );
}
