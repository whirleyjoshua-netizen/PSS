import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { conversionsCsvNow } from "@/lib/leads/conversions-feed";
import type { ConversionKind } from "@/lib/leads/conversions";

/**
 * The offline conversion file, fetched on a schedule by Google Ads Data Manager (an HTTPS source with a
 * username and password). /api/ads/conversions(.csv) serves every action; Data Manager ties each
 * connection to ONE action, so /api/ads/conversions/{consultation,booked,sale}.csv each serve one
 * (owner 2026-11-05).
 */
const MIN_LENGTH = 16;

/** Hashing first gives equal-length buffers, so the comparison leaks neither content nor length. */
const sameSecret = (given: string, expected: string) =>
  timingSafeEqual(
    createHash("sha256").update(given).digest(),
    createHash("sha256").update(expected).digest(),
  );

/** The user and password from a Basic Authorization header, or null when it isn't one. */
function basicCredentials(header: string | null): { user: string; password: string } | null {
  const match = header?.match(/^Basic ([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) return null;
  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon < 0) return null;
  return { user: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

/**
 * The GET handler for the feed: every action when `only` is absent, else that one action's rows.
 * Off (404) unless ADS_FEED_USER and ADS_FEED_PASSWORD are both at least 16 characters; then 401 without
 * the right Basic credentials. Nothing here logs the credentials or the Authorization header.
 */
export function conversionsFeedHandler(only?: ConversionKind) {
  return async function GET(request: Request): Promise<Response> {
    const user = process.env.ADS_FEED_USER ?? "";
    const password = process.env.ADS_FEED_PASSWORD ?? "";
    if (user.length < MIN_LENGTH || password.length < MIN_LENGTH) {
      return new Response(null, { status: 404 });
    }

    const given = basicCredentials(request.headers.get("authorization"));
    // Both comparisons always run, so a right user with a wrong password takes as long as neither.
    const userOk = sameSecret(given?.user ?? "", user);
    const passwordOk = sameSecret(given?.password ?? "", password);
    if (!given || !userOk || !passwordOk) {
      return new Response(null, { status: 401, headers: { "www-authenticate": 'Basic realm="pss-ads-feed"' } });
    }

    return new Response(await conversionsCsvNow(only), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex",
      },
    });
  };
}
