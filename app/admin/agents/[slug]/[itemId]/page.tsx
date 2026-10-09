import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/admin/Markdown";
import { requireAdmin } from "@/lib/admin/session";
import { formatWhen } from "@/lib/admin/time";
import { getAgent, getItem, listRepliesForItem, markRead } from "@/lib/agents/store";

export const dynamic = "force-dynamic";

/** One report, email or decision. Opening a report marks it read; a sent email shows the exact text sent and its replies. */
export default async function AgentItemPage({ params }: { params: Promise<{ slug: string; itemId: string }> }) {
  await requireAdmin();
  const { slug, itemId } = await params;
  const item = await getItem(itemId);
  if (!item || item.agentSlug !== slug) notFound();
  const sent = item.kind === "email" && item.status === "sent";
  const [agent, replies] = await Promise.all([getAgent(slug), sent ? listRepliesForItem(item.id) : Promise.resolve([])]);
  if (item.kind === "report") await markRead(item.id);
  const what = item.kind === "report" ? `${item.reportType ?? "other"} report` : item.kind;

  return (
    <article className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={`/admin/agents/${slug}`} className="text-sm underline underline-offset-4">← {agent?.name ?? slug}</Link>
        <h1 className="text-2xl font-semibold">{item.title}</h1>
        <p className="text-xs uppercase tracking-wide text-ink-soft">{what} · {formatWhen(item.createdAt)}</p>
        {item.summary && <p className="text-sm text-ink-soft">{item.summary}</p>}
        {item.reason && <p className="text-sm text-ink-soft">Why: {item.reason}</p>}
        {item.ownerNote && <p className="text-sm text-ink-soft">Your note: {item.ownerNote}</p>}
      </div>

      {item.bodyMd && <Markdown source={item.bodyMd} />}

      {sent && (
        <section aria-labelledby="sent-heading" className="flex flex-col gap-2">
          <h2 id="sent-heading" className="text-lg font-semibold">
            Sent to {item.finalTo}{item.sentAt ? ` · ${formatWhen(item.sentAt)}` : ""}
          </h2>
          {item.finalSubject && <p className="text-sm font-medium">{item.finalSubject}</p>}
          <pre className="whitespace-pre-wrap border border-rule bg-ivory p-4 font-sans text-sm">{item.sentBody}</pre>
        </section>
      )}

      {sent && (
        <section aria-labelledby="item-replies-heading" className="flex flex-col gap-2">
          <h2 id="item-replies-heading" className="text-lg font-semibold">Replies</h2>
          {replies.length === 0 ? (
            <p className="text-sm text-ink-soft">No replies yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {replies.map((r, i) => (
                <li key={i} className="flex flex-col gap-1 border border-rule bg-ivory p-4">
                  <p className="text-sm"><span className="font-medium">{r.from}</span> <span className="text-xs text-ink-soft">{formatWhen(r.receivedAt)}</span></p>
                  {r.subject && <p className="text-sm text-ink-soft">{r.subject}</p>}
                  <p className="whitespace-pre-wrap text-sm">{r.bodyText}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </article>
  );
}
