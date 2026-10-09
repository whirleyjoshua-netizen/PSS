"use server";

import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/session";
import { isUuid } from "@/lib/admin/ids";
import { parseTaskFilePathname, type PendingUpload } from "@/lib/admin/task-file-rules";
import { addTaskUpload, getTaskFile, linkResource, recordedPathnames, removeTaskFile } from "@/lib/admin/task-files";
import { discardUpload, verifyTaskUpload } from "@/lib/admin/task-file-uploads";

export type TaskFileResult = { ok: true } | { error: string };

const FOREIGN_KEY_VIOLATION = "23503";
const code = (error: unknown) => (error as { code?: string } | null)?.code;

const refresh = () => {
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/tasks/[id]", "page");
};

// Each action calls requireAdmin() before reading its input.

/** Records a file the browser just uploaded to an existing task. A repeat save changes nothing. */
export async function saveTaskFileAction(taskId: string, upload: PendingUpload): Promise<TaskFileResult> {
  const { email } = await requireAdmin();
  if (!isUuid(taskId)) return { error: "That upload can't be saved." };
  const checked = await verifyTaskUpload(taskId, upload);
  if ("error" in checked) return checked;
  try {
    await addTaskUpload(taskId, checked.upload, email);
  } catch (error) {
    // The write may have landed and only its reply been lost: then the file belongs to that row.
    if (await getTaskFile(checked.upload.id).catch(() => null)) {
      refresh();
      return { ok: true };
    }
    await discardUpload(checked.upload.pathname);
    if (code(error) === FOREIGN_KEY_VIOLATION) return { error: "That task was deleted." };
    console.error(`Could not record the task upload ${checked.upload.pathname}`, error);
    return { error: "The file couldn't be saved. Try again." };
  }
  refresh();
  return { ok: true };
}

/** Attaches a Resources file without a second copy. Already attached counts as done. */
export async function linkResourceAction(taskId: string, resourceId: string): Promise<TaskFileResult> {
  const { email } = await requireAdmin();
  if (!isUuid(taskId) || !isUuid(resourceId)) return { error: "That file can't be attached." };
  try {
    await linkResource(taskId, resourceId, email);
  } catch (error) {
    if (code(error) === FOREIGN_KEY_VIOLATION) return { error: "That task or file was deleted." };
    throw error;
  }
  refresh();
  return { ok: true };
}

/**
 * The row goes first: a file left in storage by a failed removal is unreachable, never a row with no file.
 * A link only unlinks: the file stays in Resources. Already gone counts as done.
 */
export async function removeTaskFileAction(taskId: string, fileId: string): Promise<TaskFileResult> {
  await requireAdmin();
  const removed = await removeTaskFile(String(taskId ?? ""), String(fileId ?? ""));
  if (removed?.pathname) {
    const path = removed.pathname;
    await del(path).catch((error) => console.error(`Removed task file ${fileId}, but not its stored file ${path}`, error));
  }
  refresh();
  return { ok: true };
}

/**
 * Deletes an upload picked on the new-task form and removed before the task was saved. Only a task file
 * that no row records, so it can never delete a saved file.
 */
export async function discardPendingUploadAction(pathname: string): Promise<TaskFileResult> {
  await requireAdmin();
  const path = String(pathname ?? "");
  if (!parseTaskFilePathname(path)) return { error: "That upload can't be removed." };
  if ((await recordedPathnames([path])).has(path)) return { ok: true };
  await discardUpload(path);
  return { ok: true };
}
