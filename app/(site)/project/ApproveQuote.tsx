import { business } from "@/content/business";
import { stageRank, type PortalStage } from "@/lib/portal/progress";
import { approveQuoteFormAction } from "./actions";

/**
 * The one consequential thing a customer can do here: accept the price.
 *
 * Deliberately two steps. The <details> is closed until they open it, so the sentence about
 * what approving means is read before the button is reachable, and no stray tap can order
 * materials. Both halves are plain HTML — the reveal is the browser's, the submit is a form
 * post — so the whole thing works with JavaScript off.
 */
export function ApproveQuote({ jobId }: { jobId: string }) {
  return (
    <details className="w-full sm:w-auto">
      <summary className="inline-flex min-h-11 cursor-pointer items-center border border-charcoal px-5 py-3 font-display text-xs uppercase tracking-[0.2em] text-charcoal hover:bg-charcoal hover:text-ivory">
        Approve this quote
      </summary>
      <form
        action={approveQuoteFormAction}
        className="mt-3 flex max-w-sm flex-col gap-3 border border-rule bg-sand/50 p-4"
      >
        {/* Carries the job with JavaScript off; the action still re-derives ownership itself. */}
        <input type="hidden" name="jobId" value={jobId} />
        <p className="text-sm text-ink-soft">
          Approving tells us to go ahead and order. We will email you to arrange the details.
        </p>
        <button
          type="submit"
          className="min-h-11 bg-charcoal px-5 py-3 font-display text-xs uppercase tracking-[0.2em] text-ivory"
        >
          Yes, approve this quote
        </button>
      </form>
    </details>
  );
}

/**
 * What the customer is told when they land back here after tapping Approve.
 *
 * `approved` arrives on the query string, so it is the customer's browser talking, not ours —
 * exactly like `?requested=` in AfterWork, and believed no more readily. A crafted
 * /project/<id>?approved=1 would otherwise tell someone their quote was accepted and their
 * order placed when nothing had happened, which on the one page that commits the owners to
 * spending money is the worst thing this page could say. So the job's own status is the only
 * thing that can produce the confirmation: the flag merely decides whether to look.
 *
 * A refusal says what to do next rather than what went wrong. The reasons a real customer can
 * reach one — an owner un-shared the quote, or moved the job, between page load and tap — are
 * all things a phone call sorts out in a sentence, and none of them is the customer's fault.
 */
export function ApprovalNotice({
  approved,
  status,
}: {
  /** The `?approved=` flag, straight off the URL and unvalidated. Null on an ordinary visit. */
  approved?: string | null;
  /** The job's real status, re-derived server-side. The only thing believed here. */
  status: PortalStage;
}) {
  if (!approved) return null;

  const confirmed = approved === "1" && status === "sold";
  // A flag claiming an approval the job does not show says nothing at all. There is no true
  // thing to say about an approval that did not happen, and an error would be louder than a
  // mistyped link deserves.
  if (approved === "1" && !confirmed) return null;
  // And the refusal is re-derived just as the confirmation is. The job is at or past `sold`, so
  // the approval plainly did happen, whatever this flag says — a back button after a refused
  // attempt, a stale bookmark or a forwarded link would otherwise tell a customer their
  // approval failed on a job the owners have already ordered against. They would phone about
  // something the owners cannot see. Say nothing rather than something false.
  //
  // Ranked, not `=== "sold"`: an approved job does not stay at `sold`, it is ordered, installed
  // and completed, and the lie only gets worse as it moves on. stageRank is the one ordering
  // buildSteps already uses, so a new stage cannot reopen this by being left off a list here.
  // (`completed` arrives folded to `installed` by toPortalStage; both outrank `sold`.)
  if (!confirmed && stageRank(status) >= stageRank("sold")) return null;

  return (
    <p role="status" className="border border-champagne bg-sand/60 p-4 text-sm">
      {confirmed
        ? "Thank you — we have your approval and will be in touch to arrange the details."
        : `We could not record that approval just now. Please call us on ${business.phone.display} and we will sort it out.`}
    </p>
  );
}
