import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob } from "@/lib/admin/jobs";
import { listMeasurements } from "@/lib/admin/measurements";
import { requireAdmin } from "@/lib/admin/session";
import { MeasureForm } from "./MeasureForm";

export default async function MeasurePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const windows = await listMeasurements(id);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/admin/jobs/${id}?tab=measurements`} className="text-sm underline underline-offset-4">← {job.name}</Link>
        <Link href={`/admin/jobs/${id}?tab=measurements`} className="text-sm font-semibold underline underline-offset-4">Finish</Link>
      </div>
      <h1 className="text-2xl font-semibold">Measure</h1>
      <p className="text-sm text-ink-soft">{windows.length} {windows.length === 1 ? "window" : "windows"} so far</p>
      <MeasureForm jobId={id} window={null} defaultRoom={windows.at(-1)?.room ?? ""} />
    </div>
  );
}
