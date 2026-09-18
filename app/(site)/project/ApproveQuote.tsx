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
