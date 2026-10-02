"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTACT_METHODS, CONTACT_NOTE_MAX } from "@/lib/admin/contact";
import { logContactAction } from "../contact-actions";
import type { FormState } from "../actions";

const CHIP = "flex min-h-11 items-center gap-2 border border-rule px-3 text-sm";

/** "Mark contacted": how the owners reached the client, logged on the job. Moves a New lead to Contacted. */
export function ContactLog({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [saves, setSaves] = useState(0);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const result = await logContactAction(jobId, prev, fd);
    if (result.ok) {
      setOpen(false);
      setSaves((n) => n + 1);
    }
    return result;
  }, {});
  const values = state.values;
  const picked = (key: string) => {
    const v = values?.methods;
    return Array.isArray(v) ? v.includes(key) : v === key;
  };

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="contact-open" className="flex min-h-11 items-center gap-2 text-sm font-semibold">
        <input id="contact-open" type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
        Mark contacted
      </label>
      {open ? (
        <form key={`${saves}:${values ? JSON.stringify(values) : "initial"}`} action={action} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {CONTACT_METHODS.map((m) => (
              <label key={m.key} htmlFor={`contact-${m.key}`} className={CHIP}>
                <input id={`contact-${m.key}`} type="checkbox" name="methods" value={m.key} defaultChecked={picked(m.key)} />
                {m.label}
              </label>
            ))}
          </div>
          <label htmlFor="contact-note" className="flex flex-col gap-2 text-sm">
            Note (optional)
            <input id="contact-note" name="note" type="text" maxLength={CONTACT_NOTE_MAX}
              defaultValue={typeof values?.note === "string" ? values.note : ""}
              className="min-h-11 w-full border border-rule bg-ivory px-4 py-3" />
          </label>
          <Button type="submit" variant="solid" disabled={pending}>Save</Button>
          {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
        </form>
      ) : saves > 0 ? (
        <p role="status" className="text-sm text-ink-soft">Contact saved</p>
      ) : null}
    </div>
  );
}
