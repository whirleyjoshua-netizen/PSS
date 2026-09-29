"use client";

import { useActionState, useState } from "react";
import {
  DOC_RESPONSES, isSingletonKind, templateKindLabel, TEMPLATE_KINDS, type DocResponse, type TemplateKind,
} from "@/lib/docs/kinds";
import { createTemplateAction, saveTemplateAction, type TemplateFormState } from "./actions";
import { DocEditor } from "./DocEditor";

const CONTROL = "min-h-11 border border-rule bg-ivory px-3 text-sm";

/**
 * New and edit share one form. The kind is chosen once, at creation; the server re-derives it on
 * save. Every field is controlled: React resets uncontrolled fields when a form action finishes,
 * which would wipe what the owner typed whenever the server refuses the template.
 */
export function TemplateForm({ template }: {
  template: { id: string; name: string; kind: TemplateKind; response: DocResponse; body: string } | null;
}) {
  const [state, action, pending] = useActionState<TemplateFormState, FormData>(template ? saveTemplateAction : createTemplateAction, {});
  const [name, setName] = useState(template?.name ?? "");
  const [kind, setKind] = useState<TemplateKind>(template?.kind ?? "service_agreement");
  const [response, setResponse] = useState<DocResponse>(template?.response ?? "sign");
  const singleton = isSingletonKind(kind);

  return (
    <form action={action} className="flex flex-col gap-4">
      {template ? <input type="hidden" name="id" value={template.id} /> : null}
      <div className="flex flex-wrap items-end gap-4">
        {template ? (
          <p className="text-sm">Kind: <span className="font-semibold">{templateKindLabel(template.kind)}</span></p>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            Kind
            <select name="kind" value={kind} onChange={(event) => setKind(event.target.value as TemplateKind)} className={CONTROL}>
              {TEMPLATE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
        )}
        <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm">
          Name
          <input name="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={CONTROL} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Client response
          <select name="response" value={singleton ? "view" : response} disabled={singleton}
            onChange={(event) => setResponse(event.target.value as DocResponse)} className={CONTROL}>
            {DOC_RESPONSES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
      </div>
      {singleton ? (
        <p className="text-sm text-ink-soft">
          {kind === "terms"
            ? "Contract terms print inside every contract. They can use the client's name, the project number, today's date and the company details."
            : "Guides appear on every client's project page at the right stage, so they can't use fields."}
        </p>
      ) : null}
      <DocEditor name="body" label="Text" defaultValue={template?.body ?? ""} mode="template" kind={kind}
        titleField="name" previewExtras={{ response: singleton ? "view" : response }} />
      {state.errors && state.errors.length > 0 ? (
        <ul aria-label="Template problems" className="flex flex-col gap-1 text-sm text-overdue">
          {state.errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      ) : null}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="min-h-11 bg-charcoal px-5 text-sm text-ivory">
          {template ? "Save template" : "Create template"}
        </button>
        {state.saved ? <p role="status" className="text-sm">Saved.</p> : null}
      </div>
    </form>
  );
}
