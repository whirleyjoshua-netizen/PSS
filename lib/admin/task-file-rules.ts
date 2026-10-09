import { safeName } from "./uploads";

/**
 * Files on tasks (migration 043), shared by the browser and the server.
 * Spec: docs/superpowers/specs/2026-10-09-task-files-design.md.
 */

export const TASK_FILE_PREFIX = "task-files/";

/** An upload carries its own name, type and size; a link to Resources carries resourceId and the library's. */
export type TaskFile = {
  id: string; taskId: string; resourceId: string | null; name: string; contentType: string; sizeBytes: number; addedBy: string; createdAt: Date;
};

/** An upload the browser has finished but nothing has recorded yet. */
export type PendingUpload = { pathname: string; name: string };

/** What the Add from Resources list offers. */
export type ResourceOption = { id: string; name: string; category: string };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const PATH = new RegExp(`^task-files/(${UUID})/(${UUID})/([A-Za-z0-9._-]{1,80})$`);

/** Where an upload is stored: under its task, in a folder named by the id its row will have. */
export function taskFilePathname(taskId: string, fileId: string, fileName: string): string {
  const name = safeName(fileName);
  return `${TASK_FILE_PREFIX}${taskId}/${fileId}/${name === "." || name === ".." ? "file" : name}`;
}

/** The task and file ids in a path taskFilePathname made, or null for any other path. */
export function parseTaskFilePathname(pathname: string): { taskId: string; fileId: string } | null {
  const match = PATH.exec(pathname);
  if (!match || match[3] === "." || match[3] === "..") return null;
  return { taskId: match[1], fileId: match[2] };
}
