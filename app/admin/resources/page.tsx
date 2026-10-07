import { CARD } from "@/app/admin/jobs/[id]/ui";
import { requireAdmin } from "@/lib/admin/session";
import { listCategories, listResources } from "@/lib/admin/resources";
import { categoryChoices } from "@/lib/admin/resource-rules";
import { CategoryManager } from "./CategoryManager";
import { ResourceList } from "./ResourceList";
import { ResourceUploader } from "./ResourceUploader";

/** The owners' file library (spec Part B): never shown to clients. */
export default async function ResourcesPage() {
  await requireAdmin();
  const [resources, categories] = await Promise.all([listResources(), listCategories()]);
  const choices = categoryChoices(categories);
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Resources</h1>
        <p className="text-sm text-ink-soft">Company files for the team only. Clients never see these.</p>
      </div>
      <section aria-label="Upload files" className={CARD}>
        <ResourceUploader categories={choices} />
      </section>
      <section aria-label="Categories" className={CARD}>
        <CategoryManager categories={categories} />
      </section>
      <ResourceList resources={resources} categories={choices} />
    </div>
  );
}
