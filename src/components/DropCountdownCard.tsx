import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDropCountdown } from "@/lib/drop-countdown.functions";

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

export function DropCountdownCard() {
  const fetchConfig = useServerFn(getDropCountdown);
  const [now, setNow] = useState(() => Date.now());
  const { data, isLoading, error } = useQuery({
    queryKey: ["drop-countdown"],
    queryFn: () => fetchConfig(),
    retry: 1,
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Decorative only — never blank the page or show an error box.
  if (isLoading || error || !data || !data.enabled) return null;

  const showFromMs = new Date(data.showFrom).getTime();
  const startsMs = new Date(data.startsAt).getTime();
  const hideMs = new Date(data.hideAt).getTime();

  if (now < showFromMs) return null;
  if (now >= hideMs) return null;

  return (
    <div className="px-6 py-7 border-b border-border/60 text-center">
      <p className="font-serif text-3xl">{data.headline}</p>

      {now < startsMs ? (
        <>
          <Countdown target={startsMs} now={now} />
          <p className="text-sm mt-4">
            {londonDateTime(data.startsAt)}, London time
          </p>
        </>
      ) : (
        <p className="text-sm mt-4">{data.liveMessage}</p>
      )}
    </div>
  );
}
