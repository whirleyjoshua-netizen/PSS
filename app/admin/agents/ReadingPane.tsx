import { Markdown } from "@/components/admin/Markdown";
import { formatWhen } from "@/lib/admin/time";
import { isSendUnknown, retryAvailableAt, type AgentItem } from "@/lib/agents/rules";
import type { ItemReply } from "@/lib/agents/store";
import { EmailCard } from "./EmailCard";
import { EmailText } from "./EmailText";
import { DecisionForm, ReportNoteForm } from "./ResponseForms";

const DECIDED: Record<string, string> = { approved: "Approved", declined: "Declined", answered: "Answered" };

function Response({ children }: { children: React.ReactNode }) {
  return (
    <section aria-labelledby="response-heading" className="flex flex-col gap-3 border-t border-rule pt-4">
      <h3 id="response-heading" className="text-lg font-semibold">My response</h3>
      {children}
    </section>
  );
}

/** `sent` adds when the note was sent: a report's note is the whole response, so its time matters. */
const YourNote = ({ item, sent = false }: { item: AgentItem; sent?: boolean }) =>
  item.ownerNote ? (
    <p className="whitespace-pre-wrap text-sm text-ink-soft">
      Your note: {item.ownerNote}{sent && item.decidedAt ? ` (sent ${formatWhen(item.decidedAt)})` : ""}
    </p>
  ) : null;

function Header({ item, what }: { item: AgentItem; what: string }) {
  return (
    <header className="flex flex-col gap-1">
      <p className="text-xs uppercase tracking-wide text-ink-soft">{what} · {formatWhen(item.createdAt)}</p>
      <h2 id="pane-title" className="text-2xl font-semibold">{item.title}</h2>
      {item.summary && <p className="text-sm text-ink-soft">{item.summary}</p>}
      {item.reason && <p className="text-sm text-ink-soft">Why: {item.reason}</p>}
    </header>
  );
}

/** The selected item in full, with My response under it. Pending and failed emails use the full EmailCard: sending
 * happens only here, where the whole editable email and its footer are on screen. */
export function ReadingPane({ item, agentName, footer, replies, now }: {
  item: AgentItem; agentName: string; footer: string | null; replies: ItemReply[]; now: Date;
}) {
  if (item.kind === "email" && (item.status === "pending" || item.status === "failed")) {
    return <EmailCard key={item.id} item={item} agentName={agentName} footer={footer} retryAt={retryAvailableAt(item, now)} />;
  }
  if (item.kind === "report") {
    return (
      <article aria-labelledby="pane-title" className="flex flex-col gap-4">
        <Header item={item} what={`${item.reportType ?? "other"} report`} />
        {item.bodyMd && <Markdown source={item.bodyMd} />}
        <Response>
          <YourNote item={item} sent />
          {/* Keyed by the item only: a new key on save would remount the form and lose its "Sent" message. After a save,
             React resets the form to its default, which is then the note just sent. */}
          <ReportNoteForm key={item.id} item={item} agentName={agentName} />
        </Response>
      </article>
    );
  }
  if (item.kind === "decision") {
    return (
      <article aria-labelledby="pane-title" className="flex flex-col gap-4">
        <Header item={item} what="decision" />
        {item.bodyMd && <Markdown source={item.bodyMd} />}
        <Response>
          {item.status === "pending" ? <DecisionForm key={item.id} item={item} agentName={agentName} /> : (
            <>
              <p className="text-sm font-medium">{DECIDED[item.status] ?? item.status}{item.decidedAt ? ` · ${formatWhen(item.decidedAt)}` : ""}</p>
              <YourNote item={item} />
            </>
          )}
        </Response>
      </article>
    );
  }
  // An email that was sent, declined, or claimed for sending (still sending, or status unknown): nothing to act on.
  const unknown = item.status === "approved" && isSendUnknown(item, now);
  return (
    <article aria-labelledby="pane-title" className="flex flex-col gap-4">
      <Header item={item} what={unknown ? "email · status unknown" : "email"} />
      {unknown && (
        <p className="text-sm text-ink-soft">
          Sending to {item.finalTo} started {formatWhen(item.decidedAt ?? item.updatedAt)} and never finished. The app checks Outlook again on its own.
        </p>
      )}
      <YourNote item={item} />
      <EmailText item={item} now={now} />
      {item.status === "sent" && (
        <section aria-labelledby="item-replies-heading" className="flex flex-col gap-2">
          <h3 id="item-replies-heading" className="text-lg font-semibold">Replies</h3>
          {replies.length === 0 ? (
            <p className="text-sm text-ink-soft">No replies yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {replies.map((r, i) => (
                <li key={i} className="flex flex-col gap-1 border border-rule bg-ivory p-4">
                  <p className="text-sm"><span className="font-medium break-all">{r.from}</span> <span className="text-xs text-ink-soft">{formatWhen(r.receivedAt)}</span></p>
                  {r.subject && <p className="text-sm text-ink-soft">{r.subject}</p>}
                  <p className="whitespace-pre-wrap break-words text-sm">{r.bodyText}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </article>
  );
}
