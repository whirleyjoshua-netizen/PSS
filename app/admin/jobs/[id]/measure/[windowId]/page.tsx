import Link from "next/link";
import { notFound } from "next/navigation";
import { MEASURE_KIND_LABEL } from "@/lib/admin/measure-kinds";
import { getMeasurement } from "@/lib/admin/measurements";
import { requireAdmin } from "@/lib/admin/session";
import { MeasureForm } from "../MeasureForm";

export default async function EditWindowPage({ params }: { params: Promise<{ id: string; windowId: string }> }) {
  await requireAdmin();
  const { id, windowId } = await params;
  const window = await getMeasurement(id, windowId);
  if (!window) notFound();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <Link href={`/admin/jobs/${id}?tab=measurements`} className="text-sm underline underline-offset-4">← Back to job</Link>
      <h1 className="text-2xl font-semibold">Edit window</h1>
      <p className="text-sm text-ink-soft">{MEASURE_KIND_LABEL[window.kind]}</p>
      <MeasureForm jobId={id} kind={window.kind} window={window} defaultRoom={window.room} />
    </div>
  );
}
