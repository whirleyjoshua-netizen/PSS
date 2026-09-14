import "server-only";
import { calendarConfig } from "./config";

const GRAPH = "https://graph.microsoft.com/v1.0/";
const TIMEOUT_MS = 10_000;

export class GraphError extends Error {
  name = "GraphError";
  constructor(message: string, public status: number) {
    super(message);
  }
}

let cached: { token: string; expiresAt: number } | null = null;
export const resetGraphTokenForTests = () => { cached = null; };

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const config = calendarConfig();
  if (!config) throw new GraphError("Outlook is not configured", 0);
  const response = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new GraphError(`Microsoft sign-in failed (${response.status})`, response.status);
  const { access_token, expires_in } = (await response.json()) as { access_token: string; expires_in: number };
  // Refresh five minutes early so a token never expires mid-request.
  cached = { token: access_token, expiresAt: Date.now() + (expires_in - 300) * 1000 };
  return access_token;
}

/** One Graph request. Retries once on 429/503, honoring Retry-After. Callers check the status. */
export async function graphFetch(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  const url = path.startsWith("https://") ? path : GRAPH + path.replace(/^\/+/, "");
  const send = async () =>
    fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        Prefer: 'outlook.timezone="Pacific Standard Time"',
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  const first = await send();
  if (first.status !== 429 && first.status !== 503) return first;
  const wait = Math.min(Number(first.headers.get("Retry-After")) || 2, 10) * 1000;
  await new Promise((resolve) => setTimeout(resolve, wait));
  return send();
}

export async function graphJson<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await graphFetch(path, init);
  if (!response.ok) throw new GraphError(`Graph ${init?.method ?? "GET"} failed (${response.status})`, response.status);
  return (response.status === 204 ? undefined : await response.json()) as T;
}
