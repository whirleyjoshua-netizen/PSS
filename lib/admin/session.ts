import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isAllowed } from "./allowlist";
import { hashToken, newToken } from "./tokens";

export const SESSION_COOKIE = "pss_admin";
/** The cookie outlives any session; the database decides when a session ends. */
const COOKIE_SECONDS = 60 * 60 * 24 * 400;

export async function createSession(email: string): Promise<void> {
  const sql = db();
  await sql`delete from admin_sessions where expires_at < now()`;

  const token = newToken();
  await sql`
    insert into admin_sessions (token_hash, email, expires_at)
    values (${hashToken(token)}, ${email}, now() + interval '30 days')`;

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_SECONDS,
  });
}

/**
 * The email for a live session, or null. A session lasts 30 days since last
 * use: one statement reads it and, when under 29 days are left, pushes
 * expires_at to now + 30 days, so each session is written at most once a day.
 * The select sees the row as it was before the update, which is fine here.
 */
export async function touchSession(tokenHash: string): Promise<string | null> {
  const rows = await db()`
    with s as (
      select email from admin_sessions where token_hash = ${tokenHash} and expires_at > now()
    ), bumped as (
      update admin_sessions set expires_at = now() + interval '30 days'
      where token_hash = ${tokenHash} and expires_at > now() and expires_at < now() + interval '29 days'
    )
    select email from s`;
  return (rows[0]?.email as string | undefined) ?? null;
}

/**
 * The signed-in owner, or null. Checks the database and the allowlist on every
 * request, so deleting a session row or an address takes effect immediately.
 * Each check also keeps the session alive for 30 days since last use (see
 * touchSession). Cached per request, so a page and its actions share one lookup.
 */
export const getAdmin = cache(async (): Promise<{ email: string } | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const email = await touchSession(hashToken(token));
  return email && (await isAllowed(email)) ? { email } : null;
});

/** The only guard admin pages and actions rely on. proxy.ts is a courtesy. */
export async function requireAdmin(): Promise<{ email: string }> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/sign-in");
  return admin;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db()`delete from admin_sessions where token_hash = ${hashToken(token)}`;
  store.delete(SESSION_COOKIE);
}
