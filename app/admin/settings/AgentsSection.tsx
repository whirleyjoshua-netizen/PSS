import { Button } from "@/components/ui/Button";
import { formatDay } from "@/lib/admin/time";
import { removeSuppressionAction } from "./agent-actions";
import { AddSuppressionForm } from "./AgentForms";

type Suppression = { address: string; reason: string | null; source: string; createdAt: Date };

/**
 * Who we may never email (owner 2026-11-12: the agents are gone, the list stays). Unsubscribe links in
 * outreach already sent still add to it, so it is kept for anything that emails people in bulk later.
 */
export function DoNotContactSection({ suppressions }: { suppressions: Suppression[] }) {
  return (
    <section aria-labelledby="do-not-contact-heading" className="flex flex-col gap-3">
      <h2 id="do-not-contact-heading" className="text-lg font-semibold">
        Do not contact
      </h2>
      <p className="text-sm text-ink-soft">
        People who unsubscribed or asked us to stop, and anyone you add. Outreach email must never go to these addresses.
      </p>
      {suppressions.length === 0 ? (
        <p className="text-sm text-ink-soft">No one is on the do-not-contact list.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule border border-rule bg-ivory">
          {suppressions.map((entry) => (
            <li key={entry.address} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span>
                {entry.address}
                <span className="block text-ink-soft">
                  {entry.reason ?? (entry.source === "reply" ? "Asked to stop" : entry.source === "link" ? "Unsubscribed" : "Added by owner")} · {formatDay(entry.createdAt)}
                </span>
              </span>
              <form action={removeSuppressionAction.bind(null, entry.address)}>
                <Button type="submit" variant="outline" aria-label={`Remove ${entry.address}`}>
                  Remove
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <AddSuppressionForm />
    </section>
  );
}
