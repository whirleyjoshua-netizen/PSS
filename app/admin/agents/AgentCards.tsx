import Link from "next/link";
import type { AgentCard } from "@/lib/agents/store";
import { formatWhen } from "@/lib/admin/time";

export function AgentCards({ agents }: { agents: AgentCard[] }) {
  if (agents.length === 0) return <p className="text-sm text-ink-soft">No agents yet. Add one in Settings → Agents.</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {agents.map((a) => (
        <li key={a.slug} className="flex flex-col gap-2 border border-rule bg-ivory p-4">
          <div className="flex items-baseline justify-between gap-2">
            <Link href={`/admin/agents/${a.slug}`} className="font-semibold underline-offset-4 hover:underline">{a.name}</Link>
            <span className="text-xs text-ink-soft">{a.role}</span>
          </div>
          <p className={`text-sm ${a.lastRunStatus === "failed" ? "text-red-700" : "text-ink-soft"}`}>
            {a.lastRunAt ? `${a.lastRunStatus === "failed" ? "⚠ Run failed" : "✓ Ran"} ${formatWhen(a.lastRunAt)}` : "Hasn't run yet"}
            {a.lastRunStatus === "failed" && a.lastRunNote ? `: ${a.lastRunNote}` : ""}
          </p>
          {a.newestReport ? (
            <Link href={`/admin/agents/${a.slug}/${a.newestReport.id}`} className="flex flex-col gap-1 text-sm">
              <span className="font-medium">
                {a.newestReport.status === "unread" && <span aria-label="unread" className="mr-1 inline-block size-2 rounded-full bg-champagne" />}
                {a.newestReport.title}
              </span>
              {a.newestReport.summary && <span className="text-ink-soft">{a.newestReport.summary}</span>}
            </Link>
          ) : <p className="text-sm text-ink-soft">No reports yet</p>}
          <p className="text-xs text-ink-soft">{a.pending} waiting on you · {a.unreadReports} unread</p>
          {!a.hasKey && <p className="text-xs text-red-700">No key yet: create one in Settings → Agents.</p>}
        </li>
      ))}
    </ul>
  );
}
