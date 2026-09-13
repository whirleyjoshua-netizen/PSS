import Link from "next/link";
import { requireAdmin } from "@/lib/admin/session";
import { parseWorkingStage, stageLabel } from "@/lib/admin/stages";
import { NewJobForm } from "./NewJobForm";

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string | string[] }>;
}) {
  await requireAdmin();
  const raw = (await searchParams).stage;
  const stage = parseWorkingStage(Array.isArray(raw) ? raw[0] : raw);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <Link href="/admin" className="text-sm underline underline-offset-4">← All jobs</Link>
      <h1 className="font-display text-2xl font-light">{stage ? `New job · ${stageLabel(stage)}` : "New job"}</h1>
      <NewJobForm defaultStage={stage ?? "new"} />
    </div>
  );
}
