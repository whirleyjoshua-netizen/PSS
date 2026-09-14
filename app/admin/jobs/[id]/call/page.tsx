import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob } from "@/lib/admin/jobs";
import { requireAdmin } from "@/lib/admin/session";
import { stageLabel } from "@/lib/admin/stages";
import { formatPhone } from "@/lib/leads/schema";
import { CallForm } from "./CallForm";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <Link href={`/admin/jobs/${job.id}`} className="text-sm underline underline-offset-4">← Back to job</Link>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-light">Call {job.name}</h1>
        <a href={`tel:+1${job.phone}`} className="text-2xl font-semibold underline-offset-4 hover:underline">{formatPhone(job.phone)}</a>
        <p className="text-sm text-ink-soft">{job.city} · {stageLabel(job.status)}</p>
      </header>
      <CallForm job={job} />
    </div>
  );
}
