"use server";

import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/admin/ids";
import { requireAdmin } from "@/lib/admin/session";
import { taskInputSchema } from "@/lib/admin/task-schema";
import { claimReminder, createTask, deleteTask, releaseReminder, setTaskStatus, updateTask } from "@/lib/admin/tasks";
import { assignmentEmail, reminderEmail, sendTaskEmail } from "@/lib/admin/task-emails";
import { displayName, isTaskStatus, type TaskSummary } from "@/lib/admin/task-rules";
import type { PendingUpload } from "@/lib/admin/task-file-rules";
import { listTaskFiles, type StoredUpload } from "@/lib/admin/task-files";
import { verifyTaskUpload } from "@/lib/admin/task-file-uploads";
import { formatTime } from "@/lib/admin/time";

/** Form field values: as typed on an error, as stored after a successful edit. */
export type TaskFormValues = { title: string; notes: string; assignee: string; dueOn: string; status: string };
export type TaskFormState = { error?: string; notice?: string; ok?: string; values?: TaskFormValues };
export type RemindState = { ok?: string; error?: string };

const NOT_ASSIGNABLE = "That person no longer has access. Pick someone from the list.";
const MISSING = "That task was deleted.";
const RELOAD = "Reload the page and try again.";
const PICK_AGAIN = "A file you picked from Resources was deleted. Remove it and try again.";
const FOREIGN_KEY_VIOLATION = "23503";

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

const fileNamesOf = async (taskId: string) => (await listTaskFiles(taskId)).map((file) => file.name);

/**
 * Undefined when nothing needed sending or it went out; otherwise the notice to show.
 * `fileNames` is only asked for when an email goes out.
 */
async function notifyAssignee(
  task: Omit<TaskSummary, "fileNames">, fileNames: () => Promise<string[]>, actor: string, previous: string | null,
): Promise<string | undefined> {
  const to = task.assigneeEmail;
  if (!to || to === actor.toLowerCase() || to === previous) return undefined;
  if (await sendTaskEmail(to, assignmentEmail({ ...task, fileNames: await fileNames() }, actor))) return undefined;
  return `Saved, but the email to ${displayName(to)} didn't send.`;
}

/** The uploads the new-task form sent, as JSON strings; null when one can't be read. */
function readUploads(formData: FormData): PendingUpload[] | null {
  const uploads: PendingUpload[] = [];
  for (const raw of formData.getAll("upload")) {
    try {
      const parsed = JSON.parse(String(raw)) as Partial<PendingUpload>;
      if (typeof parsed?.pathname !== "string" || typeof parsed?.name !== "string") return null;
      uploads.push({ pathname: parsed.pathname, name: parsed.name });
    } catch {
      return null;
    }
  }
  return uploads;
}

const withNotice = <T extends object>(state: T, notice: string | undefined): T & { notice?: string } =>
  notice ? { ...state, notice } : state;

// Each action calls requireAdmin() before reading its input.
export async function createTaskAction(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const admin = await requireAdmin();
  const values = readForm(formData);
  const parsed = taskInputSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  // The form makes the task's id, so its files could upload under it before the task was saved.
  const taskId = String(formData.get("taskId") ?? "");
  const pending = readUploads(formData);
  if (!isUuid(taskId) || pending === null) return { error: RELOAD, values };
  const resourceIds = [...new Set(formData.getAll("resourceId").map(String))];
  if (!resourceIds.every(isUuid)) return { error: RELOAD, values };
  const uploads: StoredUpload[] = [];
  for (const upload of pending) {
    const checked = await verifyTaskUpload(taskId, upload);
    if ("error" in checked) return { error: `${upload.name}: ${checked.error} Remove it and try again.`, values };
    uploads.push(checked.upload);
  }
  let created: Awaited<ReturnType<typeof createTask>>;
  try {
    created = await createTask(parsed.data, admin.email, { id: taskId, uploads, resourceIds });
  } catch (error) {
    if ((error as { code?: string } | null)?.code === FOREIGN_KEY_VIOLATION) return { error: PICK_AGAIN, values };
    throw error;
  }
  if (created === "not-assignable") return { error: NOT_ASSIGNABLE, values };
  // A repeat submit of a task already saved: it was announced the first time.
  if (!created.created) {
    refresh();
    return { ok: "Task added." };
  }
  const { title, notes, dueOn, assignee } = parsed.data;
  const { fileNames } = created;
  const notice = await notifyAssignee({ id: taskId, title, notes, dueOn, assigneeEmail: assignee }, async () => fileNames, admin.email, null);
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
  const notice = await notifyAssignee({ id, title, notes, dueOn, assigneeEmail: assignee }, () => fileNamesOf(id), admin.email, updated.previousAssignee);
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
  // Read before claiming, so a failed read never leaves a claim with no email.
  const fileNames = isUuid(id) ? await fileNamesOf(id) : [];
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
  if (!(await sendTaskEmail(to, reminderEmail({ ...claim.task, fileNames }, admin.email, new Date()), admin.email))) {
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

/** The task row goes first (its file rows with it); then its uploads leave storage. */
export async function deleteTaskAction(id: string): Promise<void> {
  await requireAdmin();
  const paths = await deleteTask(id);
  if (paths && paths.length > 0) {
    await del(paths).catch((error) => console.error(`Deleted task ${id}, but not its stored files ${paths.join(", ")}`, error));
  }
  refresh();
  redirect("/admin/tasks");
}
