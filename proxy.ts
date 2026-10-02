import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/admin/session-cookie";

/**
 * A courtesy redirect for visitors with no session cookie at all. It checks
 * only that the cookie exists; requireAdmin() does the real verification on
 * every page and action.
 *
 * With a cookie, it sets the same cookie again with createSession's attributes, so its 400 days
 * start over on every visit: cookies from before the 400-day change, and long-lived ones, keep
 * sliding while the database decides when the session ends.
 *
 * Only on a page load (GET or HEAD with no `next-action` header). A server action such as signOut
 * is a POST to an /admin path; setting the cookie there could race the action's own delete when
 * the Set-Cookie headers are merged.
 */
export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token === undefined) {
    return NextResponse.redirect(new URL("/admin/sign-in", request.url));
  }
  const response = NextResponse.next();
  const pageLoad = (request.method === "GET" || request.method === "HEAD") && !request.headers.has("next-action");
  if (pageLoad) response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}

export const config = {
  matcher: ["/admin", "/admin/((?!sign-in(?:/|$)|auth(?:/|$)|jobs/[^/]+/files$).*)"],
};
