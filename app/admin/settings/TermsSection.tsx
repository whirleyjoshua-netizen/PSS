import Link from "next/link";
import { formatWhen } from "@/lib/admin/time";

/**
 * Spec §8: contract terms are a template on the Documents page now. This line says which terms
 * contracts use: the template, else a PDF uploaded before templates existed, else none.
 */
export function TermsSection({ template, legacyUpload }: { template: { updatedAt: Date } | null; legacyUpload: boolean }) {
  return (
    <section aria-labelledby="terms-heading" className="flex flex-col gap-2">
      <h2 id="terms-heading" className="text-lg font-semibold">Contract terms</h2>
      {template ? (
        <p className="text-ink-soft">Contracts print the terms from the Documents page, last updated {formatWhen(template.updatedAt)}.</p>
      ) : legacyUpload ? (
        <p className="text-ink-soft">Using the uploaded PDF until you create terms on the Documents page.</p>
      ) : (
        <p className="text-overdue">No contract terms yet. Contracts can&apos;t be sent until you add them on the Documents page.</p>
      )}
      <Link href="/admin/documents" className="self-start underline underline-offset-4">
        {template ? "Edit terms on the Documents page" : "Open the Documents page"}
      </Link>
    </section>
  );
}
