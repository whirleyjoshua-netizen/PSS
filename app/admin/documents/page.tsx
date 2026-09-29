import Link from "next/link";
import { ACTION_LINK } from "@/app/admin/jobs/[id]/ui";
import { requireAdmin } from "@/lib/admin/session";
import { formatWhen } from "@/lib/admin/time";
import { TEMPLATE_GROUPS, docResponseLabel, templateGroup, templateKindLabel, type TemplateGroup } from "@/lib/docs/kinds";
import { listTemplates } from "@/lib/docs/templates";
import { startStarterTermsAction } from "./actions";

const EMPTY: Record<TemplateGroup, string> = {
  terms: "No contract terms yet. Contracts can't be sent until you add them.",
  client: "No client document templates yet.",
  guide: "No portal guides yet. A guide appears on the client's page only once you write it.",
};

/** Spec §5: live templates, grouped. Archived templates are not listed. */
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ starter?: string | string[] }> }) {
  await requireAdmin();
  const [templates, query] = await Promise.all([listTemplates(), searchParams]);
  const hasTerms = templates.some((template) => template.kind === "terms");
  const starter = Array.isArray(query.starter) ? query.starter[0] : query.starter;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Documents</h1>
        <Link href="/admin/documents/new" className={ACTION_LINK}>New template</Link>
      </div>
      {starter === "exists" ? <p role="status" className="text-sm">There is already a live Contract terms template.</p> : null}
      {TEMPLATE_GROUPS.map((group) => {
        const inGroup = templates.filter((template) => templateGroup(template.kind) === group.value);
        return (
          <section key={group.value} aria-labelledby={`group-${group.value}`} className="flex flex-col gap-3">
            <h2 id={`group-${group.value}`} className="text-lg font-semibold">{group.label}</h2>
            {inGroup.length === 0 ? <p className="text-sm text-ink-soft">{EMPTY[group.value]}</p> : (
              <ul className="flex flex-col divide-y divide-rule border border-rule">
                {inGroup.map((template) => (
                  <li key={template.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3 text-sm">
                    <Link href={`/admin/documents/${template.id}`} className="font-semibold underline underline-offset-4">{template.name}</Link>
                    <span className="text-ink-soft">
                      {templateKindLabel(template.kind)} · {docResponseLabel(template.response)} · Updated {formatWhen(template.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {group.value === "terms" && !hasTerms ? (
              <form action={startStarterTermsAction}>
                <button type="submit" className={ACTION_LINK}>Start from the Premier Shade starter terms</button>
              </form>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
