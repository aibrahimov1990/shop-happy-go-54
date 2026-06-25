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
          Items marketed on our website are sold through our platform for individual private sellers.
          This means that like many other luxury resale platforms, all sales are final and Sellier
          Knightsbridge cannot accept any returns, refunds or exchanges for items bought in this way.
          We note that at all material times legal title to the items sold through Sellier
          Knightsbridge remains with the individual private sellers until sale. All sales through our
          platform are consumer to consumer and this returns policy is in line with the current
          statutory framework.
        </p>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Items are priced in accordance with their condition and meticulous care is taken to check
          each item before it is shipped to the buyer. As such, please do read the product
          description and all photographs of the item before proceeding to purchase. We guarantee the
          authenticity of any item bought with Sellier Knightsbridge. As such, we will offer a full
          refund for any item that is proven not to be authentic.
        </p>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Consumer protection laws may not apply to purchases made through Sellier where Sellier acts
          solely as an intermediary facilitating a sale between private individuals. More
          specifically, the right to cancel under section 29(1) of the Consumer Contracts
          (Information, Cancellation and Additional Charges) Regulations 2013 and the short-term
          right to reject under section 20 of the Consumer Rights Act 2015 may not apply to such
          transactions.
        </p>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Buyer rights are significantly reduced where a sale is carried out on behalf of a private
          consignor. In particular, the provisions relating to goods being of satisfactory quality
          (section 9 of the Consumer Rights Act 2015) and fit for a particular purpose (section 10
          of the Consumer Rights Act 2015) may not apply in the same way as they would to a standard
          business-to-consumer sale.
        </p>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Many items sold through Sellier are pre-owned and may show signs of wear consistent with
          age and prior use. Items sold on behalf of private consignors are not required to be
          fault-free. Where any defects, marks, repairs, alterations, or signs of wear are disclosed
          in the listing description, photographs, condition report, or otherwise communicated to
          the buyer prior to purchase, the buyer acknowledges and accepts such characteristics as
          part of the item's condition. All purchases made through Sellier remain subject to
          Sellier's Terms and Conditions, including our authentication procedures and condition
          grading standards.
        </p>
      </article>
    </MobileLayout>
  );
}
