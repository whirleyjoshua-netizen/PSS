import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/admin/Markdown";
import { requireAdmin } from "@/lib/admin/session";
import { formatWhen } from "@/lib/admin/time";
import { getAgent, getItem, listRepliesForItem, markRead } from "@/lib/agents/store";
import { isSendUnknown, type AgentItem } from "@/lib/agents/rules";

export const dynamic = "force-dynamic";

const EMAIL_HEADING: Record<string, string> = { pending: "Proposed email", failed: "Send failed", declined: "Declined email" };

/** To, Subject and Body for every email status. Sent (or mid-send) shows the exact composed text, footer included. */
function EmailText({ item, now }: { item: AgentItem; now: Date }) {
  const composed = item.status === "sent" || item.status === "approved";
  const to = item.finalTo ?? item.emailTo;
  const subject = item.finalSubject ?? item.emailSubject;
  const body = composed ? (item.sentBody ?? item.finalBody) : (item.finalBody ?? item.emailBody);
  return (
    <section aria-labelledby="email-heading" className="flex flex-col gap-2">
      <h2 id="email-heading" className="text-lg font-semibold">
        {item.status === "sent" ? `Sent to ${item.finalTo}${item.sentAt ? ` · ${formatWhen(item.sentAt)}` : ""}`
          : item.status === "approved" ? (isSendUnknown(item, now) ? "Status unknown: check Sent Items in Outlook" : "Sending…")
          : EMAIL_HEADING[item.status] ?? "Email"}
      </h2>
      {item.status === "failed" && item.error && <p role="alert" className="text-sm text-red-700">{item.error}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-ink-soft">To</dt><dd>{to}</dd>
        <dt className="text-ink-soft">Subject</dt><dd className="font-medium">{subject}</dd>
      </dl>
      <pre aria-label="Body" className="whitespace-pre-wrap border border-rule bg-ivory p-4 font-sans text-sm">{body}</pre>
    </section>
  );
}

/** One report, email or decision. Opening a report marks it read. An email shows its To, Subject and Body in every
 * status, and a sent email shows the exact text sent and its replies. */
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

      {item.kind === "email" && <EmailText item={item} now={new Date()} />}

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
