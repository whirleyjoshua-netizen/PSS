import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import type { Job } from "@/lib/admin/jobs";
import { ensureReferralCode } from "@/lib/referrals/db";
import { referralUrl } from "@/lib/referrals/codes";
import { claimReview, listReviewCandidates, recordReviewSent, releaseReview } from "./db";
import { isDueForReview } from "./eligibility";

/** Plain text, like the other customer emails, so it reads the same on every phone. */
export function reviewEmailText(input: { firstName: string; reviewUrl: string; referralLink: string }): string {
  return [
    `Hi ${input.firstName},`,
    "",
    `Thank you for choosing ${business.name}. We hope you are enjoying your new window treatments.`,
    "",
    "If you have a minute, a Google review helps other Las Vegas families find a local installer they can trust:",
    input.reviewUrl,
    "",
    "Know someone who could use new window treatments? Share your personal link. When a friend books through it and their installation is done, we send you $100 as a thank-you:",
    input.referralLink,
    "",
    `Anything not quite right? Reply to this email or call ${business.phone.display} and we will make it right.`,
    "",
    business.name,
    business.domain,
  ].join("\n");
}

/** Sends one job's review request and records it. Throws on missing config or a rejected send. */
export async function sendReviewRequest(job: Job, actor: string): Promise<void> {
  const reviewUrl = process.env.GOOGLE_REVIEW_URL;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!reviewUrl) throw new Error("GOOGLE_REVIEW_URL is not set");
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!job.email) throw new Error("This job has no email address");

  const code = await ensureReferralCode(job.id);
  if (!code) throw new Error("That job no longer exists");

  const firstName = job.name.trim().split(/\s+/)[0];
  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`,
    to: job.email,
    replyTo: business.email,
    subject: `Thank you from ${business.name}, ${firstName}`,
    text: reviewEmailText({ firstName, reviewUrl, referralLink: referralUrl(code) }),
  });
  if (error) throw new Error(`Resend rejected the review request: ${error.message}`);

  await recordReviewSent(job.id, actor);
}

/** The daily cron run: emails every job that is due, one claim at a time. */
export async function runDailyReviewRequests(
  now: Date = new Date(),
): Promise<{ sent: number; failed: number; error?: string }> {
  if (!process.env.GOOGLE_REVIEW_URL) {
    console.error("Review requests skipped: GOOGLE_REVIEW_URL is not set");
    return { sent: 0, failed: 0, error: "GOOGLE_REVIEW_URL is not set" };
  }

  let sent = 0;
  let failed = 0;
  for (const job of await listReviewCandidates()) {
    if (!isDueForReview(job, now)) continue;
    if (!(await claimReview(job.id))) continue;
    try {
      await sendReviewRequest(job, "system");
      sent++;
    } catch (error) {
      console.error(`Review request failed for job ${job.id}`, error);
      await releaseReview(job.id);
      failed++;
    }
  }
  return { sent, failed };
}
