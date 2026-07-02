import { Link } from "@tanstack/react-router";
import hermesBanner from "@/assets/hermes-banner.jpg";
import hermesBanner2 from "@/assets/hermes-banner-2.jpg";

const HERMES_HANDLE = "hermes-bags-birkin-kelly-london";

export function HermesBanner({ variant = 1 }: { variant?: 1 | 2 }) {
  const src = variant === 2 ? hermesBanner2 : hermesBanner;
  return (
    <Link
      to="/collections/$handle"
      params={{ handle: HERMES_HANDLE }}
      className="col-span-2 block my-4 group"
      aria-label="Shop Hermès at Sellier Knightsbridge"
    >
      <div className="relative overflow-hidden bg-muted">
        <img
          src={src}
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
    </Link>
  );
}
