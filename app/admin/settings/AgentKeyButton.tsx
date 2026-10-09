"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTROL } from "@/components/forms/Field";
import { createKeyAction, type KeyState } from "./agent-actions";

/** Creates or replaces an agent's key. The key is shown here once, then only its hash exists. */
export function AgentKeyButton({ slug, hasKey }: { slug: string; hasKey: boolean }) {
  const [state, action, working] = useActionState<KeyState, FormData>(createKeyAction.bind(null, slug), {});
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputId = `agent-key-${slug}`;

  async function copy(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form action={action} onSubmit={() => { setConfirming(false); setCopied(false); }} className="flex flex-wrap items-center gap-2">
        {!hasKey ? (
          <Button type="submit" variant="outline" disabled={working}>
            Create key
          </Button>
        ) : confirming ? (
          <>
            <Button type="submit" variant="solid" disabled={working}>
              Yes, replace. The old key stops working
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
            Replace key
          </Button>
        )}
      </form>
      {state.error ? (
        <p role="alert" className="text-sm text-overdue">
          {state.error}
        </p>
      ) : state.key ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={inputId}
              aria-label={`New key for ${slug}`}
              readOnly
              value={state.key}
              onFocus={(event) => event.currentTarget.select()}
              className={`${CONTROL} min-w-0 flex-1 font-mono text-xs`}
            />
            <Button type="button" variant="outline" onClick={() => copy(state.key!)}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p role="status" className="text-sm text-ink-soft">
            Copy it now. It won&apos;t be shown again. On the agents PC run:{" "}
            <code className="break-all">{`powershell -File C:\\Users\\whirl\\pss\\agents\\set-agent-key.ps1 -Slug ${slug}`}</code>{" "}
            and paste it.
          </p>
        </div>
      ) : null}
    </div>
  );
}
