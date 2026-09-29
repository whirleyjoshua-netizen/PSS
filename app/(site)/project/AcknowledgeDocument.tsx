import { business } from "@/content/business";
import { formatShortDate } from "@/lib/admin/time";
import type { Acknowledgement } from "@/lib/portal/acknowledge-document";
import { TYPED_NAME_MAX } from "@/lib/portal/typed-name";
import { acknowledgeDocumentFormAction } from "./actions";

/**
 * Acknowledging one shared document (spec §7). Closed until opened, like SignContract, so the
 * customer opens the PDF before the button is reachable. Plain HTML: works with JavaScript off.
 */
export function AcknowledgeDocument({ jobId, document }: {
  jobId: string;
  document: { id: string; title: string; file: { id: string; name: string } };
}) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <p className="font-semibold">{document.title}</p>
      <details>
        <summary className="inline-flex min-h-11 cursor-pointer items-center border border-charcoal px-5 py-3 font-display text-xs uppercase tracking-[0.2em] text-charcoal hover:bg-charcoal hover:text-ivory">
          Read and acknowledge
        </summary>
        <form action={acknowledgeDocumentFormAction} className="mt-3 flex max-w-sm flex-col gap-3 border border-rule bg-sand/50 p-4">
          {/* Carry the job and file with JavaScript off; the action re-derives both itself. */}
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="fileId" value={document.file.id} />
          <p className="text-sm text-ink-soft">
            <a href={`/project/files/${document.file.id}`} target="_blank" rel="noreferrer" className="break-all underline underline-offset-4">
              Open {document.file.name}
            </a>
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Your full name
            <input type="text" name="acknowledgedName" required maxLength={TYPED_NAME_MAX} pattern=".*\S.*" title="Type your full name" autoComplete="name"
              className="min-h-11 w-full border border-rule bg-ivory px-3" />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="read" required className="mt-1 size-4" />
            I have read {document.title}
          </label>
          <button type="submit" className="min-h-11 bg-charcoal px-5 py-3 font-display text-xs uppercase tracking-[0.2em] text-ivory">
            Acknowledge
          </button>
        </form>
      </details>
    </div>
  );
}

/**
 * What the customer is told on landing back. `flag` is the `?docAck=` query string, unvalidated:
 * only a recorded acknowledgement confirms, and a refusal is suppressed once one exists.
 */
export function DocumentAcknowledgedNotice({ flag, acknowledgement }: {
  flag?: string | null;
  acknowledgement: Pick<Acknowledgement, "acknowledgedAt"> | null;
}) {
  if (!flag) return null;
  const confirmed = flag === "1" && acknowledgement !== null;
  if (flag === "1" && !confirmed) return null;
  if (!confirmed && acknowledgement !== null) return null;
  return (
    <p role="status" className="border border-champagne bg-sand/60 p-4 text-sm">
      {confirmed && acknowledgement
        ? `Thank you — your acknowledgement was recorded on ${formatShortDate(acknowledgement.acknowledgedAt)}.`
        : flag === "missing"
          ? "We could not record that: please type your full name and tick the box, then try again."
          : `We could not record that just now. Please call us on ${business.phone.display} and we will sort it out.`}
    </p>
  );
}
