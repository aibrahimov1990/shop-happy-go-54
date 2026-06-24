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
        <p className="text-sm text-foreground/80 leading-relaxed">
          As a consignment store specialising in preloved luxury, all sales
          are final. Items are sold as described and authenticated by our
          team prior to listing.
        </p>
        <p className="text-sm text-foreground/80 leading-relaxed">
          If your order arrives damaged or significantly differs from the
          listing, please contact us within 48 hours of delivery so we can
          resolve the issue.
        </p>
      </article>
    </MobileLayout>
  );
}
