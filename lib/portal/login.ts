import "server-only";
import { after } from "next/server";
import { Resend } from "resend";
import { business } from "@/content/business";
import { db } from "@/lib/db";
import { hashToken, newToken } from "@/lib/admin/tokens";
import { normalizeEmail, visibleJobs } from "./access";

export const LINK_MINUTES = 15;
/** Invite links last a week: customers don't open email right away. */
export const INVITE_MINUTES = 7 * 24 * 60;
const LINKS_PER_HOUR = 5;

/** From configuration, never the request's Host header. No trailing slash. */
export const portalOrigin = (): string => (process.env.ADMIN_BASE_URL || business.domain).replace(/\/+$/, "");

/** Stores a new single-use token (its hash only) and returns the sign-in link for it. */
export async function issueCustomerLink(email: string, minutes: number): Promise<string> {
  const token = newToken();
  await db()`
    insert into customer_login_tokens (token_hash, email, expires_at)
    values (${hashToken(token)}, ${email}, now() + ${`${minutes} minutes`}::interval)`;
  return `${portalOrigin()}/project/auth?token=${token}`;
}

/**
 * Emails a sign-in link to a customer with a visible job. Returns at once,
 * having done nothing yet. The lookup, rate limit and email all run in
 * after(), so the response never reveals who is a customer.
 */
export async function requestCustomerSignIn(rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);

  after(async () => {
    try {
      if ((await visibleJobs(email)).length === 0) return;

      const sql = db();
      await sql`delete from customer_login_tokens where expires_at < now() - interval '1 day'`;
      const [{ count }] = await sql`
        select count(*)::int as count from customer_login_tokens
        where email = ${email} and created_at > now() - interval '1 hour'`;
      if (Number(count) >= LINKS_PER_HOUR) return;

      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        console.error("Customer sign-in email is not configured (missing RESEND_API_KEY).");
        return;
      }
      const link = await issueCustomerLink(email, LINK_MINUTES);
      const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";

      const { error } = await new Resend(apiKey).emails.send({
        from: `${business.name} <${from}>`,
        to: email,
        replyTo: business.email,
        subject: `Your ${business.name} sign-in link`,
        text: [
          "Sign in to see your project:",
          "",
          link,
          "",
          `This link works once and expires in ${LINK_MINUTES} minutes.`,
          "If you did not ask for it, ignore this email.",
        ].join("\n"),
      });
      if (error) console.error("Customer sign-in email failed", error);
    } catch (error) {
      console.error("Customer sign-in request failed", error);
    }
  });
}

/** Marks a token used and returns its email, or null if it cannot be used or no job is visible. */
export async function consumeCustomerSignIn(token: string): Promise<string | null> {
  const rows = await db()`
    update customer_login_tokens set used_at = now()
    where token_hash = ${hashToken(token)} and used_at is null and expires_at > now()
    returning email`;
  const email = rows[0]?.email as string | undefined;
  if (!email) return null;
  return (await visibleJobs(email)).length > 0 ? email : null;
}
