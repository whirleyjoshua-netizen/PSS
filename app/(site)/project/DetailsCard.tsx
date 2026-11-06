import { PRODUCTION_ESTIMATE } from "@/content/business";
import { treatmentTypeLabels } from "@/lib/leads/treatment-types";
import type { ProjectSummary } from "@/lib/portal/access";
import type { OrderLine } from "@/lib/portal/order";

const term = "font-display text-xs uppercase tracking-[0.2em] text-champagne-ink";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-rule py-3">
      <dt className={term}>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Windows from the order: the lines with a room. Accessories have none. Only a fallback, since a shutter line's
 * quantity can count panels: the owner's own exact count wins.
 */
export const orderWindowCount = (order: OrderLine[]): number =>
  order.filter((line) => line.room !== "Accessory").reduce((sum, line) => sum + line.qty, 0);

/**
 * What the customer ordered. Never what it cost — see toProject's whitelist and signedOrder's.
 * Once a contract is signed, the signed quote's lines replace the treatment answers (owner 2026-11-05).
 * There is no Finish row: the questionnaire stopped asking, so it only ever said "Being chosen with you".
 */
export function DetailsCard({
  project,
  installLabel,
  inProduction,
  order = [],
}: {
  project: ProjectSummary;
  installLabel: string;
  inProduction: boolean;
  order?: OrderLine[];
}) {
  const treatments = treatmentTypeLabels(project.treatmentTypes);
  const ordered = order.length > 0;
  const windows = project.windowCount ?? (ordered ? orderWindowCount(order) || null : null);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="details-heading">
      <h2 id="details-heading" className={term}>Project details</h2>
      <dl className="grid gap-x-8 sm:grid-cols-2">
        <Row label="Windows">{windows ?? "We will confirm this when we measure."}</Row>
        {ordered ? null : <Row label="Treatments">{treatments.length > 0 ? treatments.join(", ") : "Being chosen with you"}</Row>}
        <Row label="Installation">{installLabel}</Row>
        {inProduction ? <Row label="Production">{PRODUCTION_ESTIMATE}</Row> : null}
      </dl>
      {ordered ? (
        <div className="flex flex-col gap-2">
          <h3 className={term}>Your order</h3>
          <ul className="flex flex-col divide-y divide-rule border-t border-rule">
            {order.map((line, index) => (
              <li key={index} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-3 sm:grid-cols-[12rem_1fr_auto]">
                <span className="text-ink-soft">{line.room}</span>
                <span className="col-start-1 sm:col-start-2">{line.product}</span>
                <span className="col-start-2 row-start-1 row-span-2 self-center sm:col-start-3 sm:row-span-1" aria-label={`Quantity ${line.qty}`}>×{line.qty}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
