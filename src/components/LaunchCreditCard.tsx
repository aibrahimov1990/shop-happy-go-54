import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrCreateLaunchCredit } from "@/lib/launch-credit.functions";

function londonWindow(startsAt: string, endsAt: string) {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  return `${fmt(startsAt)} – ${fmt(endsAt)} (London)`;
}

export function LaunchCreditCard() {
  const claim = useServerFn(getOrCreateLaunchCredit);
  const { data, isLoading } = useQuery({
    queryKey: ["launch-credit"],
    queryFn: () => claim(),
    retry: false,
  });

  if (isLoading || !data || data.status === "disabled") return null;

  const message = (() => {
    switch (data.status) {
      case "unverified":
        return "Confirm your email address to unlock your £100 launch credit.";
      case "ineligible":
        return "This email address isn’t eligible for the launch credit.";
      case "already_claimed":
        return "A launch credit has already been claimed for this email address.";
      case "capacity_reached":
        return "All launch credits have now been claimed.";
      case "revoked":
        return "This launch credit is no longer valid.";
      default:
        return null;
    }
  })();

  if (message) {
    return (
      <div className="px-6 py-5 border-b border-border/60">
        <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
          Launch credit
        </p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    );
  }

  if (data.status !== "issued") return null;

  return (
    <div className="px-6 py-5 border-b border-border/60">
      <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
        Launch credit
      </p>
      <p className="font-serif text-2xl">£{Math.round(data.amount)} credit</p>
      <p className="font-mono text-sm tracking-[0.2em] mt-2">{data.code}</p>
      <p className="text-xs text-muted-foreground mt-2">
        {londonWindow(data.startsAt, data.endsAt)}
      </p>
      {data.used && (
        <p className="text-xs text-muted-foreground mt-1">Already used on an order.</p>
      )}
    </div>
  );
}
