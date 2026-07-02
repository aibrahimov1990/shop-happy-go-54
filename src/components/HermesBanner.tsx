import hermesBanner from "@/assets/hermes-banner.jpg";

export function HermesBanner() {
  return (
    <a
      href="https://www.sellierknightsbridge.com/collections/hermes-bags-birkin-kelly-london"
      target="_blank"
      rel="noopener noreferrer"
      className="col-span-2 block my-4 group"
      aria-label="Shop Hermès at Sellier Knightsbridge"
    >
      <div className="relative overflow-hidden bg-muted">
        <img
          src={hermesBanner}
          alt="Shop Hermès at Sellier Knightsbridge"
          className="w-full h-auto object-cover"
          loading="lazy"
        />
      </div>
      <div className="bg-[#f5f1ea] text-center py-6 px-4">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
          The House of Hermès
        </p>
        <h3 className="font-serif text-2xl mb-4">Birkin. Kelly. Beyond.</h3>
        <span className="inline-block bg-foreground text-background px-6 py-3 text-[11px] uppercase tracking-[0.25em]">
          Shop Hermès →
        </span>
      </div>
    </a>
  );
}
