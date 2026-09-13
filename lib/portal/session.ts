import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import type { Job } from "@/lib/admin/jobs";
import { hashToken, newToken } from "@/lib/admin/tokens";
import { visibleJobs } from "./access";

/** Separate from the admin's pss_admin cookie, and only ever sent to /project. */
export const CUSTOMER_COOKIE = "pss_customer";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const COOKIE_PATH = "/project";

export async function createCustomerSession(email: string): Promise<void> {
  const sql = db();
  await sql`delete from customer_sessions where expires_at < now()`;

  const token = newToken();
  await sql`
    insert into customer_sessions (token_hash, email, expires_at)
    values (${hashToken(token)}, ${email}, now() + interval '30 days')`;

  (await cookies()).set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: SESSION_SECONDS,
  });
}

/**
 * The signed-in customer and the jobs they may see, or null. Re-checks the
 * session and visibleJobs on every request, so removing an email or marking
 * a job Lost takes effect at once. Cached per request.
 */
export const getCustomer = cache(async (): Promise<{ email: string; jobs: Job[] } | null> => {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;

  const rows = await db()`
    select email from customer_sessions
    where token_hash = ${hashToken(token)} and expires_at > now()`;
  const email = rows[0]?.email as string | undefined;
  if (!email) return null;

  const jobs = await visibleJobs(email);
  return jobs.length > 0 ? { email, jobs } : null;
});

/** The guard every customer page, action and route calls. */
export async function requireCustomer(): Promise<{ email: string; jobs: Job[] }> {
  const customer = await getCustomer();
  if (!customer) redirect("/project/sign-in");
  return customer;
}

export async function destroyCustomerSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(CUSTOMER_COOKIE)?.value;
  if (token) await db()`delete from customer_sessions where token_hash = ${hashToken(token)}`;
  store.delete({ name: CUSTOMER_COOKIE, path: COOKIE_PATH });
}
