import "server-only";
import { del, head } from "@vercel/blob";
import { RESOURCE_MAX_BYTES, uploadName } from "./resource-rules";
import { parseTaskFilePathname, type PendingUpload } from "./task-file-rules";
import type { StoredUpload } from "./task-files";

/** Removes an upload that won't be recorded, so nothing is left in storage without a row. Never throws. */
export const discardUpload = (pathname: string): Promise<void> =>
  del(pathname).catch((error) => console.error(`Could not remove the unsaved upload ${pathname}`, error));

/**
 * Checks an upload the browser says it finished for `taskId`. Size and type come from storage, not the
 * browser. The path must be one taskFilePathname made for this task: the file id in it becomes the row's id.
 * A refused upload is removed from storage, except a path that isn't a task file at all, which is never touched.
 */
export async function verifyTaskUpload(taskId: string, upload: PendingUpload): Promise<{ upload: StoredUpload } | { error: string }> {
  const pathname = String(upload?.pathname ?? "");
  const parsed = parseTaskFilePathname(pathname);
  if (!parsed || parsed.taskId !== taskId) return { error: "That upload can't be saved." };
  let stored: { size: number; contentType: string };
  try {
    stored = await head(pathname);
  } catch {
    await discardUpload(pathname);
    return { error: "The upload didn't finish. Try again." };
  }
  if (stored.size < 1 || stored.size > RESOURCE_MAX_BYTES) {
    await discardUpload(pathname);
    return { error: stored.size < 1 ? "That file is empty." : "Files must be 200 MB or smaller." };
  }
  return {
    upload: {
      id: parsed.fileId, name: uploadName(String(upload.name ?? "")), contentType: stored.contentType || "application/octet-stream",
      sizeBytes: stored.size, pathname,
    },
  };
}
