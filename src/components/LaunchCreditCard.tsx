import { useEffect, useState } from "react";
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

const pad = (n: number) => String(n).padStart(2, "0");

function countdownUnits(msRemaining: number) {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (days > 0) {
    return [
      { label: "Days", value: String(days) },
      { label: "Hrs", value: pad(hours) },
      { label: "Mins", value: pad(minutes) },
    ];
  }
  return [
    { label: "Hrs", value: pad(hours) },
    { label: "Mins", value: pad(minutes) },
    { label: "Secs", value: pad(seconds) },
  ];
}

function Countdown({ target, now }: { target: number; now: number }) {
  const units = countdownUnits(target - now);
  return (
    <div className="mt-6 flex items-start">
      {units.map((unit, i) => (
        <div
          key={unit.label}
          className={
            "flex-1 text-center px-2" +
            (i > 0 ? " border-l border-border/60" : "")
          }
        >
          <p className="font-serif text-3xl leading-none tabular-nums">
            {unit.value}
          </p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {unit.label}
          </p>
        </div>
      ))}
    </div>
  );
}

export function LaunchCreditCard() {
  const claim = useServerFn(getOrCreateLaunchCredit);
  const [now, setNow] = useState(() => Date.now());
  const { data, isLoading, error } = useQuery({
    queryKey: ["launch-credit"],
    queryFn: () => claim(),
    retry: false,
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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
    <div className="px-6 py-8 border-b border-border/60">
      <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
        Launch credit
      </p>

      {phase === "expired" ? (
        <>
          <p className="font-serif text-4xl mt-4 text-muted-foreground">
            £{Math.round(data.amount)} credit
          </p>
          <p className="text-sm text-muted-foreground mt-5">
            Expired {londonDateTime(data.endsAt)}, London time.
          </p>
          <p className="font-mono text-sm tracking-[0.2em] mt-5 text-muted-foreground/70">
            {data.code}
          </p>
        </>
      ) : phase === "used" ? (
        <>
          <p className="font-serif text-4xl mt-4">£{Math.round(data.amount)} credit</p>
          <p className="text-sm text-muted-foreground mt-5">
            Already used on an order.
          </p>
          <p className="font-mono text-sm tracking-[0.2em] mt-5">{data.code}</p>
        </>
      ) : phase === "before" ? (
        <>
          <p className="font-serif text-4xl mt-4">£{Math.round(data.amount)} credit</p>
          <Countdown target={startsMs} now={now} />
          <p className="text-sm mt-6">
            Live from {londonDateTime(data.startsAt)}, London time
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            The code cannot be applied at checkout before then.
          </p>
          <p className="font-mono text-sm tracking-[0.2em] mt-6 text-muted-foreground/70">
            {data.code}
          </p>
        </>
      ) : (
        <>
          <p className="font-serif text-4xl mt-4">£{Math.round(data.amount)} credit</p>
          <Countdown target={endsMs} now={now} />
          <p className="text-sm mt-6">
            Live now — apply at checkout, closes {londonDateTime(data.endsAt)},
            London time
          </p>
          <p className="font-mono text-sm tracking-[0.2em] mt-6">{data.code}</p>
        </>
      )}
    </div>
  );
}
