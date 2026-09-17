import { deleteJobAction } from "@/app/admin/jobs/actions";
import { DeleteButton } from "./DeleteButton";

/**
 * Deleting a job destroys its quote, measurements, photos, documents and history, with no
 * undo. So the customer's name is on screen before the last tap: open the menu, expand this,
 * read the name, tap, tap again. Works with JavaScript off — the reveal is a <details> and
 * the action a plain form post; the two-tap confirm simply degrades to one submit.
 */
export function DeleteJob({ job, blocked = false }: {
  job: { id: string; name: string; projectNo: string | null };
  /** The job page saw the delete action's refusal marker on the URL. */
  blocked?: boolean;
}) {
  return (
    <details open={blocked}>
      <summary className="cursor-pointer text-sm underline underline-offset-4">Delete this job…</summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-ink-soft">
          Deleting removes <strong className="font-semibold text-charcoal">{job.name}</strong>
          {job.projectNo ? `, ${job.projectNo},` : ""} and everything on it:
          the quote, measurements, photos, documents and history. This cannot be undone.
        </p>
        {blocked ? (
          // Our own copy, chosen by a matched marker — never text taken from the URL.
          <p className="border-l-4 border-taupe bg-ivory px-3 py-2 text-sm">
            This job has a service request against it. Delete that first.
          </p>
        ) : null}
        <form action={deleteJobAction.bind(null, job.id)}>
          <DeleteButton />
        </form>
      </div>
    </details>
  );
}
