/**
 * The session cookie's name and attributes, shared by createSession and proxy.ts. No server-only
 * imports, so the proxy can use it.
 */
export const SESSION_COOKIE = "pss_admin";

/** The cookie outlives any session; the database decides when a session ends. */
const COOKIE_SECONDS = 60 * 60 * 24 * 400;

/** Read at call time, so Secure follows the environment the request runs in. */
export const sessionCookieOptions = () =>
  ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_SECONDS,
  }) as const;
