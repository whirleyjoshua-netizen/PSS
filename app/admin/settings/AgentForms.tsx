"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTROL, Label } from "@/components/forms/Field";
import { addAgentAction, addSuppressionAction, saveAgentSettingsAction, type FormState } from "./agent-actions";

function Result({ state, ok, errorId }: { state: FormState; ok: string; errorId?: string }) {
  if (state.error)
    return (
      <p id={errorId} role="alert" className="text-sm text-overdue">
        {state.error}
      </p>
    );
  if (state.ok)
    return (
      <p role="status" className="text-sm text-ink-soft">
        {ok}
      </p>
    );
  return null;
}

/** Adds an agent with no key yet; the key comes from its row once it exists. */
export function AddAgentForm() {
  const [state, action, adding] = useActionState<FormState, FormData>(addAgentAction, {});
  return (
    <form action={action} className="flex flex-col gap-3 border border-rule bg-ivory p-4">
      <h3 className="font-semibold">Add an agent</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="agent-slug">Agent slug</Label>
          <input id="agent-slug" name="slug" required autoComplete="off" placeholder="scout" className={CONTROL} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="agent-name">Agent name</Label>
          <input id="agent-name" name="name" required autoComplete="off" className={CONTROL} />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="agent-role">Agent role</Label>
          <input id="agent-role" name="role" autoComplete="off" className={CONTROL} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="agent-cap">Daily email limit</Label>
          <input id="agent-cap" name="dailySendCap" type="number" min={0} max={50} defaultValue={10} required className={CONTROL} />
        </div>
        <label className="flex items-center gap-2 self-end pb-3 text-sm">
          <input type="checkbox" name="statsAccess" className="size-4" />
          Can read business counts
        </label>
      </div>
      <div>
        <Button type="submit" variant="outline" disabled={adding}>
          Add agent
        </Button>
      </div>
      <Result state={state} ok="Agent added. Create its key above." />
    </form>
  );
}

/** Every outreach email carries the signature and the mailing address. No address, no sending. */
export function AgentSettingsForm({
  mailingAddress,
  signature,
  defaultSignature,
}: {
  mailingAddress: string | null;
  signature: string | null;
  defaultSignature: string;
}) {
  const [state, action, saving] = useActionState<FormState, FormData>(saveAgentSettingsAction, {});
  return (
    // Remount on a new saved value, so the boxes show what was stored (trimmed), not what was typed.
    <form key={`${mailingAddress ?? ""}|${signature ?? ""}`} action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="agent-mailing-address">Mailing address</Label>
        <textarea
          id="agent-mailing-address"
          name="mailingAddress"
          rows={2}
          maxLength={300}
          defaultValue={mailingAddress ?? ""}
          aria-describedby="agent-mailing-address-hint"
          className={CONTROL}
        />
        <p id="agent-mailing-address-hint" className="text-sm text-ink-soft">
          Printed at the foot of every outreach email. It is required before any email can be sent.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="agent-signature">Email signature</Label>
        <textarea
          id="agent-signature"
          name="signature"
          rows={3}
          maxLength={500}
          defaultValue={signature ?? ""}
          aria-describedby="agent-signature-hint"
          className={CONTROL}
        />
        <p id="agent-signature-hint" className="whitespace-pre-line text-sm text-ink-soft">
          {`Leave blank to use the default:\n${defaultSignature}`}
        </p>
      </div>
      <div>
        <Button type="submit" disabled={saving}>
          Save
        </Button>
      </div>
      <Result state={state} ok="Saved." />
    </form>
  );
}

export function AddSuppressionForm() {
  const [state, action, adding] = useActionState<FormState, FormData>(addSuppressionAction, {});
  return (
    <>
      <form key={String(state.ok ?? "form")} action={action} className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-2">
          <Label htmlFor="suppression-address">Address to block</Label>
          <input
            id="suppression-address"
            name="address"
            type="email"
            autoComplete="off"
            required
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "suppression-address-error" : undefined}
            className={CONTROL}
          />
        </div>
        <Button type="submit" variant="outline" disabled={adding}>
          Add to list
        </Button>
      </form>
      <Result state={state} ok="Added. Agents can't email this address." errorId="suppression-address-error" />
    </>
  );
}
