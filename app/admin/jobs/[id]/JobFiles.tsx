import { removeFile } from "@/app/admin/jobs/measure-actions";
import type { JobFile } from "@/lib/admin/files";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { formatWhen } from "@/lib/admin/time";
import { AddPhotoButton } from "./AddPhotoButton";
import { DeleteButton } from "./DeleteButton";
import { DocTypeSelect } from "./DocTypeSelect";
import { ShareSwitch } from "./ShareSwitch";
import { UploadButton } from "./UploadButton";

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** Measurements are shown on their own tab; they are taken here only to keep window photos out of Photos. */
export function JobFiles({ jobId, measurements, files }: {
  jobId: string;
  measurements: WindowMeasurement[];
  files: JobFile[];
}) {
  const uploads = files.filter((file) => file.kind === "document");
  const windowPhotoIds = new Set(measurements.map((m) => m.photoFileId).filter(Boolean));
  const photos = files.filter((file) => file.kind === "photo" && !windowPhotoIds.has(file.id));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <UploadButton jobId={jobId} />
        <AddPhotoButton jobId={jobId} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Photos · {photos.length}</h3>
        {photos.length === 0 ? <p className="text-sm text-ink-soft">No photos yet. Install and before/after photos go here.</p> : (
          <ul className="flex flex-col divide-y divide-rule border border-rule">
            {photos.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <a href={`/admin/files/${file.id}`} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private files are streamed by our own route, not the image optimizer */}
                  <img src={`/admin/files/${file.id}`} alt={file.name} className="size-16 object-cover" />
                </a>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{file.name}</p>
                  <p className="text-ink-soft">
                    {formatWhen(file.createdAt)}
                    {file.sharedAt ? <> · <span className="text-xs uppercase tracking-wide text-charcoal">Shared</span></> : null}
                  </p>
                </div>
                <ShareSwitch jobId={jobId} fileId={file.id} fileName={file.name} shared={Boolean(file.sharedAt)} />
                <form action={removeFile.bind(null, jobId, file.id)}>
                  <DeleteButton />
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Uploads · {uploads.length}</h3>
        {uploads.length === 0 ? <p className="text-sm text-ink-soft">No files uploaded yet.</p> : (
          <ul className="flex flex-col divide-y divide-rule border border-rule">
            {uploads.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <a href={`/admin/files/${file.id}`} target="_blank" rel="noreferrer" className="block truncate font-semibold underline underline-offset-4">{file.name}</a>
                  <p className="text-ink-soft">
                    {size(file.sizeBytes)} · {file.uploadedBy} · {formatWhen(file.createdAt)}
                    {file.sharedAt ? <> · <span className="text-xs uppercase tracking-wide text-charcoal">Shared</span></> : null}
                  </p>
                </div>
                <DocTypeSelect jobId={jobId} fileId={file.id} fileName={file.name} docType={file.docType ?? null} />
                <ShareSwitch jobId={jobId} fileId={file.id} fileName={file.name} shared={Boolean(file.sharedAt)} />
                <form action={removeFile.bind(null, jobId, file.id)}>
                  <DeleteButton />
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
