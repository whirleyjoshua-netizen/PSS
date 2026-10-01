"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/session";
import { taskInputSchema } from "@/lib/admin/task-schema";
import { claimReminder, createTask, deleteTask, releaseReminder, setTaskStatus, updateTask } from "@/lib/admin/tasks";
import { assignmentEmail, reminderEmail, sendTaskEmail } from "@/lib/admin/task-emails";
import { displayName, isTaskStatus, type TaskSummary } from "@/lib/admin/task-rules";
import { formatTime } from "@/lib/admin/time";

/** Exactly what the form sent, so a rejected form comes back as typed. */
export type TaskFormValues = { title: string; notes: string; assignee: string; dueOn: string; status: string };
export type TaskFormState = { error?: string; notice?: string; ok?: string; values?: TaskFormValues };
export type RemindState = { ok?: string; error?: string };

const NOT_ASSIGNABLE = "That person no longer has access. Pick someone from the list.";
const MISSING = "That task was deleted.";

const refresh = () => {
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/tasks/[id]", "page");
};

const readForm = (formData: FormData): TaskFormValues => ({
  title: String(formData.get("title") ?? ""),
  notes: String(formData.get("notes") ?? ""),
  assignee: String(formData.get("assignee") ?? ""),
  dueOn: String(formData.get("dueOn") ?? ""),
  // The new-task form has no status: a new task starts in To do.
  status: String(formData.get("status") ?? "todo"),
});

/** Undefined when nothing needed sending or it went out; otherwise the notice to show. */
async function notifyAssignee(task: TaskSummary, actor: string, previous: string | null): Promise<string | undefined> {
  const to = task.assigneeEmail;
  if (!to || to === actor.toLowerCase() || to === previous) return undefined;
  if (await sendTaskEmail(to, assignmentEmail(task, actor))) return undefined;
  return `Saved, but the email to ${displayName(to)} didn't send.`;
}

const withNotice = <T extends object>(state: T, notice: string | undefined): T & { notice?: string } =>
  notice ? { ...state, notice } : state;

// Each action calls requireAdmin() before reading its input.
export async function createTaskAction(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const admin = await requireAdmin();
  const values = readForm(formData);
  const parsed = taskInputSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const created = await createTask(parsed.data, admin.email);
  if (created === "not-assignable") return { error: NOT_ASSIGNABLE, values };
  const { title, notes, dueOn, assignee } = parsed.data;
  const notice = await notifyAssignee({ id: created.id, title, notes, dueOn, assigneeEmail: assignee }, admin.email, null);
  refresh();
  return withNotice({ ok: "Task added." }, notice);
}

/** `values` is returned on success too, built from what was stored, so the edit form shows exactly that. */
export async function updateTaskAction(id: string, _prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const admin = await requireAdmin();
  const values = readForm(formData);
  const parsed = taskInputSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const updated = await updateTask(id, parsed.data);
  if (updated === "missing") return { error: MISSING, values };
  if (updated === "not-assignable") return { error: NOT_ASSIGNABLE, values };
  const { title, notes, dueOn, assignee, status } = parsed.data;
  const notice = await notifyAssignee({ id, title, notes, dueOn, assigneeEmail: assignee }, admin.email, updated.previousAssignee);
  refresh();
  const saved: TaskFormValues = { title, notes: notes ?? "", assignee: assignee ?? "", dueOn: dueOn ?? "", status };
  return withNotice({ ok: "Saved.", values: saved }, notice);
}

export async function moveTaskAction(id: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const status = formData.get("status");
  if (!isTaskStatus(status)) return;
  await setTaskStatus(id, status);
  refresh();
}

export async function remindTaskAction(id: string, _prev: RemindState, _formData: FormData): Promise<RemindState> {
  const admin = await requireAdmin();
  const result = await claimReminder(id, admin.email);
  if ("refused" in result) {
    // Someone else's reminder may be why: show their "Reminded …" line too.
    refresh();
    switch (result.refused) {
      case "recent":
        return { error: result.lastAt ? `Already reminded at ${formatTime(result.lastAt)}.` : "Already reminded a moment ago." };
      case "done":
        return { error: "That task is already done." };
      case "unassigned":
        return { error: "Assign the task to someone first." };
      case "missing":
        return { error: MISSING };
    }
  }
  const { claim } = result;
  const to = claim.task.assigneeEmail as string;
  if (!(await sendTaskEmail(to, reminderEmail(claim.task, admin.email, new Date()), admin.email))) {
    try {
      await releaseReminder(id, claim);
    } catch (error) {
      // The send failure is what the person needs to hear; the stuck claim clears after the cooldown.
      console.error("Couldn't release the reminder claim", error);
    }
    return { error: "The reminder didn't send. Try again." };
  }
  refresh();
  return { ok: `Reminder sent to ${displayName(to)}.` };
}

export async function deleteTaskAction(id: string): Promise<void> {
  await requireAdmin();
  await deleteTask(id);
  refresh();
  redirect("/admin/tasks");
}
