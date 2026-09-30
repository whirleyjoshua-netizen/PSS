import { createHash, timingSafeEqual } from "node:crypto";
import { conversionsCsvNow } from "@/lib/leads/conversions-feed";

/**
 * The offline conversion file, fetched on a schedule by Google Ads Data
 * Manager (an HTTPS source with a username and password). Same rows as the
 * owner's download at /admin/ad-conversions.
 *
 * Off unless ADS_FEED_USER and ADS_FEED_PASSWORD are both set to at least 16
 * characters: until then it answers 404, as if the route did not exist.
 * Nothing here logs the credentials or the Authorization header.
 */
export const dynamic = "force-dynamic";

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

export async function GET(request: Request) {
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

  return new Response(await conversionsCsvNow(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}
