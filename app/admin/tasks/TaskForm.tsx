"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTROL, Label } from "@/components/forms/Field";
import { displayName, TASK_NOTES_MAX, TASK_STATUSES, TASK_TITLE_MAX } from "@/lib/admin/task-rules";
import type { ResourceOption } from "@/lib/admin/task-file-rules";
import type { TaskFormState, TaskFormValues } from "./actions";
import { NewTaskFiles } from "./NewTaskFiles";

/**
 * New task and edit task. `people` must include the current assignee, even one who lost access;
 * `noAccess` names that person so their option says so. The stored value is still the email.
 * `newFiles` adds the Files section of the New task form; the task page manages its files on their own.
 */
export function TaskForm({ action, people, noAccess, defaults, submitLabel, idPrefix, showStatus = false, newFiles }: {
  action: (prev: TaskFormState, formData: FormData) => Promise<TaskFormState>;
  people: string[];
  noAccess?: string;
  defaults: TaskFormValues;
  submitLabel: string;
  idPrefix: string;
  showStatus?: boolean;
  newFiles?: { resources: ResourceOption[] };
}) {
  // Each added task starts the Files section afresh: a new task id and nothing held.
  const [added, setAdded] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [state, formAction, saving] = useActionState<TaskFormState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.ok && newFiles) setAdded((n) => n + 1);
    return result;
  }, {});
  const values = state.values ?? defaults;
  const id = (name: string) => `${idPrefix}-${name}`;
  const submit = (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="solid" disabled={saving || uploading} form={newFiles ? id("form") : undefined}>{submitLabel}</Button>
      {uploading ? <span className="text-sm text-ink-soft">Waiting for uploads to finish…</span> : null}
    </div>
  );

  return (
    <>
      <form
        // Remount so the fields show what the action returned: typed text on error, saved text on edit.
        key={JSON.stringify(state.values ?? null)}
        id={id("form")}
        action={formAction}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("title")}>Title</Label>
          <input id={id("title")} name="title" required maxLength={TASK_TITLE_MAX} defaultValue={values.title} className={CONTROL} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={id("assignee")}>Assigned to</Label>
            <select id={id("assignee")} name="assignee" defaultValue={values.assignee} className={CONTROL}>
              <option value="">Unassigned</option>
              {people.map((email) => (
                <option key={email} value={email}>
                  {`${displayName(email)} (${email})${email === noAccess ? " — no access" : ""}`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={id("due")}>Due date</Label>
            <input id={id("due")} name="dueOn" type="date" defaultValue={values.dueOn} className={CONTROL} />
          </div>
        </div>
        {showStatus ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={id("status")}>Status</Label>
            <select id={id("status")} name="status" defaultValue={values.status} className={CONTROL}>
              {TASK_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("notes")}>Notes</Label>
          <textarea id={id("notes")} name="notes" rows={3} maxLength={TASK_NOTES_MAX} defaultValue={values.notes} className={CONTROL} />
        </div>
        {newFiles ? null : submit}
      </form>
      {newFiles ? (
        <>
          <NewTaskFiles key={added} formId={id("form")} resources={newFiles.resources} onBusyChange={setUploading} />
          {submit}
        </>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-overdue">{state.error}</p>
      ) : state.ok ? (
        <p role="status" className="text-sm text-ink-soft">{[state.ok, state.notice].filter(Boolean).join(" ")}</p>
      ) : null}
    </>
  );
}
