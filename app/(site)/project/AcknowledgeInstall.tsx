import { business } from "@/content/business";
import type { Stage } from "@/lib/admin/stages";
import { serviceFromAcknowledgementHref } from "@/lib/portal/acknowledgement";
import { acknowledgeInstallFormAction } from "./actions";

/**
 * The question we owe a customer once their treatments are up: is this actually right?
 *
 * Two clearly different answers, never one button with a tick (spec §5). A tick invites the
 * happy answer by being the only one there, and the whole point of asking is to hear the
 * unhappy one — a customer who is quietly disappointed is the customer the owners most need
 * to find, and they will not go looking for a "request a service" link to say so.
 *
 * Neither half needs script. "Yes" is a plain form post; "Something is not right" is a plain
 * link to the service form the customer already has, carrying only a marker that says which
 * route they came through. The marker selects a server action and nothing else — it can never
 * choose a status, and the action re-derives ownership and the status regardless.
 */
export function AcknowledgeInstall({ jobId }: { jobId: string }) {
  return (
    <div className="flex w-full flex-col gap-3 sm:w-auto">
      <p className="font-display text-xs uppercase tracking-[0.2em] text-charcoal">
        Is everything how you wanted it?
      </p>
      <div className="flex flex-wrap items-start gap-3">
        <form action={acknowledgeInstallFormAction}>
          {/* Carries the job with JavaScript off; the action still re-derives ownership itself. */}
          <input type="hidden" name="jobId" value={jobId} />
          <button
            type="submit"
            className="min-h-11 bg-charcoal px-5 py-3 font-display text-xs uppercase tracking-[0.2em] text-ivory"
          >
            Yes, everything looks great
          </button>
        </form>
        <a
          href={serviceFromAcknowledgementHref(jobId)}
          className="inline-flex min-h-11 items-center border border-charcoal px-5 py-3 font-display text-xs uppercase tracking-[0.2em] text-charcoal hover:bg-charcoal hover:text-ivory"
        >
          Something is not right
        </a>
      </div>
    </div>
  );
}

/**
 * What the customer is told when they land back here after confirming.
 *
 * `acknowledged` arrives on the query string, so it is the customer's browser talking, not
 * ours — exactly like `?approved=` and `?requested=` on this page, and believed no more
 * readily. A crafted /project/<id>?acknowledged=1 would otherwise thank a customer whose
 * installation is still open for a confirmation they never gave, and a customer who believes
 * we have heard from them stops telling us. The job's own status is the only thing that can
 * produce the confirmation; the flag merely decides whether to look.
 *
 * `status` is the job's RAW stage, not its portal stage. toPortalStage folds `completed` into
 * `installed` so the customer never reads the word Completed, which means the folded value
 * cannot tell a confirmed installation from an unconfirmed one — the only distinction this
 * sentence turns on.
 */
export function AcknowledgeNotice({
  acknowledged,
  status,
}: {
  /** The `?acknowledged=` flag, straight off the URL and unvalidated. Null on an ordinary visit. */
  acknowledged?: string | null;
  /** The job's real, unfolded status, re-derived server-side. The only thing believed here. */
  status: Stage;
}) {
  if (!acknowledged) return null;

  const confirmed = acknowledged === "1" && status === "completed";
  // A flag claiming a confirmation the job does not show says nothing at all. There is no true
  // thing to say about it, and an error would be louder than a mistyped link deserves.
  if (acknowledged === "1" && !confirmed) return null;

  return (
    <p role="status" className="border border-champagne bg-sand/60 p-4 text-sm">
      {confirmed
        ? "Thank you for letting us know — we are glad it is right. Call us any time if anything needs adjusting."
        : `We could not record that just now. Please call us on ${business.phone.display} and we will sort it out.`}
    </p>
  );
}
