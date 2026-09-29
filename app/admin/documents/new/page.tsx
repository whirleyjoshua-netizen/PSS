import Link from "next/link";
import { TEXT_LINK } from "@/app/admin/jobs/[id]/ui";
import { requireAdmin } from "@/lib/admin/session";
import { TemplateForm } from "../TemplateForm";

export default async function NewTemplatePage() {
  await requireAdmin();
  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Link href="/admin/documents" className={TEXT_LINK}>All documents</Link>
      <h1 className="text-2xl font-semibold">New template</h1>
      <TemplateForm template={null} />
    </div>
  );
}
