// Server-only helpers for the drop countdown card.
//
// These MUST live outside drop-countdown.functions.ts: the server-function
// splitter strips everything but the exported createServerFn declarations from
// that module, so module-scope helpers there vanish at runtime.

export type DropCountdown = {
  enabled: boolean;
  headline: string;
  showFrom: string;
  startsAt: string;
  hideAt: string;
  liveMessage: string;
};

export function toIso(value: unknown, field: string): string {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`drop_countdown_config.${field} is not a parseable timestamp`);
  }
  return date.toISOString();
}
