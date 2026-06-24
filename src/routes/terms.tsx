import { createFileRoute } from "@tanstack/react-router";
import { MobileLayout } from "@/components/MobileLayout";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Sellier Knightsbridge" },
      { name: "description", content: "Sellier Knightsbridge terms and conditions." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <MobileLayout>
      <article className="px-6 py-10 space-y-4">
        <h1 className="font-serif text-3xl">Terms &amp; Conditions</h1>
        <p className="text-sm text-foreground/80 leading-relaxed">
          By using the Sellier Knightsbridge app and website, you agree to our
          terms of service. All items sold are authenticated preloved luxury
          goods. Prices are listed in GBP and include applicable taxes where
          required.
        </p>
        <p className="text-sm text-foreground/80 leading-relaxed">
          For the full, up-to-date terms please contact us at 020 7581 2380 or
          visit our boutique at 6 Cheval Place, London.
        </p>
      </article>
    </MobileLayout>
  );
}
