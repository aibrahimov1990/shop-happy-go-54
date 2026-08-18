import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrCreateLaunchCredit } from "@/lib/launch-credit.functions";

function londonDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(iso))
    .replace(",", "");
}

export function LaunchCreditCard() {
  const claim = useServerFn(getOrCreateLaunchCredit);
  // Single read of the clock per render — deliberately no interval/countdown.
  const [now] = useState(() => Date.now());
  const { data, isLoading, error } = useQuery({
    queryKey: ["launch-credit"],
    queryFn: () => claim(),
    retry: false,
  });


  // Surface failures instead of rendering nothing: a thrown server error used to
  // make this card disappear silently, which is indistinguishable from "disabled".
  if (error) {
    return (
      <div className="px-6 py-5 border-b border-border/60">
        <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
          Launch credit
        </p>
        <p className="text-sm text-muted-foreground">
          We couldn’t load your launch credit just now. Please try again shortly.
        </p>
      </div>
    );
  }

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

  const startsMs = new Date(data.startsAt).getTime();
  const endsMs = new Date(data.endsAt).getTime();
  const phase = data.used
    ? ("used" as const)
    : now < startsMs
      ? ("before" as const)
      : now < endsMs
        ? ("live" as const)
        : ("expired" as const);

  return (
    <div className="px-6 py-5 border-b border-border/60">
      <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
        Launch credit
      </p>

      {phase === "expired" ? (
        <>
          <p className="font-serif text-2xl text-muted-foreground">
            £{Math.round(data.amount)} credit
          </p>
          <p className="font-mono text-sm tracking-[0.2em] mt-2 text-muted-foreground/70">
            {data.code}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Expired {londonDateTime(data.endsAt)} (London time).
          </p>
        </>
      ) : (
        <>
          <p className="font-serif text-2xl">£{Math.round(data.amount)} credit</p>

          {phase === "before" ? (
            <>
              <p className="font-mono text-xs tracking-[0.2em] mt-2 text-muted-foreground">
                {data.code}
              </p>
              <p className="text-sm mt-3">
                Live from {londonDateTime(data.startsAt)} (London time)
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                The code cannot be applied at checkout before then.
              </p>
            </>
          ) : (
            <>
              <p className="font-mono text-sm tracking-[0.2em] mt-2">{data.code}</p>
              {phase === "live" ? (
                <>
                  <p className="text-sm mt-3">Live now — apply at checkout.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Closes {londonDateTime(data.endsAt)} (London time)
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground mt-2">
                  Already used on an order.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>

  );
}
