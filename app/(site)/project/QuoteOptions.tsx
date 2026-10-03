import { formatCents } from "@/lib/admin/money";
import { ApproveQuote } from "./ApproveQuote";

const heading = "font-display text-xs uppercase tracking-[0.2em] text-champagne-ink";

/** One option the client can choose, read server-side: the offered version, its total and its own shared quote PDF. */
export type QuoteOptionChoice = { versionId: string; option: string; totalCents: number | null; file: { id: string; name: string } };

/**
 * Quote options spec §6: two or more offered options, each with its total, its own PDF to view or download and its
 * own Approve. Approving one closes the others (approveDcQuote). One offered quote keeps the banner's Review / Approve
 * instead, so this renders only for two or more.
 */
export function QuoteOptions({ jobId, options }: { jobId: string; options: QuoteOptionChoice[] }) {
  return (
    <section id="quote-options" className="flex flex-col gap-4" aria-labelledby="quote-options-heading">
      <h2 id="quote-options-heading" className={heading}>Your quote options</h2>
      <ul className="flex flex-col divide-y divide-rule border-t border-rule">
        {options.map((choice) => (
          <li key={choice.versionId} aria-label={`Option ${choice.option}`} className="flex flex-col gap-3 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">Option {choice.option}</h3>
              <p className="tabular-nums">{formatCents(choice.totalCents)}</p>
            </div>
            <a href={`/project/files/${choice.file.id}`} target="_blank" rel="noreferrer" className="min-h-11 break-all underline underline-offset-4">
              {choice.file.name}
            </a>
            <ApproveQuote jobId={jobId} versionId={choice.versionId} option={choice.option} />
          </li>
        ))}
      </ul>
    </section>
  );
}
