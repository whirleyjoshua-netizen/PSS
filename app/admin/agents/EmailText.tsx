import { formatWhen } from "@/lib/admin/time";
import { isSendUnknown, type AgentItem } from "@/lib/agents/rules";

const EMAIL_HEADING: Record<string, string> = { pending: "Proposed email", failed: "Send failed", declined: "Declined email" };

/** To, Subject and Body for every email status. Sent (or mid-send) shows the exact composed text, footer included. */
export function EmailText({ item, now }: { item: AgentItem; now: Date }) {
  const composed = item.status === "sent" || item.status === "approved";
  const to = item.finalTo ?? item.emailTo;
  const subject = item.finalSubject ?? item.emailSubject;
  const body = composed ? (item.sentBody ?? item.finalBody) : (item.finalBody ?? item.emailBody);
  return (
    <section aria-labelledby="email-heading" className="flex flex-col gap-2">
      <h3 id="email-heading" className="text-lg font-semibold">
        {item.status === "sent" ? `Sent to ${item.finalTo}${item.sentAt ? ` · ${formatWhen(item.sentAt)}` : ""}`
          : item.status === "approved" ? (isSendUnknown(item, now) ? "Status unknown: check Sent Items in Outlook" : "Sending…")
          : EMAIL_HEADING[item.status] ?? "Email"}
      </h3>
      {item.status === "failed" && item.error && <p role="alert" className="text-sm text-red-700">{item.error}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-ink-soft">To</dt><dd className="break-all">{to}</dd>
        <dt className="text-ink-soft">Subject</dt><dd className="font-medium">{subject}</dd>
      </dl>
      <pre aria-label="Body" className="whitespace-pre-wrap break-words border border-rule bg-ivory p-4 font-sans text-sm">{body}</pre>
    </section>
  );
}
