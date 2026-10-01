import "server-only";
import { setStage } from "@/lib/admin/jobs";

/**
 * What an approval can answer. Every refusal is a plain outcome, never an exception: the
 * customer sees their page again either way.
 */
export type ApproveResult = "approved" | "not-found" | "wrong-status" | "no-quote";

/**
 * Records that a customer approved an uploaded quote, moving the job to Approved; the owners then send
 * the paperwork by hand. A Direct Connect quote is approved by approveDcQuote (lib/dc/approve.ts) instead.
 *
 * This function does NOT check ownership or the job's status — it trusts the caller, exactly
 * as sendMessage does. Every caller must first re-derive the customer's own jobs from the
 * session and refuse anything else, which is what approveQuoteAction does.
 *
 * `quoteName` is the name of a document actually shared with this customer, read server-side
 * by the caller — never a string the browser posted. It is written verbatim into the job's
 * timeline, so in six months the owners can read back which document was accepted. An empty
 * name means nothing was shared to approve: approving something the customer cannot read is
 * not consent, so it is refused here as well as in the action.
 *
 * The move is setStage's single statement, whose `status <> $to` guard means a double
 * submission moves nothing twice — the second one matches no row and returns false.
 */
export async function approveQuote(
  jobId: string,
  actor: string,
  quoteName: string,
): Promise<ApproveResult> {
  const name = quoteName.trim();
  if (!name) return "no-quote";

  // The customer's own address is the actor: this is their act, not an owner's.
  const moved = await setStage(jobId, "approved", actor, {
    body: `Approved "${name}" from their project page`,
  });
  // reason is Lost's alone and writes lost_reason; an approval never sets it.
  //
  // A declined move is never "not-found" here: the caller has already established that the job
  // is one of the customer's own, so the only thing setStage's `status <> $to` guard can be
  // saying is that the job was not in the status this transition starts from. Answering
  // "not-found" for a job that plainly exists would put a lie on the customer's page.
  return moved ? "approved" : "wrong-status";
}
