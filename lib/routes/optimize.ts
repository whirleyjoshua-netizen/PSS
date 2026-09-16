import "server-only";
import { routeAccessToken } from "./google-auth";
import type { OptimizeToursRequest } from "./optimize-request";
import type { OptimizeToursResponse } from "./optimize-response";

export class RoutePlanningUnavailable extends Error {}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/** The test-only optimizer override. It is honored only on this machine, so a stray env var can never send jobs elsewhere. */
const stub = () => {
  const url = process.env.ROUTE_OPTIMIZATION_URL;
  const token = process.env.ROUTE_OPTIMIZATION_TOKEN;
  if (!url || !token) return null;
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {}
  if (LOCAL_HOSTS.has(host)) return { url, token };
  console.error("Ignoring ROUTE_OPTIMIZATION_URL: only 127.0.0.1 or localhost is allowed", url);
  return null;
};

export const routePlanningConfigured = (): boolean =>
  Boolean(stub() || (process.env.GOOGLE_CLOUD_PROJECT_ID && process.env.GOOGLE_SERVICE_ACCOUNT_JSON));

export async function optimizeTours(body: OptimizeToursRequest): Promise<OptimizeToursResponse> {
  try {
    if (!routePlanningConfigured()) throw new Error("Route Optimization is not configured");
    const test = stub();
    const url = test?.url ??
      `https://routeoptimization.googleapis.com/v1/projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}:optimizeTours`;
    const token = test?.token ?? (await routeAccessToken());
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      // 15 s is also the solver's own timeout in the body. The extra second lets Google answer first.
      signal: AbortSignal.timeout(16_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Route Optimization ${response.status}: ${await response.text()}`);
    return (await response.json()) as OptimizeToursResponse;
  } catch (error) {
    console.error("Route planning failed", error);
    throw new RoutePlanningUnavailable(error instanceof Error ? error.message : String(error));
  }
}
