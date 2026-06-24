// Server-only helper for sending push notifications via Firebase Cloud Messaging HTTP v1 API.
// Reads FIREBASE_SERVICE_ACCOUNT_JSON (service account key) and FIREBASE_PROJECT_ID.

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

function base64UrlEncode(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
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
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`FCM token exchange failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
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

export async function sendFcmToTokens(
  tokens: string[],
  payload: { title: string; body: string; url?: string },
): Promise<SendResult[]> {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!rawJson) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is not set");

  let sa: ServiceAccount;
  try {
    sa = JSON.parse(rawJson) as ServiceAccount;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }

  const accessToken = await getAccessToken(sa);
  const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  return Promise.all(
    tokens.map(async (token): Promise<SendResult> => {
      const message: Record<string, unknown> = {
        token,
        notification: { title: payload.title, body: payload.body },
      };
      if (payload.url) message.data = { url: payload.url };
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message }),
        });
        if (!res.ok) {
          const text = await res.text();
          return { token, ok: false, error: `${res.status}: ${text.slice(0, 200)}` };
        }
        return { token, ok: true };
      } catch (e) {
        return { token, ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
}
