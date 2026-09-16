import { setFileShared } from "@/app/admin/jobs/measure-actions";

/**
 * Submits the opposite state. aria-checked carries the current one for screen
 * readers, and the accessible name carries the file, because sharing the wrong
 * quote with a customer cannot be taken back.
 */
export function ShareSwitch({ jobId, fileId, fileName, shared }: {
  jobId: string;
  fileId: string;
  fileName: string;
  shared: boolean;
}) {
  return (
    <form action={setFileShared.bind(null, jobId, fileId, !shared)}>
      <button type="submit" role="switch" aria-checked={shared}
        aria-label={`Share ${fileName} with customer`}
        className="inline-flex min-h-11 items-center gap-2 px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2">
        <span aria-hidden="true"
          className={`inline-flex h-5 w-9 items-center rounded-full border border-charcoal p-0.5 ${shared ? "bg-charcoal" : "bg-ivory"}`}>
          <span className={`block size-3.5 rounded-full transition-transform ${shared ? "translate-x-4 bg-ivory" : "bg-charcoal"}`} />
        </span>
        Share with customer
      </button>
    </form>
  );
}
