import "server-only";
import { randomInt } from "node:crypto";
import { after } from "next/server";
import { Resend } from "resend";
import { business } from "@/content/business";
import { db } from "@/lib/db";
import { isAllowed } from "./allowlist";
import { hashToken, newToken } from "./tokens";

const LINK_MINUTES = 15;
const LINKS_PER_HOUR = 5;
const CODE_TRIES = 5;
/**
 * Wrong codes allowed per address per day, across all its sign-ins. Past it, no code works until
 * the day passes; the link and Face ID still do. With the 5-emails-an-hour limit alone, a guesser
 * could try 25 codes an hour all day.
 */
export const DAILY_WRONG_CODES = 15;

/** Six digits, leading zeros allowed. */
export const newSignInCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** The code is only ever stored hashed, bound to its address. */
export const codeHash = (email: string, code: string): string => hashToken(`${email}:${code}`);

/**
 * Emails a one-time sign-in link, and a 6-digit code on the same row, to an allowlisted owner.
 *
 * Always returns immediately, having done nothing yet. All work — the
 * allowlist check, rate limiting, and the email itself — happens later in
 * `after()`, so the response time and shape never reveal who has access.
 * Every error inside is caught and logged; none of it can reach the caller.
 */
export async function requestSignIn(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();

  after(async () => {
    try {
      if (!(await isAllowed(email))) return;

      const sql = db();
      await sql`delete from admin_login_tokens where expires_at < now() - interval '1 day'`;

      const [{ count }] = await sql`
        select count(*)::int as count from admin_login_tokens
        where email = ${email} and created_at > now() - interval '1 hour'`;
      if (Number(count) >= LINKS_PER_HOUR) return;

      const token = newToken();
      const code = newSignInCode();
      await sql`
        insert into admin_login_tokens (token_hash, email, expires_at, code_hash)
        values (${hashToken(token)}, ${email}, now() + ${`${LINK_MINUTES} minutes`}::interval, ${codeHash(email, code)})`;

      // The origin comes from configuration, never from the request's Host header.
      // A blank ADMIN_BASE_URL falls back to the business domain, and any
      // trailing slash is stripped so the link never gets a doubled one.
      const origin = (process.env.ADMIN_BASE_URL || business.domain).replace(/\/+$/, "");
      const link = `${origin}/admin/auth?token=${token}`;

      const apiKey = process.env.RESEND_API_KEY;
      const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
      if (!apiKey) {
        console.error("Sign-in email is not configured (missing RESEND_API_KEY).");
        return;
      }

      const { error } = await new Resend(apiKey).emails.send({
        from: `${business.name} <${from}>`,
        to: email,
        subject: `Your PSS sign-in code: ${code}`,
        text: [
          `Your sign-in code is ${code}`,
          "",
          "Type it into PSS Ops, or open this link to sign in on this device:",
          "",
          link,
          "",
          `The code and the link work once and expire in ${LINK_MINUTES} minutes.`,
          "If you did not ask for this, ignore this email.",
        ].join("\n"),
      });

      if (error) {
        console.error("Sign-in email failed", error);
      }
    } catch (error) {
      console.error("Sign-in request failed", error);
    }
  });
}

/** Marks a sign-in token used and returns its email, or null if it cannot be used. */
export async function consumeSignIn(token: string): Promise<string | null> {
  const rows = await db()`
    update admin_login_tokens set used_at = now()
    where token_hash = ${hashToken(token)} and used_at is null and expires_at > now()
    returning email`;
  const email = rows[0]?.email as string | undefined;
  return email && (await isAllowed(email)) ? email : null;
}

/**
 * Signs in with the emailed code. One statement: picks the newest unused, unexpired sign-in for the
 * address, uses it if the code matches, otherwise counts a wrong try. After CODE_TRIES wrong tries
 * that sign-in no longer accepts a code. The attempts guard sits in the two updates, not in the
 * pick, so a locked newest sign-in stays the target and an older one never takes over; it also
 * keeps the counter at most CODE_TRIES. `for update` serializes two guesses at the same row.
 * The pick also requires fewer than DAILY_WRONG_CODES wrong codes for the address in the last day.
 */
export async function consumeSignInCode(rawEmail: string, rawCode: string): Promise<string | null> {
  const email = rawEmail.trim().toLowerCase();
  const code = rawCode.replace(/\s+/g, "");
  if (!email || !/^\d{6}$/.test(code)) return null;
  const hash = codeHash(email, code);
  const rows = await db()`
    with target as (
      select token_hash from admin_login_tokens
      where email = ${email} and used_at is null and expires_at > now()
        and code_hash is not null
        and (select coalesce(sum(code_attempts), 0) from admin_login_tokens where email = ${email} and created_at > now() - interval '1 day') < ${DAILY_WRONG_CODES}
      order by created_at desc limit 1
      for update
    ), used as (
      update admin_login_tokens set used_at = now()
      where token_hash = (select token_hash from target) and code_hash = ${hash}
        and code_attempts < ${CODE_TRIES}::int
      returning email
    ), missed as (
      update admin_login_tokens set code_attempts = code_attempts + 1
      where token_hash = (select token_hash from target) and code_hash <> ${hash}
        and code_attempts < ${CODE_TRIES}::int
    )
    select email from used`;
  const found = rows[0]?.email as string | undefined;
  return found && (await isAllowed(found)) ? found : null;
}
