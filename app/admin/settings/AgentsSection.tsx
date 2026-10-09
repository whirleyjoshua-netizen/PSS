import { Button } from "@/components/ui/Button";
import { defaultSignature, type Agent } from "@/lib/agents/rules";
import { formatDay } from "@/lib/admin/time";
import { removeSuppressionAction } from "./agent-actions";
import { AgentKeyButton } from "./AgentKeyButton";
import { AddAgentForm, AddSuppressionForm, AgentSettingsForm } from "./AgentForms";

type Suppression = { address: string; reason: string | null; source: string; createdAt: Date };

/** The AI agents: their keys, what every outreach email carries, and who they may never email. */
export function AgentsSection({
  agents,
  settings,
  suppressions,
}: {
  agents: Agent[];
  settings: { mailingAddress: string | null; signature: string | null };
  suppressions: Suppression[];
}) {
  return (
    <section aria-labelledby="agents-heading" className="flex flex-col gap-3">
      <h2 id="agents-heading" className="text-lg font-semibold">
        Agents
      </h2>
      {agents.length === 0 ? (
        <p className="text-ink-soft">No agents yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule border border-rule bg-ivory">
          {agents.map((agent) => (
            <li key={agent.slug} className="flex flex-col gap-2 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <span className="font-semibold">{agent.name}</span>
                  <span className="text-ink-soft"> · {agent.slug}</span>
                  {agent.role ? <span className="block text-ink-soft">{agent.role}</span> : null}
                </span>
                <span className="text-ink-soft">
                  {agent.hasKey ? "Key set" : "No key yet"} · {agent.dailySendCap} emails a day
                  {agent.statsAccess ? " · reads counts" : ""}
                </span>
              </div>
              <AgentKeyButton slug={agent.slug} hasKey={agent.hasKey} />
            </li>
          ))}
        </ul>
      )}
      <AddAgentForm />

      <h3 className="mt-2 font-semibold">Outreach email</h3>
      <AgentSettingsForm
        mailingAddress={settings.mailingAddress}
        signature={settings.signature}
        defaultSignature={defaultSignature()}
      />

      <h3 className="mt-2 font-semibold">Do not contact</h3>
      <p className="text-sm text-ink-soft">
        Agents can never email these addresses. Anyone who replies asking to stop is added automatically.
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
                  {entry.reason ?? (entry.source === "reply" ? "Asked to stop" : "Added by owner")} · {formatDay(entry.createdAt)}
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
