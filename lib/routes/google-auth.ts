import "server-only";
import { GoogleAuth } from "google-auth-library";

let auth: GoogleAuth | null = null;

/** An OAuth token for Route Optimization. GoogleAuth signs the JWT and caches/refreshes the token. */
export async function routeAccessToken(): Promise<string> {
  if (!auth) {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "");
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
    }
    auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  }
  const token = await auth.getAccessToken();
  if (!token) throw new Error("Google returned no access token");
  return token;
}

/** Drops the cached client so each test builds GoogleAuth from its own env. */
export const resetRouteAuthForTests = (): void => {
  auth = null;
};
