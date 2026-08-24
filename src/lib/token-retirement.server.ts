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

  // Archive before deleting so any misclassification is recoverable.
  let archivedCount = 0;
  const { data: rows } = await admin
    .from("device_tokens")
    .select("token, platform, user_id, created_at, updated_at")
    .in("token", candidates);

  const found = (rows ?? []) as Array<{
    token: string;
    platform: string | null;
    user_id: string | null;
    created_at: string | null;
    updated_at: string | null;
  }>;

  if (found.length > 0) {
    const { error: archiveErr } = await admin.from("device_tokens_deleted").insert(
      found.map((r) => ({
        token: r.token,
        platform: r.platform,
        user_id: r.user_id,
        token_created_at: r.created_at,
        token_updated_at: r.updated_at,
        reason,
        broadcast_id: broadcastId ?? null,
      })),
    );
    if (archiveErr) {
      // Never delete when the archive write failed — recoverability first.
      console.error("[token-retirement] archive failed, skipping deletion", archiveErr);
      return {
        deletedCount: 0,
        archivedCount: 0,
        systemicSuspected,
        breakerTripped,
        dominantErrorCode: dominant,
        warning: `Archive write failed — no tokens deleted (${archiveErr.message ?? "unknown error"}).`,
      };
    }
    archivedCount = found.length;
  }

  const { error: delErr } = await admin.from("device_tokens").delete().in("token", candidates);
  if (delErr) {
    console.error("[token-retirement] delete failed", delErr);
    return {
      deletedCount: 0,
      archivedCount,
      systemicSuspected,
      breakerTripped,
      dominantErrorCode: dominant,
      warning: `Token delete failed: ${delErr.message ?? "unknown error"}`,
    };
  }

  return {
    deletedCount: candidates.length,
    archivedCount,
    systemicSuspected,
    breakerTripped,
    dominantErrorCode: dominant,
    warning,
  };
}
