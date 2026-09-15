import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { db } from "@/lib/db";
import { JOB_COLUMNS, toJob, type Job } from "@/lib/admin/jobs";
import { normalizeEmail } from "./access";
import { INVITE_MINUTES, issueCustomerLink } from "./login";
import { PORTAL_STATUSES } from "./progress";

const bareDomain = business.domain.replace(/^https?:\/\//, "");

/** Plain text, like the other customer emails. */
export function inviteEmailText(input: { firstName: string; link: string }): string {
  return [
    input.firstName ? `Hi ${input.firstName},` : "Hi there,",
    "",
    "Thanks for having us out. You can follow your project, from quote to install, on your own page:",
    "",
    input.link,
    "",
    `This link works for 7 days. After that, sign in any time at ${bareDomain}/project with this email address.`,
    "",
    `Questions? Call us at ${business.phone.display} or just reply to this email.`,
    "",
    business.name,
  ].join("\n");
}

/** Sends one invite and records it. Throws on missing config, no email, or a rejected send. */
export async function sendPortalInvite(job: Job, actor: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const email = normalizeEmail(job.email);
  if (!email) throw new Error("This job has no email address");

  const link = await issueCustomerLink(email, INVITE_MINUTES);
  const firstName = job.name.trim().split(/\s+/)[0] || "";
  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`,
    to: email,
    replyTo: business.email,
    subject: `Your ${business.name} project page`,
    text: inviteEmailText({ firstName, link }),
  });
  if (error) throw new Error(`Resend rejected the portal invite: ${error.message}`);

  try {
    await db()`
      with stamped as (
        update leads set portal_invited_at = now(), updated_at = now()
        where id = ${job.id}
        returning id
      )
      insert into job_events (lead_id, actor, kind, body)
      select id, ${actor}, 'email', ${`Portal invite sent to ${email}`} from stamped`;
  } catch (recordError) {
    console.error(`Portal invite sent but not recorded for job ${job.id}`, recordError);
  }
}

/**
 * The automatic invite after a stage change. Claims the job first (only if
 * never invited, it has an email, it is in a portal stage, and it is flagged
 * for automatic invites — jobs already past the consultation at launch are
 * invited by hand instead), so two quick stage changes send one email. If
 * the send fails the claim is released so the owner's button can retry.
 * Never throws: it runs in after().
 */
export async function autoInvite(jobId: string): Promise<void> {
  try {
    const rows = await db().query(
      `update leads set portal_invited_at = now()
       where id = $1 and portal_invited_at is null
         and nullif(trim(email), '') is not null and status = any($2::text[])
         and portal_auto_invite
       returning ${JOB_COLUMNS}, portal_invited_at::text as claimed_at`,
      [jobId, [...PORTAL_STATUSES]],
    );
    if (!rows[0]) return;

    try {
      await sendPortalInvite(toJob(rows[0]), "system");
    } catch (error) {
      console.error(`Portal invite failed for job ${jobId}`, error);
      const claimedAt = rows[0].claimed_at as string;
      await db()`update leads set portal_invited_at = null where id = ${jobId} and portal_invited_at = ${claimedAt}::timestamptz`;
    }
  } catch (error) {
    console.error(`Portal invite could not run for job ${jobId}`, error);
  }
}
