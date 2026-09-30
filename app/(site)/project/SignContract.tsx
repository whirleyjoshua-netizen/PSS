import { business } from "@/content/business";
import { formatShortDate } from "@/lib/admin/time";
import { hasInitialMarks } from "@/lib/pdf/sign-marks";
import type { ListedSignature, SignableFile } from "@/lib/portal/sign";
import { signContractFormAction } from "./actions";
import { AdoptSignature } from "./AdoptSignature";

/**
 * Signing one shared contract. Closed until opened, like ApproveQuote, so the customer reads
 * what they are agreeing to before the button is reachable. The customer adopts a signature
 * (AdoptSignature: typed by default, drawn with JavaScript) and, when the file has numbered
 * sections, initials. With JavaScript off it is plain HTML: the reveal is the browser's and the
 * submit is a typed form post.
 */
export function SignContract({ jobId, file }: { jobId: string; file: Pick<SignableFile, "id" | "name"> & { document?: SignableFile["document"]; signMarks?: SignableFile["signMarks"] } }) {
  // A job document's PDF is signed through this same path; the customer reads "document" and its title.
  const noun = file.document ? "document" : "contract";
  const initialling = hasInitialMarks(file.signMarks);
  const form = (
    <details className="w-full max-w-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center border border-charcoal px-5 py-3 font-display text-xs uppercase tracking-[0.2em] text-charcoal hover:bg-charcoal hover:text-ivory">
        Sign this {noun}
      </summary>
      <form
        action={signContractFormAction}
        className="mt-3 flex max-w-sm flex-col gap-3 border border-rule bg-sand/50 p-4"
      >
        {/* Carry the job and file with JavaScript off; the action re-derives both itself. */}
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="fileId" value={file.id} />
        <p className="text-sm text-ink-soft">
          <a href={`/project/files/${file.id}`} target="_blank" rel="noreferrer" className="break-all underline underline-offset-4">
            {file.name}
          </a>
        </p>
        <AdoptSignature needsInitials={initialling} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="agreed" required className="mt-1 size-4" />
          I agree to sign this {noun} electronically{initialling ? " and to initial every numbered section" : ""}
        </label>
        <button
          type="submit"
          className="min-h-11 bg-charcoal px-5 py-3 font-display text-xs uppercase tracking-[0.2em] text-ivory"
        >
          Sign this {noun}
        </button>
      </form>
    </details>
  );
  if (!file.document) return form;
  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <p className="font-semibold">{file.document.title}</p>
      {form}
    </div>
  );
}

/**
 * What the customer is told on landing back after signing. `signed` is the query string — the
 * customer's browser talking — so only a recorded signature can produce the confirmation, and a
 * refusal is suppressed once one exists, exactly as ApprovalNotice does.
 */
export function SignatureNotice({
  signed,
  signature,
}: {
  /** The `?signed=` flag, straight off the URL and unvalidated: "1", "no", or "missing" (a field left empty). */
  signed?: string | null;
  /** The job's most recent recorded signature, re-derived server-side. The only thing believed. */
  signature: (Pick<ListedSignature, "signedAt"> & { documentTitle?: string | null }) | null;
}) {
  if (!signed) return null;
  const confirmed = signed === "1" && signature !== null;
  if (signed === "1" && !confirmed) return null;
  if (!confirmed && signature !== null) return null;

  return (
    <p role="status" className="border border-champagne bg-sand/60 p-4 text-sm">
      {confirmed && signature
        ? signature.documentTitle
          ? `Thank you — you signed “${signature.documentTitle}” on ${formatShortDate(signature.signedAt)}. A copy is on its way to your email.`
          : `Thank you — your contract was signed on ${formatShortDate(signature.signedAt)}. A copy is on its way to your email.`
        : signed === "missing"
          ? "We could not record that signature: please type your full name, add your initials or signature where asked, and tick the box to agree, then sign again."
          : `We could not record that signature just now. Please call us on ${business.phone.display} and we will sort it out.`}
    </p>
  );
}
