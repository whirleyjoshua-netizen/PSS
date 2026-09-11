import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isAllowed } from "./allowlist";
import { hashToken, newToken } from "./tokens";

export const SESSION_COOKIE = "pss_admin";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

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
    maxAge: SESSION_SECONDS,
  });
}

/**
 * The signed-in owner, or null. Checks the database and the allowlist on every
 * request, so deleting a session row or an address takes effect immediately.
 * Cached per request, so a page and its actions share one lookup.
 */
export const getAdmin = cache(async (): Promise<{ email: string } | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db()`
    select email from admin_sessions
    where token_hash = ${hashToken(token)} and expires_at > now()`;
  const email = rows[0]?.email as string | undefined;
  return email && isAllowed(email) ? { email } : null;
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
