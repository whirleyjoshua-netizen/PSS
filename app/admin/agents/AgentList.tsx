import Link from "next/link";
import type { AgentCard } from "@/lib/agents/store";
import { agentsHref } from "./links";

/** Every agent, with what needs the owner (waiting items and unseen replies) and a dot for unread reports. A column on large screens, a row of chips on phones. */
export function AgentList({ agents, selected }: { agents: AgentCard[]; selected: string }) {
  return (
    <nav aria-label="Agents" className="flex flex-wrap gap-2 lg:flex-col lg:flex-nowrap">
      {agents.map((a) => {
        const active = a.slug === selected;
        return (
          <Link
            key={a.slug}
            href={agentsHref({ agent: a.slug })}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm lg:rounded-none ${active ? "border-champagne bg-champagne/15 font-semibold" : "border-rule bg-ivory"}`}
          >
            <span className="min-w-0 flex-1 truncate">{a.name}</span>
            {/* Waiting items plus unseen replies: the chips add up to the nav badge. */}
            {a.needsYou > 0 && (
              <span aria-label={`${a.needsYou} need you`} className="rounded-full bg-charcoal px-2 text-xs font-semibold text-ivory">{a.needsYou}</span>
            )}
            {a.unreadReports > 0 && <span aria-label="unread reports" className="inline-block size-2 rounded-full bg-champagne" />}
          </Link>
        );
      })}
      <Link href="/admin/settings#agents-heading" className="flex items-center rounded-full border border-dashed border-rule px-3 py-2 text-sm text-ink-soft lg:rounded-none">
        + Add agent
      </Link>
    </nav>
  );
}
