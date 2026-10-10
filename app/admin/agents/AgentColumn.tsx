import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/Button";
import { formatWhen } from "@/lib/admin/time";
import { isSendUnknown, REPORT_TYPES, type AgentItem } from "@/lib/agents/rules";
import type { AgentCard, RecentReply } from "@/lib/agents/store";
import { refreshReplies } from "./actions";
import { DecisionCardActions, EmailCardActions } from "./CardActions";
import { agentsHref } from "./links";

const FILTERS: readonly { value: (typeof REPORT_TYPES)[number] | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "brief", label: "Brief" },
  { value: "other", label: "Other" },
];

const STATUS_LABEL: Record<string, string> = {
  approved: "Approved", sent: "Sent", declined: "Declined", answered: "Answered",
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function kindLabel(item: AgentItem, now: Date): string {
  if (item.kind === "report") return `${capital(item.reportType ?? "other")} report`;
  if (item.kind === "decision") return "Decision";
  if (item.status === "failed") return "Email · send failed";
  if (item.status === "approved") return isSendUnknown(item, now) ? "Email · status unknown" : "Email · sending";
  return "Email";
}

/** The card's first lines: the summary, or else the start of the body (the email as it stands, with the owner's edits),
 * with Markdown's emphasis and heading marks dropped and blank lines closed up. */
function excerpt(item: AgentItem): string | null {
  if (item.summary) return item.summary;
  const body = item.kind === "email" ? (item.finalBody ?? item.emailBody) : item.bodyMd?.replace(/[*#`>]+/g, "");
  return body ? body.replace(/\n\s*\n/g, "\n").trim() : null;
}

const frame = (selected: boolean) =>
  `flex flex-col gap-2 border bg-ivory p-4 ${selected ? "border-champagne ring-2 ring-champagne/60" : "border-rule"}`;

type Nav = { agent: string; type?: string; selectedId: string | null };

/** One item: kind, title, unread dot, a few lines, and buttons along the bottom. Expand opens it in the reading pane. */
function ItemCard({ item, nav, now }: { item: AgentItem; nav: Nav; now: Date }) {
  const selected = item.id === nav.selectedId;
  const expandHref = agentsHref({ agent: nav.agent, item: item.id, type: nav.type });
  const label = kindLabel(item, now);
  const text = excerpt(item);
  const unknown = item.kind === "email" && item.status === "approved" && isSendUnknown(item, now);
  return (
    <article aria-label={`${label}: ${item.title}`} aria-current={selected ? "true" : undefined} className={frame(selected)}>
      <p className="text-xs uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="font-semibold break-words">
        {item.status === "unread" && <span aria-label="unread" className="mr-2 inline-block size-2 rounded-full bg-champagne" />}
        {item.title}
      </p>
      {unknown && <p role="alert" className="text-sm text-red-700">Status unknown: check Sent Items in Outlook.</p>}
      {item.kind === "email" && item.status === "failed" && item.error && <p className="text-sm text-red-700">{item.error}</p>}
      {text && <p className="line-clamp-3 whitespace-pre-line break-words text-sm text-ink-soft">{text}</p>}
      <p className="text-xs text-ink-soft">{formatWhen(item.createdAt)}</p>
      {item.kind === "decision" && item.status === "pending" ? (
        <DecisionCardActions id={item.id} expandHref={expandHref} />
      ) : item.kind === "email" && (item.status === "pending" || item.status === "failed") ? (
        <EmailCardActions id={item.id} expandHref={expandHref} />
      ) : (
        <div><ButtonLink href={expandHref} variant="outline">Expand</ButtonLink></div>
      )}
    </article>
  );
}

/** A decided email or decision, as one compact row. */
function DoneRow({ item, nav }: { item: AgentItem; nav: Nav }) {
  const selected = item.id === nav.selectedId;
  const what = item.kind === "email" ? "Email" : "Decision";
  const status = item.kind === "email" && item.status === "approved" ? "Sending" : STATUS_LABEL[item.status] ?? item.status;
  return (
    <li aria-label={`${what}: ${item.title}`} aria-current={selected ? "true" : undefined}
      className={`flex flex-wrap items-baseline justify-between gap-2 p-3 ${selected ? "bg-champagne/15 ring-2 ring-inset ring-champagne/60" : ""}`}>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-medium break-words">{item.title}</span>
        <span className="text-xs text-ink-soft">{what} · {status} · {formatWhen(item.sentAt ?? item.decidedAt ?? item.createdAt)}</span>
      </div>
      <Link href={agentsHref({ agent: nav.agent, item: item.id, type: nav.type })} className="text-sm underline underline-offset-4">Expand</Link>
    </li>
  );
}

function Group({ id, title, count, children }: { id: string; title: string; count?: number; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-lg font-semibold">{title}{count ? ` (${count})` : ""}</h3>
      {children}
    </section>
  );
}

const empty = (text: string) => <p className="text-sm text-ink-soft">{text}</p>;

/** The selected agent: its run status, then what waits on the owner, its reports, what's done, and replies. */
export function AgentColumn({ agent, waiting, reports, done, replies, picked, selectedId, now }: {
  agent: AgentCard; waiting: AgentItem[]; reports: AgentItem[]; done: AgentItem[]; replies: RecentReply[];
  picked: string | undefined; selectedId: string | null; now: Date;
}) {
  const nav: Nav = { agent: agent.slug, type: picked, selectedId };
  const failed = agent.lastRunStatus === "failed";
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{agent.name}</h2>
        <p className="text-sm text-ink-soft">{agent.role}</p>
        <p className={`text-sm ${failed ? "text-red-700" : "text-ink-soft"}`}>
          {agent.lastRunAt ? `${failed ? "⚠ Run failed" : "✓ Ran"} ${formatWhen(agent.lastRunAt)}` : "Hasn't run yet"}
          {failed && agent.lastRunNote ? `: ${agent.lastRunNote}` : ""}
        </p>
        {!agent.hasKey && <p className="text-sm text-red-700">No key yet: create one in Settings → Agents.</p>}
      </header>

      <Group id="waiting-heading" title="Waiting on you" count={waiting.length}>
        {waiting.length === 0 ? empty("Nothing waiting on you.") : waiting.map((item) => <ItemCard key={item.id} item={item} nav={nav} now={now} />)}
      </Group>

      <Group id="reports-heading" title="Reports">
        <nav aria-label="Report type" className="flex flex-wrap gap-2 text-sm">
          {FILTERS.map(({ value, label }) => {
            const active = value === picked;
            return (
              <Link
                key={label}
                href={agentsHref({ agent: agent.slug, item: selectedId ?? undefined, type: value })}
                aria-current={active ? "page" : undefined}
                className={`rounded-full border px-3 py-1 ${active ? "border-champagne bg-champagne/15 font-semibold" : "border-rule"}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        {reports.length === 0 ? empty(`No reports${picked ? " of this type" : ""} yet.`) : reports.map((item) => <ItemCard key={item.id} item={item} nav={nav} now={now} />)}
      </Group>

      <Group id="done-heading" title="Done">
        {done.length === 0 ? empty("Nothing decided yet.") : (
          <ul className="flex flex-col divide-y divide-rule border border-rule bg-ivory">
            {done.map((item) => <DoneRow key={item.id} item={item} nav={nav} />)}
          </ul>
        )}
      </Group>

      <Group id="replies-heading" title="Replies">
        <form action={refreshReplies}>
          <Button type="submit" variant="outline">Check for replies</Button>
        </form>
        {replies.length === 0 ? empty("No replies yet.") : replies.map((r) => (
          <article key={r.id} aria-label={`Reply from ${r.from}`} className={frame(false)}>
            <p className="flex flex-wrap items-baseline gap-2 text-sm">
              {!r.seen && <span className="rounded-full bg-champagne px-2 text-xs font-semibold text-charcoal">new</span>}
              <span className="font-medium break-all">{r.from}</span>
              <span className="text-xs text-ink-soft">{formatWhen(r.receivedAt)}</span>
            </p>
            <p className="text-sm font-semibold break-words">{r.itemTitle}</p>
            <p className="line-clamp-3 whitespace-pre-line break-words text-sm text-ink-soft">{r.bodyText}</p>
            <div><ButtonLink href={agentsHref({ agent: agent.slug, item: r.itemId, type: picked })} variant="outline">Expand</ButtonLink></div>
          </article>
        ))}
      </Group>
    </div>
  );
}
