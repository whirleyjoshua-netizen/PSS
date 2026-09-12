import { NextResponse, type NextRequest } from "next/server";

/**
 * A courtesy redirect for visitors with no session cookie at all. It checks
 * only that the cookie exists; requireAdmin() does the real verification on
 * every page and action.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("pss_admin")) {
    return NextResponse.redirect(new URL("/admin/sign-in", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/((?!sign-in(?:/|$)|auth(?:/|$)|jobs/[^/]+/files$).*)"],
};
