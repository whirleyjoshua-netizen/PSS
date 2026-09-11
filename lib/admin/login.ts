import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { db } from "@/lib/db";
import { isAllowed } from "./allowlist";
import { hashToken, newToken } from "./tokens";

const LINK_MINUTES = 15;
const LINKS_PER_HOUR = 5;

/**
 * Emails a one-time sign-in link to an allowlisted owner.
 *
 * Returns ok for strangers and for rate-limited owners too, so the form never
 * reveals who has access or how many links were sent.
 */
export async function requestSignIn(
  rawEmail: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = rawEmail.trim().toLowerCase();
  if (!isAllowed(email)) return { ok: true };

  const sql = db();
  await sql`delete from admin_login_tokens where expires_at < now() - interval '1 day'`;

  const [{ count }] = await sql`
    select count(*)::int as count from admin_login_tokens
    where email = ${email} and created_at > now() - interval '1 hour'`;
  if (Number(count) >= LINKS_PER_HOUR) return { ok: true };

  const token = newToken();
  await sql`
    insert into admin_login_tokens (token_hash, email, expires_at)
    values (${hashToken(token)}, ${email}, now() + ${`${LINK_MINUTES} minutes`}::interval)`;

  // The origin comes from configuration, never from the request's Host header.
  const origin = process.env.ADMIN_BASE_URL ?? business.domain;
  const link = `${origin}/admin/auth?token=${token}`;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!apiKey) return { ok: false, error: "Sign-in email is not configured." };

  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`,
    to: email,
    subject: "Your PSS sign-in link",
    text: [
      "Sign in to the PSS job tracker:",
      "",
      link,
      "",
      `This link works once and expires in ${LINK_MINUTES} minutes.`,
      "If you did not ask for it, ignore this email.",
    ].join("\n"),
  });

  if (error) {
    console.error("Sign-in email failed", error);
    return { ok: false, error: "We could not send the email. Try again in a minute." };
  }
  return { ok: true };
}

/** Marks a sign-in token used and returns its email, or null if it cannot be used. */
export async function consumeSignIn(token: string): Promise<string | null> {
  const rows = await db()`
    update admin_login_tokens set used_at = now()
    where token_hash = ${hashToken(token)} and used_at is null and expires_at > now()
    returning email`;
  const email = rows[0]?.email as string | undefined;
  return email && isAllowed(email) ? email : null;
}
