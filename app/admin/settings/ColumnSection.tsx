"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTROL } from "@/components/forms/Field";
import { createColumnKeyAction, disconnectColumnAction, type ColumnKeyState } from "./column-actions";

/**
 * Connects Column, the team's work app: it reads leads' contact details and stages, and the do-not-contact
 * list, and logs its calls and emails on leads' timelines. Owners only. The key is shown once here, then only its hash exists.
 */
export function ColumnSection({ connected, siteUrl }: { connected: { createdBy: string; since: string; lastUsed: string | null } | null; siteUrl: string }) {
  const [made, create, creating] = useActionState<ColumnKeyState, FormData>(createColumnKeyAction, {});
  const [gone, disconnect, disconnecting] = useActionState<ColumnKeyState, FormData>(disconnectColumnAction, {});
  const [confirm, setConfirm] = useState<"replace" | "disconnect" | null>(null);
  const [copied, setCopied] = useState(false);
  const live = !!connected && !gone.disconnected;
  const error = made.error ?? gone.error;

  async function copy(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-labelledby="column-heading" className="flex flex-col gap-3">
      <h2 id="column-heading" className="text-lg font-semibold">
        Column
      </h2>
      <p className="text-ink-soft">
        Lets Column read every lead&apos;s name, email, phone, address, stage and source, and the do-not-contact list, so it can
        build call lists and skip anyone who unsubscribed. Calls and emails logged in Column show up on the lead&apos;s
        timeline, and a call moves a New lead to Contacted. It can&apos;t change anything else here.
      </p>
      {live ? (
        <p className="text-sm text-ink-soft">
          Connected by {connected.createdBy} on {connected.since}. {connected.lastUsed ? `Last synced ${connected.lastUsed}.` : "Not synced yet."}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {confirm === null ? (
          <>
            {live ? (
              <>
                <Button type="button" variant="outline" onClick={() => setConfirm("replace")}>Replace key</Button>
                <Button type="button" variant="outline" onClick={() => setConfirm("disconnect")}>Disconnect</Button>
              </>
            ) : (
              <form action={create} onSubmit={() => setCopied(false)}>
                <Button type="submit" variant="outline" disabled={creating}>Connect Column</Button>
              </form>
            )}
          </>
        ) : (
          <>
            <form action={confirm === "replace" ? create : disconnect} onSubmit={() => { setConfirm(null); setCopied(false); }}>
              <Button type="submit" variant="solid" disabled={creating || disconnecting}>
                {confirm === "replace" ? "Yes, replace. The old key stops working" : "Yes, disconnect Column"}
              </Button>
            </form>
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
          </>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-overdue">{error}</p>
      ) : made.key && !gone.disconnected ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Column key"
              readOnly
              value={made.key}
              onFocus={(event) => event.currentTarget.select()}
              className={`${CONTROL} min-w-0 flex-1 font-mono text-xs`}
            />
            <Button type="button" variant="outline" onClick={() => copy(made.key!)}>{copied ? "Copied" : "Copy"}</Button>
          </div>
          <p role="status" className="text-sm text-ink-soft">
            Copy it now. It won&apos;t be shown again. In Column, open Settings → Connections → PSS admin and paste it, with the
            address <code className="break-all">{siteUrl}</code>.
          </p>
        </div>
      ) : gone.disconnected ? (
        <p role="status" className="text-sm text-ink-soft">Disconnected. Column can&apos;t read anything here now.</p>
      ) : null}
    </section>
  );
}
