import "server-only";
import { del, list } from "@vercel/blob";
import { TASK_FILE_PREFIX } from "./task-file-rules";
import { recordedPathnames } from "./task-files";

/** An upload this old with no row was abandoned: a New task form closed after picking files, or a save that failed. */
export const SWEEP_AFTER_HOURS = 24;

/**
 * Deletes task uploads that no row records, once they are SWEEP_AFTER_HOURS old, so storage holds nothing
 * the board can't reach. Younger ones are left alone: their form may still be open. Run by the daily tasks cron.
 * Never throws: a failure is reported, and whatever wasn't removed is tried again the next day.
 */
export async function sweepTaskUploads(now: Date = new Date()): Promise<{ removed: number; error?: string }> {
  const cutoff = now.getTime() - SWEEP_AFTER_HOURS * 3600_000;
  let removed = 0;
  try {
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: TASK_FILE_PREFIX, cursor, limit: 1000 });
      const old = page.blobs.filter((blob) => new Date(blob.uploadedAt).getTime() < cutoff).map((blob) => blob.pathname);
      const recorded = await recordedPathnames(old);
      const orphans = old.filter((pathname) => !recorded.has(pathname));
      if (orphans.length > 0) {
        await del(orphans);
        removed += orphans.length;
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return { removed };
  } catch (error) {
    console.error("Task upload sweep failed", error);
    return { removed, error: (error as Error).message };
  }
}
