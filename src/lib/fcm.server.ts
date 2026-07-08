// Server-only helper for sending push notifications via Firebase Cloud Messaging HTTP v1 API.
// Reads FIREBASE_SERVICE_ACCOUNT_JSON (service account key) and FIREBASE_PROJECT_ID.

import { BROADCAST_TOPIC } from "./push-constants";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
export { BROADCAST_TOPIC };

function base64UrlEncode(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(sa: ServiceAccount, forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: FCM_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(claim),
  )}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    cache: "no-store",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`FCM token exchange failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  if (!json.access_token) throw new Error("FCM token exchange did not return an access token");
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

export interface SendResult {
  token: string;
  ok: boolean;
  error?: string;
}

export interface FcmSendOutcome {
  ok: boolean;
  error?: string;
}

function buildVisibleMessageTarget(
  target: { token: string } | { topic: string },
  payload: { title: string; body: string; url?: string; imageUrl?: string },
): Record<string, unknown> {
  const notification: Record<string, unknown> = { title: payload.title, body: payload.body };
  if (payload.imageUrl) notification.image = payload.imageUrl;

  const apsPayload: Record<string, unknown> = {
    alert: { title: payload.title, body: payload.body },
    badge: 1,
    sound: "default",
    "interruption-level": "active",
  };
  if (payload.imageUrl) apsPayload["mutable-content"] = 1;

  const apns: Record<string, unknown> = {
    headers: {
      "apns-priority": "10",
      "apns-push-type": "alert",
    },
    payload: { aps: apsPayload },
  };
  if (payload.imageUrl) {
    apns.fcm_options = { image: payload.imageUrl };
  }

  const message: Record<string, unknown> = {
    ...target,
    notification,
    apns,
  };

  // Android rich image is covered by notification.image above; also set android.notification.image
  // for older client SDKs that read it there.
  if (payload.imageUrl) {
    message.android = {
      notification: { image: payload.imageUrl },
    };
  }

  if (payload.url) message.data = { url: payload.url };
  return message;
}


function parseServiceAccount(rawJson: string): ServiceAccount {
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(rawJson) as ServiceAccount;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing client_email or private_key");
  }
  return sa;
}

async function sendFcmMessage(
  message: Record<string, unknown>,
  payloadProjectId?: string,
): Promise<FcmSendOutcome> {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = payloadProjectId ?? process.env.FIREBASE_PROJECT_ID;
  if (!rawJson) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is not set");

  const sa = parseServiceAccount(rawJson);
  const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  async function attempt(forceFreshToken = false): Promise<FcmSendOutcome> {
    const accessToken = await getAccessToken(sa, forceFreshToken);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      cache: "no-store",
      body: JSON.stringify({ message }),
    });
    if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `${res.status}: ${text.slice(0, 1200)}` };
    }
    return { ok: true };
  }

  let result = await attempt();
  if (result.error?.startsWith("401:")) {
    cachedToken = null;
    result = await attempt(true);
  }
  return result;
}

export async function sendFcmToTopic(
  topic: string,
  payload: { title: string; body: string; url?: string; imageUrl?: string },
): Promise<FcmSendOutcome> {
  const message = buildVisibleMessageTarget({ topic }, payload);
  return sendFcmMessage(message);
}

export async function sendFcmToTokens(
  tokens: string[],
  payload: { title: string; body: string; url?: string; imageUrl?: string },
): Promise<SendResult[]> {

  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!rawJson) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is not set");

  parseServiceAccount(rawJson);

  async function sendOne(token: string): Promise<SendResult> {
    const message = buildVisibleMessageTarget({ token }, payload);

    try {
      const result = await sendFcmMessage(message, projectId);
      return { token, ...result };
    } catch (e) {
      return { token, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const results: SendResult[] = [];
  for (const token of tokens) {
    const result = await sendOne(token);
    results.push(result);
  }
  return results;
}
