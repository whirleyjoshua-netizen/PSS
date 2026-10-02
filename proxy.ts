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
 */
export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token === undefined) {
    return NextResponse.redirect(new URL("/admin/sign-in", request.url));
  }
  const response = NextResponse.next();
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}

export const config = {
  matcher: ["/admin", "/admin/((?!sign-in(?:/|$)|auth(?:/|$)|jobs/[^/]+/files$).*)"],
};
