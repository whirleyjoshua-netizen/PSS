import Link from "next/link";
import { requireAdmin } from "@/lib/admin/session";
import { getAgentSettings, listAgentCards, listNeedsYou, listRecentReplies, markRepliesSeen } from "@/lib/agents/store";
import { composeEmailBody, defaultSignature } from "@/lib/agents/rules";
import { Markdown } from "@/components/admin/Markdown";
import { EmailCard } from "./EmailCard";
import { DecisionCard } from "./DecisionCard";
import { AgentCards } from "./AgentCards";
import { RecentReplies } from "./RecentReplies";

export const dynamic = "force-dynamic";

/** One place for every agent: what needs the owner first, then each agent, then replies. */
export default async function AgentsPage() {
  await requireAdmin();
  const [needs, agents, replies, settings] = await Promise.all([
    listNeedsYou(), listAgentCards(), listRecentReplies(10), getAgentSettings(),
  ]);
  // Read above, so this render still shows them as "new"; the next one won't.
  await markRepliesSeen();
  const names = new Map(agents.map((a) => [a.slug, a.name]));
  // The same composeEmailBody the send uses, with an empty body, is exactly the footer that gets added.
  const footer = settings.mailingAddress
    ? composeEmailBody("", settings.signature ?? defaultSignature(), settings.mailingAddress).trimStart()
    : null;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Agents</h1>
        <Link href="/admin/settings#agents-heading" className="text-sm underline underline-offset-4">Agent settings</Link>
      </div>
      <section aria-labelledby="needs-heading" className="flex flex-col gap-3">
        <h2 id="needs-heading" className="text-lg font-semibold">Needs you {needs.length > 0 && `(${needs.length})`}</h2>
        {needs.length === 0 ? <p className="text-sm text-ink-soft">Nothing waiting on you.</p> : needs.map((item) =>
          item.kind === "email"
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
