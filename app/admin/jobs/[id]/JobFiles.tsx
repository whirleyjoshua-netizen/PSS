import Link from "next/link";
import { removeFile, removeMeasurement } from "@/app/admin/jobs/measure-actions";
import type { JobFile } from "@/lib/admin/files";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { formatEighths, requirementLabel } from "@/lib/admin/measure-units";
import { formatWhen } from "@/lib/admin/time";
import { AddPhotoButton } from "./AddPhotoButton";
import { DeleteButton } from "./DeleteButton";
import { ShareSwitch } from "./ShareSwitch";
import { UploadButton } from "./UploadButton";

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export function JobFiles({ jobId, measurements, files, showMeasurements = true }: {
  jobId: string;
  measurements: WindowMeasurement[];
  files: JobFile[];
  /** The job page shows measurements on their own tab; the board panel keeps them here. */
  showMeasurements?: boolean;
}) {
  const rooms = [...new Set(measurements.map((m) => m.room))];
  const uploads = files.filter((file) => file.kind === "document");
  const windowPhotoIds = new Set(measurements.map((m) => m.photoFileId).filter(Boolean));
  const photos = files.filter((file) => file.kind === "photo" && !windowPhotoIds.has(file.id));
  const sharedById = new Map(files.map((file) => [file.id, Boolean(file.sharedAt)]));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        {showMeasurements ? (
          <Link href={`/admin/jobs/${jobId}/measure`}
            className="inline-flex min-h-11 items-center bg-charcoal px-4 text-sm text-ivory">Measure</Link>
        ) : null}
        <UploadButton jobId={jobId} />
        <AddPhotoButton jobId={jobId} />
      </div>

      {showMeasurements ? (
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold">Measurements · {measurements.length}</h3>
          {measurements.length === 0 ? <p className="text-sm text-ink-soft">No windows measured yet.</p> : null}
          {rooms.map((room) => (
            <div key={room} className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{room}</h4>
              <ul className="flex flex-col divide-y divide-rule border border-rule">
                {measurements.filter((m) => m.room === room).map((m) => (
                  <li key={m.id} className="flex gap-3 p-3 text-sm">
                    {m.photoFileId ? (
                      <a href={`/admin/files/${m.photoFileId}`} target="_blank" rel="noreferrer" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element -- private files are streamed by our own route, not the image optimizer */}
                        <img src={`/admin/files/${m.photoFileId}`} alt={`Photo of ${m.label ?? room}`} className="size-16 object-cover" />
                      </a>
                    ) : null}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="font-semibold">{m.label ?? "Window"} — {formatEighths(m.widthEighths)} × {formatEighths(m.heightEighths)}</p>
                      <p className="text-ink-soft">
                        {m.mount === "inside" ? "Inside" : "Outside"} mount
                        {m.depthEighths ? ` · depth ${formatEighths(m.depthEighths)}` : ""}
                        {m.requirements.length ? ` · ${m.requirements.map(requirementLabel).join(", ")}` : ""}
                      </p>
                      {m.notes ? <p className="whitespace-pre-line">{m.notes}</p> : null}
                      {m.photoFileId && sharedById.get(m.photoFileId) ? (
                        <p className="text-xs uppercase tracking-wide">Shared</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Link href={`/admin/jobs/${jobId}/measure/${m.id}`}
                        className="min-h-11 inline-flex items-center px-3 underline underline-offset-4">Edit</Link>
                      {m.photoFileId ? (
                        <ShareSwitch jobId={jobId} fileId={m.photoFileId} shared={sharedById.get(m.photoFileId) ?? false} />
                      ) : null}
                      <form action={removeMeasurement.bind(null, jobId, m.id)}>
                        <DeleteButton />
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

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
                <ShareSwitch jobId={jobId} fileId={file.id} shared={Boolean(file.sharedAt)} />
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
              <li key={file.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <a href={`/admin/files/${file.id}`} target="_blank" rel="noreferrer" className="block truncate font-semibold underline underline-offset-4">{file.name}</a>
                  <p className="text-ink-soft">{size(file.sizeBytes)} · {file.uploadedBy} · {formatWhen(file.createdAt)}</p>
                </div>
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
