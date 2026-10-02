"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTROL, Label } from "@/components/forms/Field";
import { displayName, TASK_NOTES_MAX, TASK_STATUSES, TASK_TITLE_MAX } from "@/lib/admin/task-rules";
import type { TaskFormState, TaskFormValues } from "./actions";

/**
 * New task and edit task. `people` must include the current assignee, even one who lost access;
 * `noAccess` names that person so their option says so. The stored value is still the email.
 */
export function TaskForm({ action, people, noAccess, defaults, submitLabel, idPrefix, showStatus = false }: {
  action: (prev: TaskFormState, formData: FormData) => Promise<TaskFormState>;
  people: string[];
  noAccess?: string;
  defaults: TaskFormValues;
  submitLabel: string;
  idPrefix: string;
  showStatus?: boolean;
}) {
  const [state, formAction, saving] = useActionState<TaskFormState, FormData>(action, {});
  const values = state.values ?? defaults;
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <>
      <form
        // Remount so the fields show what the action returned: typed text on error, saved text on edit.
        key={JSON.stringify(state.values ?? null)}
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
        <div>
          <Button type="submit" variant="solid" disabled={saving}>{submitLabel}</Button>
        </div>
      </form>
      {state.error ? (
        <p role="alert" className="text-sm text-overdue">{state.error}</p>
      ) : state.ok ? (
        <p role="status" className="text-sm text-ink-soft">{[state.ok, state.notice].filter(Boolean).join(" ")}</p>
      ) : null}
    </>
  );
}
