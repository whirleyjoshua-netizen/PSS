import Link from "next/link";
import { notFound } from "next/navigation";
import { TEXT_LINK } from "@/app/admin/jobs/[id]/ui";
import { requireAdmin } from "@/lib/admin/session";
import { getTemplate } from "@/lib/docs/templates";
import { archiveTemplateAction } from "../actions";
import { TemplateForm } from "../TemplateForm";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const template = await getTemplate(id);
  if (!template || template.archivedAt) notFound();
  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Link href="/admin/documents" className={TEXT_LINK}>All documents</Link>
      <h1 className="text-2xl font-semibold">{template.name}</h1>
      <TemplateForm template={{ id: template.id, name: template.name, kind: template.kind, response: template.response, body: template.body }} />
      <form action={archiveTemplateAction} className="flex flex-col gap-2 border-t border-rule pt-4">
        <input type="hidden" name="id" value={template.id} />
        <p className="text-sm text-ink-soft">Archiving hides this template. Documents already made from it keep their text.</p>
        <button type="submit" className="min-h-11 self-start border border-charcoal px-4 text-sm">Archive template</button>
      </form>
    </div>
  );
}
