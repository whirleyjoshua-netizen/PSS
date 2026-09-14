import Link from "next/link";
import { removeMeasurement } from "@/app/admin/jobs/measure-actions";
import { ButtonLink } from "@/components/ui/Button";
import type { JobFile } from "@/lib/admin/files";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { formatEighths, requirementLabel } from "@/lib/admin/measure-units";
import { DeleteButton } from "./DeleteButton";
import { ShareSwitch } from "./ShareSwitch";
import { HEADING } from "./ui";

const COLUMNS = ["Room", "Window", "Width", "Height", "Depth", "Mount", "Notes", "Photo"];
const CELL = "px-3 py-3";

export function MeasurementsTab({ jobId, measurements, files }: {
  jobId: string;
  measurements: WindowMeasurement[];
  files: JobFile[];
}) {
  const sharedById = new Map(files.map((file) => [file.id, Boolean(file.sharedAt)]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={HEADING}>Measurements · {measurements.length}</h2>
        <ButtonLink href={`/admin/jobs/${jobId}/measure`} variant="solid">Add measurement</ButtonLink>
      </div>

      {measurements.length === 0 ? (
        <p className="text-sm text-ink-soft">No windows measured yet.</p>
      ) : (
        <div className="overflow-x-auto border border-rule bg-ivory">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-rule text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                {COLUMNS.map((column) => <th key={column} scope="col" className={`${CELL} font-semibold`}>{column}</th>)}
                <th scope="col" className={CELL}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {measurements.map((m) => (
                <tr key={m.id} className="align-top">
                  <th scope="row" className={`${CELL} font-semibold`}>{m.room}</th>
                  <td className={CELL}>{m.label ?? "—"}</td>
                  <td className={CELL}>{formatEighths(m.widthEighths)}</td>
                  <td className={CELL}>{formatEighths(m.heightEighths)}</td>
                  <td className={CELL}>{formatEighths(m.depthEighths)}</td>
                  <td className={CELL}>{m.mount === "inside" ? "Inside" : "Outside"}</td>
                  <td className={`${CELL} whitespace-pre-line`}>
                    {[...m.requirements.map(requirementLabel), m.notes].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className={CELL}>
                    {m.photoFileId ? (
                      <a href={`/admin/files/${m.photoFileId}`} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- private files are streamed by our own route, not the image optimizer */}
                        <img src={`/admin/files/${m.photoFileId}`} alt={`Photo of ${m.label ?? m.room}`} className="size-12 object-cover" />
                      </a>
                    ) : "—"}
                  </td>
                  <td className={CELL}>
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/admin/jobs/${jobId}/measure/${m.id}`}
                        className="inline-flex min-h-11 items-center px-2 underline underline-offset-4">Edit</Link>
                      {m.photoFileId ? (
                        <ShareSwitch jobId={jobId} fileId={m.photoFileId} shared={sharedById.get(m.photoFileId) ?? false} />
                      ) : null}
                      <form action={removeMeasurement.bind(null, jobId, m.id)}>
                        <DeleteButton />
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
