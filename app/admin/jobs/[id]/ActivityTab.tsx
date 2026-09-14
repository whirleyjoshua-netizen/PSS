import type { JobEvent } from "@/lib/admin/jobs";
import { EventList } from "./EventList";
import { NoteForm } from "./NoteForm";
import { HEADING } from "./ui";

export function ActivityTab({ jobId, events, now }: { jobId: string; events: JobEvent[]; now: Date }) {
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <h2 className={HEADING}>Activity</h2>
      <NoteForm jobId={jobId} />
      <EventList events={events} now={now} />
    </div>
  );
}
