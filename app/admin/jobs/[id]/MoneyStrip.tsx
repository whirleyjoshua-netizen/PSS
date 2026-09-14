import Link from "next/link";
import type { Job } from "@/lib/admin/jobs";
import { balanceCents, formatCents } from "@/lib/admin/money";
import { CARD, HEADING, TEXT_LINK } from "./ui";

export function MoneyStrip({ job, editHref }: {
  job: Pick<Job, "quoteCents" | "soldCents" | "depositCents">;
  editHref: string;
}) {
  const balance = balanceCents(job.soldCents, job.depositCents);
  const empty = job.quoteCents === null && job.soldCents === null;

  return (
    <section aria-label="Money" className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <h2 className={HEADING}>Money</h2>
        {empty ? null : <Link href={editHref} className={TEXT_LINK}>Edit</Link>}
      </div>
      {empty ? (
        <p className="text-sm text-ink-soft">
          No quote yet. <Link href={editHref} className={TEXT_LINK}>Add quote</Link>
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure label="Quote" value={formatCents(job.quoteCents)} />
          <Figure label="Sold" value={formatCents(job.soldCents)} />
          <Figure label="Deposit" value={formatCents(job.depositCents)} />
          <Figure label="Balance" value={formatCents(balance)} strong />
        </dl>
      )}
    </section>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-1 border-l border-rule pl-3">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className={`font-display text-xl ${strong ? "font-semibold" : "font-light"}`}>{value}</dd>
    </div>
  );
}
