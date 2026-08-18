import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrCreateLaunchCredit } from "@/lib/launch-credit.functions";

function londonDateTime(iso: string) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(date)
    .replace(",", "");
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${day} at ${time}`;
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
    <div className="mt-4 flex items-start justify-center">
      {units.map((unit, i) => (
        <div
          key={unit.label}
          className={
            "px-4 text-center" + (i > 0 ? " border-l border-border/60" : "")
          }
        >
          <p className="font-serif text-2xl leading-none tabular-nums">
            {unit.value}
          </p>
          <p className="mt-1.5 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {unit.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function CopyableCode({ code, muted }: { code: string; muted?: boolean }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = code;
        el.setAttribute("readonly", "");
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        setCopied(true);
      } catch {
        /* clipboard unavailable — the code remains selectable by hand */
      }
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy code ${code}`}
      className={
        "mt-4 mx-auto block cursor-pointer select-text font-mono text-sm tracking-[0.2em] [-webkit-user-select:text] " +
        (muted ? "text-muted-foreground/70" : "")
      }
    >
      {copied ? (
        <span className="text-muted-foreground">Copied</span>
      ) : (
        code
      )}
    </button>
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
      <div className="px-6 py-5 border-b border-border/60 text-center">
        <p className="font-serif text-2xl text-muted-foreground mb-2">
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
      <div className="px-6 py-5 border-b border-border/60 text-center">
        <p className="font-serif text-2xl text-muted-foreground mb-2">
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
    <div className="px-6 py-7 border-b border-border/60 text-center">
      <p className="font-serif text-2xl text-muted-foreground">
        Launch credit
      </p>

      {phase === "expired" ? (
        <>
          <p className="font-serif text-2xl mt-3 text-muted-foreground">
            £{Math.round(data.amount)} credit
          </p>
          <CopyableCode code={data.code} muted />
          <p className="text-sm text-muted-foreground mt-4">
            Expired {londonDateTime(data.endsAt)}, London time
          </p>
        </>
      ) : phase === "used" ? (
        <>
          <p className="font-serif text-2xl mt-3">£{Math.round(data.amount)} credit</p>
          <CopyableCode code={data.code} />
          <p className="text-sm text-muted-foreground mt-4">
            Already used on an order.
          </p>
        </>
      ) : phase === "before" ? (
        <>
          <p className="font-serif text-2xl mt-3">£{Math.round(data.amount)} credit</p>
          <Countdown target={startsMs} now={now} />
          <CopyableCode code={data.code} muted />
          <p className="text-sm mt-4">
            Live from {londonDateTime(data.startsAt)}, London time
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">
            The code cannot be applied at checkout before then.
          </p>
        </>
      ) : (
        <>
          <p className="font-serif text-2xl mt-3">£{Math.round(data.amount)} credit</p>
          <Countdown target={endsMs} now={now} />
          <CopyableCode code={data.code} />
          <p className="text-sm mt-4">Live now — apply at checkout.</p>
          <p className="text-xs text-muted-foreground mt-1.5">
            Closes {londonDateTime(data.endsAt)}, London time
          </p>
        </>
      )}
    </div>
  );
}
