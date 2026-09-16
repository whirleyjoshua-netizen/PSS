"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { MESSAGE_MAX } from "@/lib/portal/message-limits";
import { sendMessageAction, type MessageFormState } from "./actions";

/** A double-click is not an error, so a throttled message says the same thing as a sent one. */
const THANKS = "Thanks — we have your message and will come back to you.";

export function MessageForm({
  jobId,
  messages,
}: {
  jobId: string;
  messages: { body: string; at: string }[];
}) {
  const [state, action, pending] = useActionState<MessageFormState, FormData>(
    sendMessageAction,
    { status: "idle" },
  );

  const thanks = state.status === "sent" || state.status === "throttled";

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="jobId" value={jobId} />
        <label htmlFor="message-body" className="text-sm text-ink-soft">
          Or send us a message about your project
        </label>
        <textarea
          id="message-body"
          name="body"
          rows={4}
          maxLength={MESSAGE_MAX}
          required
          // Remounts after a successful send so the box is empty for the next message, and
          // keeps what was typed when the message came back too long.
          key={`message-body-${state.sent ?? 0}`}
          defaultValue={state.status === "too-long" ? state.text : undefined}
          className="w-full max-w-full border border-rule bg-white p-3 text-base"
        />
        {state.status === "too-long" ? (
          <p role="alert" className="text-sm text-charcoal">
            That message is a little long. Please shorten it to {MESSAGE_MAX} characters or fewer.
          </p>
        ) : null}
        {state.status === "not-found" ? (
          <p role="alert" className="text-sm text-charcoal">
            We could not find that project. Please call us and we will sort it out.
          </p>
        ) : null}
        {thanks ? (
          <p role="status" className="border border-champagne bg-sand/60 p-4 text-sm">
            {THANKS}
          </p>
        ) : null}
        <Button type="submit" variant="solid" disabled={pending}>
          {pending ? "Sending…" : "Send message"}
        </Button>
      </form>

      {messages.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">
            Messages you have sent
          </h3>
          <ul className="flex flex-col divide-y divide-rule border-t border-rule">
            {messages.map((message, index) => (
              <li key={`${message.at}-${index}`} className="flex flex-col gap-1 py-3">
                <span className="text-sm text-ink-soft">{message.at}</span>
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
