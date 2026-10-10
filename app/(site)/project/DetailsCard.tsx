import { PRODUCTION_ESTIMATE } from "@/content/business";
import { finishLabel } from "@/lib/leads/finish";
import { treatmentTypeLabels } from "@/lib/leads/treatment-types";
import type { ProjectSummary } from "@/lib/portal/access";

const term = "font-display text-xs uppercase tracking-[0.2em] text-champagne-ink";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-rule py-3">
      <dt className={term}>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** What the customer ordered. Never what it cost — see toProject's whitelist. */
export function DetailsCard({
  project,
  installLabel,
  inProduction,
}: {
  project: ProjectSummary;
  installLabel: string;
  inProduction: boolean;
}) {
  const treatments = treatmentTypeLabels(project.treatmentTypes);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="details-heading">
      <h2 id="details-heading" className={term}>Project details</h2>
      <dl className="grid gap-x-8 sm:grid-cols-2">
        <Row label="Windows">{project.windowCount ?? "We will confirm this when we measure."}</Row>
        <Row label="Treatments">{treatments.length > 0 ? treatments.join(", ") : "Being chosen with you"}</Row>
        <Row label="Finish">{project.finish ? finishLabel(project.finish) : "Being chosen with you"}</Row>
        <Row label="Installation">{installLabel}</Row>
        {inProduction ? <Row label="Production">{PRODUCTION_ESTIMATE}</Row> : null}
      </dl>
    </section>
  );
}
