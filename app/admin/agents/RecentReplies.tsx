import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { RecentReply } from "@/lib/agents/store";
import { formatWhen } from "@/lib/admin/time";
import { refreshReplies } from "./actions";

/** Replies to emails the agents sent. Unseen ones are marked "new" on the render that shows them. */
export function RecentReplies({ replies }: { replies: RecentReply[] }) {
  return (
    <div className="flex flex-col gap-3">
      <form action={refreshReplies}>
        <Button type="submit" variant="outline">Check for replies</Button>
      </form>
      {replies.length === 0 ? (
        <p className="text-sm text-ink-soft">No replies yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {replies.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 border border-rule bg-ivory p-4">
              <p className="flex flex-wrap items-baseline gap-2 text-sm">
                {!r.seen && <span className="rounded-full bg-champagne px-2 text-xs font-semibold text-charcoal">new</span>}
                <span className="font-medium">{r.from}</span>
                <span className="text-xs text-ink-soft">{formatWhen(r.receivedAt)}</span>
              </p>
              <Link href={`/admin/agents/${r.agentSlug}/${r.itemId}`} className="text-sm underline underline-offset-4">{r.itemTitle}</Link>
              <p className="whitespace-pre-wrap text-sm text-ink-soft">
                {r.bodyText.length > 300 ? `${r.bodyText.slice(0, 300)}…` : r.bodyText}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
