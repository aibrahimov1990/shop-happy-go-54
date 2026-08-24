// Server-only helper: safely retire dead push tokens.
//
// Deleting device tokens is dangerous — a single malformed payload or a bundle
// ID mismatch can make FCM/APNs reject EVERY token in one send. Two guards:
//
//   1. Circuit breaker — if more than MASS_DELETION_THRESHOLD of the attempted
//      tokens failed permanently in one run, nothing is deleted; the run is
//      marked suspected-systemic and a human is warned instead.
//   2. Archive — retired rows are copied into `device_tokens_deleted` (kept 90
//      days) before removal, so a misclassification is reversible.

/** Share of attempted tokens that, if permanently failing, blocks all deletion. */
export const MASS_DELETION_THRESHOLD = 0.3;

type AdminClient = {
  rpc: (fn: string, args: Record<string, unknown>) => any;
};


export interface RetireTokensInput {
  /** Tokens classified as unambiguously permanent failures. */
  candidates: string[];
  /** Total tokens attempted in this run. */
  attempted: number;
  /** `${kind}:${code}` -> count, for reporting the dominant error. */
  errorCounts: Record<string, number>;
  /** Number of "suspect" failures in this run (never deletable). */
  suspectCount?: number;
  reason: string;
  broadcastId?: string | null;
  /** Explicit one-time override: bypass the circuit breaker for this run. */
  force?: boolean;
}

export interface RetireTokensResult {
  deletedCount: number;
  archivedCount: number;
  systemicSuspected: boolean;
  breakerTripped: boolean;
  dominantErrorCode: string | null;
  warning: string | null;
}

function dominantCode(errorCounts: Record<string, number>): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const [k, n] of Object.entries(errorCounts)) {
    if (n > bestN) {
      bestN = n;
      best = k.includes(":") ? k.slice(k.indexOf(":") + 1) : k;
    }
  }
  return best;
}

export async function retireDeadTokens(
  admin: AdminClient,
  input: RetireTokensInput,
): Promise<RetireTokensResult> {
  const { candidates, attempted, errorCounts, suspectCount = 0, reason, broadcastId, force } = input;
  const dominant = dominantCode(errorCounts);

  const permanentShare = attempted > 0 ? candidates.length / attempted : 0;
  const suspectShare = attempted > 0 ? suspectCount / attempted : 0;
  const systemicSuspected =
    permanentShare > MASS_DELETION_THRESHOLD || suspectShare > MASS_DELETION_THRESHOLD;

  const breakerTripped = permanentShare > MASS_DELETION_THRESHOLD && !force;

  let warning: string | null = null;
  if (systemicSuspected) {
    const failed = Math.max(candidates.length, suspectCount);
    warning =
      `${failed} of ${attempted} sends failed with ${dominant ?? "an unknown error"} — ` +
      `this looks like a configuration problem, not dead devices. ` +
      (breakerTripped
        ? "No tokens were deleted."
        : force
          ? "Deletion was force-approved for this run."
          : "No tokens were eligible for deletion.");
  }

  if (breakerTripped || candidates.length === 0) {
    if (warning) console.error("[token-retirement] systemic failure suspected", { warning, errorCounts });
    return {
      deletedCount: 0,
      archivedCount: 0,
      systemicSuspected,
      breakerTripped,
      dominantErrorCode: dominant,
      warning,
    };
  }

  // Archive + delete in a single Postgres transaction. RPC args travel in the
  // POST body, so there is no URL-length limit, and the counts are computed
  // server-side, so there is no 1,000-row Data API cap.
  const { data, error: rpcErr } = await admin.rpc("retire_device_tokens", {
    p_tokens: candidates,
    p_reason: reason,
    p_broadcast_id: broadcastId ?? null,
  });

  if (rpcErr) {
    console.error("[token-retirement] retire_device_tokens failed", rpcErr);
    return {
      deletedCount: 0,
      archivedCount: 0,
      systemicSuspected,
      breakerTripped,
      dominantErrorCode: dominant,
      warning:
        `Token retirement failed: ${rpcErr.message ?? "unknown error"}. ` +
        `The operation is transactional, so nothing was archived and nothing was deleted.`,
    };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { archived_count?: number | null; deleted_count?: number | null }
    | null
    | undefined;

  return {
    deletedCount: row?.deleted_count ?? 0,
    archivedCount: row?.archived_count ?? 0,
    systemicSuspected,
    breakerTripped,
    dominantErrorCode: dominant,
    warning,
  };
}

