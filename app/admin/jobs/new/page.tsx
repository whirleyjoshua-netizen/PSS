import Link from "next/link";
import { requireAdmin } from "@/lib/admin/session";
import { NewJobForm } from "./NewJobForm";

export default async function NewJobPage() {
  await requireAdmin();
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <Link href="/admin" className="text-sm underline underline-offset-4">← All jobs</Link>
      <h1 className="font-display text-2xl font-light">New job</h1>
      <NewJobForm />
    </div>
  );
}
