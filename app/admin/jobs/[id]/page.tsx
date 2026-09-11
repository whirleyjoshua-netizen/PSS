import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPhone } from "@/lib/leads/schema";
import { getEvents, getJob } from "@/lib/admin/jobs";
import { formatCents } from "@/lib/admin/money";
import { requireAdmin } from "@/lib/admin/session";
import { stageLabel } from "@/lib/admin/stages";
import { formatWhen } from "@/lib/admin/time";
import { DetailsForm } from "./DetailsForm";
import { NoteForm } from "./NoteForm";
import { StageControls } from "./StageControls";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const events = await getEvents(id);

  const mapHref = `https://maps.google.com/?q=${encodeURIComponent([job.address, job.city, "NV"].filter(Boolean).join(", "))}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <Link href="/admin" className="text-sm underline underline-offset-4">← All jobs</Link>

      <section className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-light">{job.name}</h1>
        <a href={`tel:+1${job.phone}`} className="text-lg underline-offset-4 hover:underline">{formatPhone(job.phone)}</a>
        {job.email ? <a href={`mailto:${job.email}`} className="underline-offset-4 hover:underline">{job.email}</a> : null}
        <a href={mapHref} className="text-ink-soft underline-offset-4 hover:underline">
          {[job.address, job.city].filter(Boolean).join(", ")}
        </a>
        <dl className="mt-2 grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1 text-sm text-ink-soft">
          <dt>Interested in</dt><dd>{job.treatments.join(", ") || "—"}</dd>
          <dt>Windows</dt><dd>{job.windowCount ?? "—"}</dd>
          <dt>Heard about us</dt><dd>{job.heardVia ?? "—"}</dd>
          <dt>Came in via</dt><dd>{job.source}</dd>
          <dt>Quote / sold</dt><dd>{formatCents(job.quoteCents)} / {formatCents(job.soldCents)}</dd>
        </dl>
        {job.notes ? <p className="mt-2 whitespace-pre-line border-l-2 border-champagne pl-4 text-sm">{job.notes}</p> : null}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Stage</h2>
        <StageControls job={job} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Job details</h2>
        <DetailsForm job={job} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Activity</h2>
        <NoteForm jobId={job.id} />
        <ol className="flex flex-col gap-3 text-sm">
          {events.map((event) => (
            <li key={event.id} className="border-b border-rule pb-3">
              <p className="text-charcoal">
                {event.kind === "stage" && event.toStatus
                  ? `${event.fromStatus ? `${stageLabel(event.fromStatus)} → ` : ""}${stageLabel(event.toStatus)}`
                  : event.body}
              </p>
              {event.kind === "stage" && event.body ? <p className="text-ink-soft">{event.body}</p> : null}
              <p className="text-xs text-ink-soft">{event.actor} · {formatWhen(event.createdAt)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
