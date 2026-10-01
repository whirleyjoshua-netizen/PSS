import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob } from "@/lib/admin/jobs";
import { isMeasureKind, MEASURE_KIND_LABEL, windowsOfKind } from "@/lib/admin/measure-kinds";
import { getMeasureSet } from "@/lib/admin/measurements";
import { windowCount } from "@/lib/admin/measure-units";
import { requireAdmin } from "@/lib/admin/session";
import { KeepOfficialBox } from "../KeepOfficialBox";
import { firstParam } from "../tabs";
import { MeasureChooser } from "./MeasureChooser";
import { MeasureForm } from "./MeasureForm";

export default async function MeasurePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string | string[] }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const [set, query] = await Promise.all([getMeasureSet(id), searchParams]);
  const asked = firstParam(query.kind);
  // A kept job has no separate official measure to take, so that link lands on the chooser's reason.
  const kind = isMeasureKind(asked) && !(asked === "official" && set.kept) ? asked : null;
  const back = `/admin/jobs/${id}?tab=measurements`;

  if (!kind) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <Link href={back} className="text-sm underline underline-offset-4">← {job.name}</Link>
        <h1 className="text-2xl font-semibold">Measure</h1>
        <MeasureChooser jobId={id} set={set} />
      </div>
    );
  }

  const windows = windowsOfKind(set, kind);
  const count = windowCount(windows);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <Link href={back} className="text-sm underline underline-offset-4">← {job.name}</Link>
        <Link href={back} className="text-sm font-semibold underline underline-offset-4">Finish</Link>
      </div>
      <h1 className="text-2xl font-semibold">{MEASURE_KIND_LABEL[kind]}</h1>
      <p className="text-sm text-ink-soft">{count} {count === 1 ? "window" : "windows"} so far</p>
      {kind === "designer" ? (
        <KeepOfficialBox jobId={id} kept={Boolean(set.kept)} blocked={windowsOfKind(set, "official").length > 0} />
      ) : null}
      <MeasureForm jobId={id} kind={kind} window={null} defaultRoom={windows.at(-1)?.room ?? ""} />
    </div>
  );
}
