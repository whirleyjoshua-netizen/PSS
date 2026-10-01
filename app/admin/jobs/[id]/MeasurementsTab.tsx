import Link from "next/link";
import type { ReactNode } from "react";
import { removeMeasurement } from "@/app/admin/jobs/measure-actions";
import { ButtonLink } from "@/components/ui/Button";
import type { JobFile } from "@/lib/admin/files";
import { MEASURE_KIND_LABEL, windowsOfKind, type MeasureKind, type MeasureSet } from "@/lib/admin/measure-kinds";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { formatEighths, requirementLabel, windowCount } from "@/lib/admin/measure-units";
import { formatWhen } from "@/lib/admin/time";
import { DeleteButton } from "./DeleteButton";
import { KeepOfficialBox } from "./KeepOfficialBox";
import { ShareSwitch } from "./ShareSwitch";
import { HEADING } from "./ui";

const COLUMNS = ["Room", "Window", "Qty", "Width", "Height", "Depth", "Mount", "Notes", "Photo"];
const CELL = "px-3 py-3";

/** The designer's list and the official list, side by side and never compared (owner's choice). */
export function MeasurementsTab({ jobId, set, files }: {
  jobId: string;
  set: MeasureSet<WindowMeasurement>;
  files: JobFile[];
}) {
  const official = windowsOfKind(set, "official");
  return (
    <div className="flex flex-col gap-8">
      <MeasureSection jobId={jobId} kind="designer" windows={windowsOfKind(set, "designer")} files={files}
        empty="No windows measured yet." canAdd
        extra={<KeepOfficialBox jobId={jobId} kept={Boolean(set.kept)} blocked={official.length > 0} />} />
      <MeasureSection jobId={jobId} kind="official" windows={official} files={files}
        empty={set.kept ? null : "No official measure yet."} canAdd={!set.kept}
        extra={set.kept ? (
          <p className="text-sm">
            Using the designer measure (kept as official by {set.kept.by}, {formatWhen(set.kept.at)}).
          </p>
        ) : null} />
    </div>
  );
}

function MeasureSection({ jobId, kind, windows, files, empty, canAdd, extra }: {
  jobId: string;
  kind: MeasureKind;
  windows: WindowMeasurement[];
  files: JobFile[];
  empty: string | null;
  canAdd: boolean;
  extra: ReactNode;
}) {
  const headingId = `measure-${kind}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className={HEADING}>{MEASURE_KIND_LABEL[kind]} · {windowCount(windows)}</h2>
        {canAdd ? (
          <ButtonLink href={`/admin/jobs/${jobId}/measure?kind=${kind}`} variant="solid">
            Add to {MEASURE_KIND_LABEL[kind].toLowerCase()}
          </ButtonLink>
        ) : null}
      </div>
      {extra}
      {windows.length > 0 ? <MeasureTable jobId={jobId} windows={windows} files={files} />
        : empty ? <p className="text-sm text-ink-soft">{empty}</p> : null}
    </section>
  );
}

function MeasureTable({ jobId, windows, files }: { jobId: string; windows: WindowMeasurement[]; files: JobFile[] }) {
  const sharedById = new Map(files.map((file) => [file.id, Boolean(file.sharedAt)]));
  const nameById = new Map(files.map((file) => [file.id, file.name]));

  return (
    <div className="overflow-x-auto border border-rule bg-ivory">
      <table className="w-full min-w-[48rem] text-left text-sm">
        <thead className="border-b border-rule text-xs uppercase tracking-wide text-ink-soft">
          <tr>
            {COLUMNS.map((column) => <th key={column} scope="col" className={`${CELL} font-semibold`}>{column}</th>)}
            <th scope="col" className={CELL}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {windows.map((m) => (
            <tr key={m.id} className="align-top">
              <th scope="row" className={`${CELL} font-semibold`}>{m.room}</th>
              <td className={CELL}>{m.label ?? "—"}</td>
              <td className={CELL}>{m.quantity}</td>
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
                    <ShareSwitch jobId={jobId} fileId={m.photoFileId}
                      fileName={nameById.get(m.photoFileId) ?? `the photo of ${m.label ?? m.room}`}
                      shared={sharedById.get(m.photoFileId) ?? false} />
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
  );
}
