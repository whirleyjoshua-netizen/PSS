import Link from "next/link";
import { after } from "next/server";
import { requireAdmin } from "@/lib/admin/session";
import { formatWhen } from "@/lib/admin/time";
import { pollReplies } from "@/lib/agents/mail";
import { getAgentSettings, listAgentCards, listNeedsYou, listRecentReplies, markRepliesSeen } from "@/lib/agents/store";
import { defaultSignature, emailFooter, type AgentItem } from "@/lib/agents/rules";
import { Markdown } from "@/components/admin/Markdown";
import { EmailCard } from "./EmailCard";
import { DecisionCard } from "./DecisionCard";
import { AgentCards } from "./AgentCards";
import { RecentReplies } from "./RecentReplies";

export const dynamic = "force-dynamic";

/** An email whose send started but was never recorded: nothing to approve, so no buttons. The reply poll settles it
 * from Sent Items (found = sent, missing = failed and retryable) once it is 15 minutes old. */
function UnknownStatusCard({ item, agentName }: { item: AgentItem; agentName: string }) {
  return (
    <article className="flex flex-col gap-2 border border-rule bg-ivory p-4" aria-label={`Email from ${agentName}: ${item.title}`}>
      <p className="text-xs uppercase tracking-wide text-ink-soft">{agentName} · email · status unknown</p>
      <h3 className="font-semibold">{item.title}</h3>
      <p role="alert" className="text-sm text-red-700">Status unknown: check Sent Items in Outlook.</p>
      <p className="text-sm text-ink-soft">
        Sending to {item.finalTo} started {formatWhen(item.updatedAt)} and never finished. The app checks Sent Items again on its own.{" "}
        <Link href={`/admin/agents/${item.agentSlug}/${item.id}`} className="underline underline-offset-4">See the email</Link>
      </p>
    </article>
  );
}

/** One place for every agent: what needs the owner first, then each agent, then replies. */
export default async function AgentsPage() {
  await requireAdmin();
  // After the response, so the page isn't slowed. Claim-gated: at most once per 2 minutes.
  after(async () => {
    try {
      await pollReplies();
    } catch (error) {
      console.error("Agent reply poll on page load failed", error);
    }
  });
  const [needs, agents, replies, settings] = await Promise.all([
    listNeedsYou(), listAgentCards(), listRecentReplies(10), getAgentSettings(),
  ]);
  // Read above, so this render still shows them as "new"; the next one won't.
  await markRepliesSeen();
  const names = new Map(agents.map((a) => [a.slug, a.name]));
  // Exactly the footer the send adds. The card posts it back, and the send refuses if it changed since.
  const footer = settings.mailingAddress ? emailFooter(settings.signature ?? defaultSignature(), settings.mailingAddress) : null;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Agents</h1>
        <Link href="/admin/settings#agents-heading" className="text-sm underline underline-offset-4">Agent settings</Link>
      </div>
      <section aria-labelledby="needs-heading" className="flex flex-col gap-3">
        <h2 id="needs-heading" className="text-lg font-semibold">Needs you {needs.length > 0 && `(${needs.length})`}</h2>
        {needs.length === 0 ? <p className="text-sm text-ink-soft">Nothing waiting on you.</p> : needs.map((item) =>
          item.kind === "email" && item.status === "approved"
            ? <UnknownStatusCard key={item.id} item={item} agentName={names.get(item.agentSlug) ?? item.agentSlug} />
            : item.kind === "email"
            ? <EmailCard key={item.id} item={item} agentName={names.get(item.agentSlug) ?? item.agentSlug} footer={footer} />
            : (
              <DecisionCard key={item.id} item={item} agentName={names.get(item.agentSlug) ?? item.agentSlug}>
                {item.bodyMd ? <Markdown source={item.bodyMd} /> : null}
              </DecisionCard>
            ),
        )}
      </section>
      <section aria-labelledby="agents-list-heading" className="flex flex-col gap-3">
        <h2 id="agents-list-heading" className="text-lg font-semibold">Your agents</h2>
        <AgentCards agents={agents} />
      </section>
      <section aria-labelledby="replies-heading" className="flex flex-col gap-3">
        <h2 id="replies-heading" className="text-lg font-semibold">Recent replies</h2>
        <RecentReplies replies={replies} />
      </section>
    </div>
  );
}
