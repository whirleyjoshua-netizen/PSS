import Link from "next/link";
import { after } from "next/server";
import { requireAdmin } from "@/lib/admin/session";
import { isUuid } from "@/lib/admin/ids";
import { pollReplies } from "@/lib/agents/mail";
import {
  getAgentSettings, getItem, listAgentCards, listItems, listNeedsYou, listRecentReplies, listRepliesForItem, markRead,
  markRepliesSeen,
} from "@/lib/agents/store";
import { defaultSignature, emailFooter, REPORT_TYPES } from "@/lib/agents/rules";
import { AgentColumn } from "./AgentColumn";
import { AgentList } from "./AgentList";
import { ReadingPane } from "./ReadingPane";
import { agentsHref } from "./links";

export const dynamic = "force-dynamic";

type Search = { agent?: string | string[]; item?: string | string[]; type?: string | string[] };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const LIMIT = 30;

/** Every agent on one page: the agent list, the selected agent's items, and the selected item in a reading pane.
 * All of it is URL state (?agent, ?item, ?type), so a link or bookmark opens exactly this view. */
export default async function AgentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  // After the response, so the page isn't slowed. Claim-gated: at most once per 2 minutes.
  after(async () => {
    try {
      await pollReplies();
    } catch (error) {
      console.error("Agent reply poll on page load failed", error);
    }
  });
  const search = await searchParams;
  const itemId = one(search.item);
  // Only a known type reaches the query; anything else shows everything.
  const picked = REPORT_TYPES.find((t) => t === one(search.type));
  const [agents, needs, settings, requested] = await Promise.all([
    listAgentCards(), listNeedsYou(), getAgentSettings(), itemId && isUuid(itemId) ? getItem(itemId) : Promise.resolve(null),
  ]);

  // The asked-for agent, else the first (by name) with something waiting on the owner, else the first.
  const agent = agents.find((a) => a.slug === one(search.agent)) ?? agents.find((a) => a.pending > 0) ?? agents[0];
  const header = (
    <div className="flex items-baseline justify-between">
      <h1 className="text-2xl font-semibold">Agents</h1>
      <Link href="/admin/settings#agents-heading" className="text-sm underline underline-offset-4">Agent settings</Link>
    </div>
  );
  if (!agent) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="text-sm text-ink-soft">No agents yet. Add one in Settings → Agents.</p>
      </div>
    );
  }

  // An item from another agent is ignored, so the reading pane only ever shows one of the selected agent's items.
  let item = requested && requested.agentSlug === agent.slug ? requested : null;
  if (item?.kind === "report") {
    // Opening a report marks it read. Before the lists load, so they show it read.
    await markRead(item.id);
    if (item.status === "unread") {
      item = { ...item, status: "read" };
      agent.unreadReports = Math.max(0, agent.unreadReports - 1);
    }
  }
  const [all, typed, replies, itemReplies] = await Promise.all([
    listItems(agent.slug),
    picked ? listItems(agent.slug, picked) : Promise.resolve(null),
    listRecentReplies(agent.slug, 10),
    item?.kind === "email" && item.status === "sent" ? listRepliesForItem(item.id) : Promise.resolve([]),
  ]);
  // Read above, so this render still shows them as "new"; the next one won't. Only this agent's: the others stay new.
  await markRepliesSeen(agent.slug);

  const now = new Date();
  const waiting = needs.filter((i) => i.agentSlug === agent.slug);
  const waitingIds = new Set(waiting.map((i) => i.id));
  const reports = (typed ?? all).filter((i) => i.kind === "report").slice(0, LIMIT);
  // Decided emails and decisions. An email mid-send ("Sending…") is here too, until it is sent or needs the owner.
  const done = all
    .filter((i) => i.kind !== "report" && !waitingIds.has(i.id) && i.status !== "pending" && i.status !== "failed")
    .slice(0, LIMIT);
  // Exactly the footer the send adds. The email form posts it back, and the send refuses if it changed since.
  const footer = settings.mailingAddress ? emailFooter(settings.signature ?? defaultSignature(), settings.mailingAddress) : null;

  return (
    <div className="flex flex-col gap-6">
      {header}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[10rem_minmax(18rem,26rem)_minmax(0,1fr)] lg:items-start">
        {/* On a phone an open item takes the whole screen, with a link back above it. */}
        <div className={item ? "hidden lg:block" : ""}>
          <AgentList agents={agents} selected={agent.slug} />
        </div>
        <div className={`min-w-0 ${item ? "hidden lg:block" : ""}`}>
          <AgentColumn agent={agent} waiting={waiting} reports={reports} done={done} replies={replies} picked={picked} selectedId={item?.id ?? null} now={now} />
        </div>
        <div className={`min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto ${item ? "" : "hidden lg:block"}`}>
          {item ? (
            <div className="flex flex-col gap-4">
              <Link href={agentsHref({ agent: agent.slug, type: picked })} className="text-sm underline underline-offset-4 lg:hidden">← {agent.name}</Link>
              <ReadingPane item={item} agentName={agent.name} footer={footer} replies={itemReplies} now={now} />
            </div>
          ) : (
            <p className="border border-dashed border-rule p-6 text-sm text-ink-soft">Pick an item to read it here.</p>
          )}
        </div>
      </div>
    </div>
  );
}
