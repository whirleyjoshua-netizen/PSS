"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { createDocumentAction } from "./document-actions";
import { ACTION_LINK } from "./ui";

export function CreateDocumentForm({ jobId, templates }: { jobId: string; templates: { id: string; name: string; kindLabel: string }[] }) {
  const [state, action, pending] = useActionState<{ error?: string }, FormData>(createDocumentAction, {});
  // Not <form action>: React resets a form after its action runs, which would put the select back
  // on the first template after a refusal, and the next click would create that one instead.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <label className="flex flex-col gap-1 text-sm">
        Template
        <select name="templateId" required className="min-h-11 border border-rule bg-ivory px-2">
          {templates.map((t) => <option key={t.id} value={t.id}>{`${t.name} (${t.kindLabel})`}</option>)}
        </select>
      </label>
      <button type="submit" disabled={pending} className={ACTION_LINK}>Create document</button>
      {state.error ? <p role="alert" className="basis-full text-sm text-overdue">{state.error}</p> : null}
    </form>
  );
}
