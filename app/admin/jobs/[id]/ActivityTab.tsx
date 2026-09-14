import type { JobEvent } from "@/lib/admin/jobs";
import { EventList } from "./EventList";
import { NoteForm } from "./NoteForm";

export function ActivityTab({ jobId, events, now }: { jobId: string; events: JobEvent[]; now: Date }) {
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <NoteForm jobId={jobId} />
      <EventList events={events} now={now} />
    </div>
  );
}
