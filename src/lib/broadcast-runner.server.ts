/**
 * Shared broadcast fan-out. Reads an existing `broadcasts` row, performs the
 * topic send followed by the per-token fan-out, classifies failures, retires
 * dead tokens behind the circuit breaker, and writes the results back onto the
 * row. Used by both the immediate send (`sendBroadcast`) and the scheduled
 * runner cron hook, so behaviour is identical in both paths.
 */
export async function runBroadcast(broadcastId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row, error: rowErr } = await supabaseAdmin
    .from("broadcasts")
    .select("id, title, body, url, image_path, image_url")
    .eq("id", broadcastId)
    .single();
  if (rowErr) throw new Error(rowErr.message);
  if (!row) throw new Error("Broadcast not found");

  const { fetchAllDeviceTokens } = await import("./device-tokens.server");
  const { rows: tokenRows, pageCount: tokenPageCount } = await fetchAllDeviceTokens(
    supabaseAdmin as never,
  );

  const rows = tokenRows;
  const seen = new Set<string>();
  const audience: Array<{ token: string; user_id: string | null }> = [];
  for (const r of rows) {
    if (seen.has(r.token)) continue;
    seen.add(r.token);
    audience.push({ token: r.token, user_id: r.user_id ?? null });
  }
  const tokens = audience.map((a) => a.token);
  const ownerByToken = new Map(audience.map((a) => [a.token, a.user_id]));
  const signedInAudience = audience.filter((a) => a.user_id !== null).length;
  const anonymousAudience = audience.length - signedInAudience;

  let successCount = 0;
  let failureCount = 0;
  let permanentFailureCount = 0;
  let transientFailureCount = 0;
  let suspectFailureCount = 0;
  let signedInDelivered = 0;
  let anonymousDelivered = 0;
  let topicSubmitted = false;
  let topicError: string | undefined;
  const invalidTokens: string[] = [];
  const errorSamples: string[] = [];
  const errorCounts: Record<string, number> = {};
  let apnsCredentialIssue = false;

  // Resolve the image URL: either a direct https URL (Shopify CDN etc.)
  // or a signed URL for an uploaded image in the private bucket.
  let imageUrl: string | undefined = row.image_url ?? undefined;
  if (!imageUrl && row.image_path) {
    const { data: signed, error: signErr } = await supabaseAdmin
      .storage
      .from("broadcast-images")
      .createSignedUrl(row.image_path, 60 * 60 * 24 * 30); // 30 days
    if (signErr) throw new Error(`Image URL sign failed: ${signErr.message}`);
    imageUrl = signed?.signedUrl;
  }

  // Record the audience size before sending, so a throw, timeout or request
  // termination during the fan-out always leaves evidence behind.
  await supabaseAdmin
    .from("broadcasts")
    .update({ total_tokens: tokens.length })
    .eq("id", broadcastId);

  let retirement: {
    deletedCount: number;
    archivedCount: number;
    systemicSuspected: boolean;
    breakerTripped: boolean;
    dominantErrorCode: string | null;
    warning: string | null;
  } = {
    deletedCount: 0,
    archivedCount: 0,
    systemicSuspected: false,
    breakerTripped: false,
    dominantErrorCode: null,
    warning: null,
  };

  try {
    const { BROADCAST_TOPIC, sendFcmToTokens, sendFcmToTopic } = await import("./fcm.server");
    const payload = {
      title: row.title,
      body: row.body,
      url: row.url ?? undefined,
      imageUrl,
    };

    const topicResult = await sendFcmToTopic(BROADCAST_TOPIC, payload);
    topicSubmitted = topicResult.ok;
    topicError = topicResult.error;

    if (!topicSubmitted) {
      console.error("[broadcast] FCM topic send failed", {
        topic: BROADCAST_TOPIC,
        error: topicError,
      });
    }

    // Always fan-out to saved tokens as well. Topic delivery only reaches
    // devices that have successfully subscribed to the topic; per-token sends
    // guarantee every registered device gets the push.
    if (tokens.length > 0) {
      const results = await sendFcmToTokens(tokens, payload);
      for (const r of results) {
        if (r.ok) {
          successCount++;
          if (ownerByToken.get(r.token)) signedInDelivered++;
          else anonymousDelivered++;
          continue;
        }

        failureCount++;
        const err = r.error ?? "unknown";
        const kind = r.kind ?? "transient";
        const key = `${kind}:${r.code ?? "OTHER"}`;
        errorCounts[key] = (errorCounts[key] ?? 0) + 1;
        if (errorSamples.length < 3) errorSamples.push(err.slice(0, 1200));
        if (/THIRD_PARTY_AUTH_ERROR|InvalidProviderToken|ApnsError/i.test(err)) {
          apnsCredentialIssue = true;
        }

        if (kind === "permanent") {
          permanentFailureCount++;
          invalidTokens.push(r.token);
        } else if (kind === "suspect") {
          suspectFailureCount++;
        } else {
          transientFailureCount++;
        }
      }
    }

    if (failureCount > 0) {
      console.error("[broadcast] FCM failures", {
        totalTokens: tokens.length,
        successCount,
        failureCount,
        permanentFailureCount,
        transientFailureCount,
        suspectFailureCount,
        apnsCredentialIssue,
        errorCounts,
        errorSamples,
      });
    }

    const { retireDeadTokens } = await import("./token-retirement.server");
    retirement = await retireDeadTokens(supabaseAdmin as never, {
      candidates: invalidTokens,
      attempted: tokens.length,
      errorCounts,
      suspectCount: suspectFailureCount,
      reason: "broadcast_permanent_failure",
      broadcastId,
    });

    await supabaseAdmin
      .from("broadcasts")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        success_count: successCount,
        failure_count: failureCount,
        permanent_failure_count: permanentFailureCount,
        transient_failure_count: transientFailureCount,
        suspect_failure_count: suspectFailureCount,
        signed_in_recipients: signedInDelivered,
        anonymous_recipients: anonymousDelivered,
        error_breakdown: errorCounts,
        pruned_token_count: retirement.deletedCount,
        systemic_suspected: retirement.systemicSuspected,
        dominant_error_code: retirement.dominantErrorCode,
        topic_submitted: topicSubmitted,
        topic_error: topicError ?? null,
        token_page_count: tokenPageCount,
      })
      .eq("id", broadcastId);
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : String(sendError);
    console.error("[broadcast] send failed", { broadcastId, error: message });
    await supabaseAdmin
      .from("broadcasts")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        success_count: successCount,
        failure_count: failureCount,
        permanent_failure_count: permanentFailureCount,
        transient_failure_count: transientFailureCount,
        suspect_failure_count: suspectFailureCount,
        signed_in_recipients: signedInDelivered,
        anonymous_recipients: anonymousDelivered,
        error_breakdown: { ...errorCounts, fatal: message.slice(0, 1200) },
        topic_submitted: topicSubmitted,
        topic_error: topicError ?? null,
        token_page_count: tokenPageCount,
      })
      .eq("id", broadcastId);
    throw sendError;
  }

  return {
    broadcastId,
    totalTokens: tokens.length,
    registeredTokenCount: tokens.length,
    tokenPageCount,
    signedInAudience,
    anonymousAudience,
    signedInDelivered,
    anonymousDelivered,
    successCount,
    failureCount,
    permanentFailureCount,
    transientFailureCount,
    suspectFailureCount,
    prunedTokens: retirement.deletedCount,
    archivedTokens: retirement.archivedCount,
    systemicSuspected: retirement.systemicSuspected,
    breakerTripped: retirement.breakerTripped,
    dominantErrorCode: retirement.dominantErrorCode,
    systemicWarning: retirement.warning,
    errorCounts,
    errorSamples,
    apnsCredentialIssue,
    topicSubmitted,
    topicError,
  };
}
