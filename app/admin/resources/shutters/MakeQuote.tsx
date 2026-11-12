"use client";

import { useActionState, useState } from "react";
import { formatCents } from "@/lib/admin/money";
import type { QuoteInput } from "@/lib/admin/shutter-pricing";
import { makeShutterQuoteAction, type MakeQuoteState } from "./actions";

export type JobChoice = { id: string; name: string; projectNo: number };

/**
 * Files the priced windows on a job as an official quote. It sends exactly what is on screen and the total
 * shown; the server prices it again and refuses if they differ. Disabled until every window is priced.
 */
export function MakeQuote({ jobs, input, totalCents, blocked }: {
  jobs: JobChoice[]; input: QuoteInput; totalCents: number | null; blocked: string | null;
}) {
  const [state, action, pending] = useActionState<MakeQuoteState, FormData>(makeShutterQuoteAction, {});
  const [jobId, setJobId] = useState("");
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const digits = term.replace(/\D/g, "");
  const shown = term ? jobs.filter((j) => j.name.toLowerCase().includes(term) || (digits !== "" && String(j.projectNo).includes(digits))) : jobs;
  const reason = blocked ?? (totalCents === null ? "Every window needs a client price first." : !jobId ? "Pick the client's job." : null);
  return (
    <form action={action} aria-label="Make this a quote" className="flex flex-col gap-3 border-t border-rule pt-4">
      <h2 className="text-base font-semibold">Make this a quote</h2>
      <p className="text-xs text-ink-soft">Saves these windows on the job as a quote to review and send, so the client can approve, sign and pay the deposit. Your costs go in a cost sheet only the team can see.</p>
      <label className="flex flex-col gap-1 text-sm">Find the job
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or PSS number" className="min-h-11 border border-rule bg-white px-2 text-base" />
      </label>
      <label className="flex flex-col gap-1 text-sm">Job
        <select name="jobId" value={jobId} onChange={(e) => setJobId(e.target.value)} className="min-h-11 border border-rule bg-white px-2 text-base">
          <option value="">Pick a job</option>
          {shown.map((j) => <option key={j.id} value={j.id}>{j.name} · PSS-{String(j.projectNo).padStart(4, "0")}</option>)}
        </select>
      </label>
      <input type="hidden" name="quote" value={JSON.stringify(input)} />
      <input type="hidden" name="total" value={totalCents ?? ""} />
      <button type="submit" disabled={pending || reason !== null} className="min-h-11 self-start bg-charcoal px-4 text-ivory disabled:opacity-50">
        {pending ? "Saving…" : totalCents === null ? "Make this a quote" : `Make this a ${formatCents(totalCents)} quote`}
      </button>
      {reason && !pending ? <p className="text-xs text-ink-soft">{reason}</p> : null}
      {state.error ? <p role="alert" className="text-sm text-overdue">{state.error}</p> : null}
    </form>
  );
}
