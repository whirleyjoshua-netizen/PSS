"use client";

import { useState } from "react";
import type { PendingUpload, ResourceOption } from "@/lib/admin/task-file-rules";
import { discardPendingUploadAction } from "./file-actions";
import { FilePicker } from "./FilePicker";

type Held = { kind: "upload"; upload: PendingUpload } | { kind: "resource"; resource: ResourceOption };
const keyOf = (held: Held) => (held.kind === "upload" ? held.upload.pathname : held.resource.id);
const nameOf = (held: Held) => (held.kind === "upload" ? held.upload.name : held.resource.name);

/**
 * Files on the New task form, held until Add task saves them with the task in one statement.
 * The task's id is made here, so uploads can go under it before it exists. Its fields reach the
 * form through `form={formId}`: they live outside the form element, whose remount after an error
 * would otherwise drop them. Remounted (a fresh id, nothing held) after each task is added.
 */
export function NewTaskFiles({ formId, resources, onBusyChange }: {
  formId: string; resources: ResourceOption[]; onBusyChange: (busy: boolean) => void;
}) {
  const [taskId] = useState(() => crypto.randomUUID());
  const [held, setHeld] = useState<Held[]>([]);
  const add = (item: Held) => setHeld((all) => (all.some((h) => keyOf(h) === keyOf(item)) ? all : [...all, item]));
  const remove = (item: Held) => {
    setHeld((all) => all.filter((h) => keyOf(h) !== keyOf(item)));
    // Not saved yet, so nothing else has it: delete it now rather than leave it for the nightly sweep.
    if (item.kind === "upload") void discardPendingUploadAction(item.upload.pathname).catch(() => undefined);
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-semibold">Files</legend>
      <input type="hidden" form={formId} name="taskId" value={taskId} />
      {held.map((item) => (
        item.kind === "upload"
          ? <input key={keyOf(item)} type="hidden" form={formId} name="upload" value={JSON.stringify(item.upload)} />
          : <input key={keyOf(item)} type="hidden" form={formId} name="resourceId" value={item.resource.id} />
      ))}
      {held.length > 0 ? (
        <ul className="flex flex-col divide-y divide-rule border border-rule text-sm">
          {held.map((item) => (
            <li key={keyOf(item)} className="flex items-center justify-between gap-3 px-3 py-1">
              <span className="break-all">
                {nameOf(item)}
                {item.kind === "resource" ? <span className="text-ink-soft"> · From Resources</span> : null}
              </span>
              <button type="button" aria-label={`Remove ${nameOf(item)}`} className="min-h-11 shrink-0 px-3 underline underline-offset-4"
                onClick={() => remove(item)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <FilePicker
        taskId={taskId}
        resources={resources}
        attachedResourceIds={held.flatMap((h) => (h.kind === "resource" ? [h.resource.id] : []))}
        onUploaded={async (upload) => { add({ kind: "upload", upload }); return null; }}
        onPickResource={async (resource) => { add({ kind: "resource", resource }); return null; }}
        onBusyChange={onBusyChange}
        idPrefix="new-task-files"
      />
    </fieldset>
  );
}
