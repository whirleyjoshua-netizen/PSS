"use server";

import { del, head } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/session";
import { cleanCategory, cleanName, RESOURCE_MAX_BYTES, resourceIdFromPathname, uploadName } from "@/lib/admin/resource-rules";
import { createResource, deleteResource, getResource, recategorizeResource, renameResource } from "@/lib/admin/resources";

export type ResourceResult = { ok: true } | { error: string };

const NAME = "Give the file a name (up to 200 characters).";
const CATEGORY = "Pick or type a category (up to 60 characters).";
const GONE = "That file was deleted.";
const PAGE = "/admin/resources";

/** Removes an upload that won't be recorded, so nothing is left in storage without a row. */
const discard = (pathname: string) => del(pathname).catch((error) => console.error(`Could not remove the unsaved upload ${pathname}`, error));

// Each action calls requireAdmin() before reading its input.

/**
 * Records a file the browser just uploaded (spec Part B2). Size and type come from storage, not the
 * browser. The path must be one resourcePathname made: the id in it becomes the row's id.
 * An upload that is already recorded is left alone, so no repeat or bad call can delete a saved file.
 */
export async function saveResourceAction(input: { pathname: string; name: string; category: string }): Promise<ResourceResult> {
  const { email } = await requireAdmin();
  const pathname = String(input.pathname ?? "");
  const id = resourceIdFromPathname(pathname);
  if (!id) return { error: "That upload can't be saved." };
  if (await getResource(id)) return { ok: true };

  const category = cleanCategory(String(input.category ?? ""));
  if (!category) {
    await discard(pathname);
    return { error: CATEGORY };
  }
  let stored: { size: number; contentType: string };
  try {
    stored = await head(pathname);
  } catch {
    await discard(pathname);
    return { error: "The upload didn't finish. Try again." };
  }
  if (stored.size < 1 || stored.size > RESOURCE_MAX_BYTES) {
    await discard(pathname);
    return { error: stored.size < 1 ? "That file is empty." : "Files must be 200 MB or smaller." };
  }
  try {
    await createResource({
      id, name: uploadName(String(input.name ?? "")), category, contentType: stored.contentType || "application/octet-stream",
      sizeBytes: stored.size, pathname, uploadedBy: email,
    });
  } catch (error) {
    // The write may have landed and only its reply been lost: then the file belongs to that row.
    if (await getResource(id).catch(() => null)) return { ok: true };
    console.error(`Could not record the upload ${pathname}`, error);
    await discard(pathname);
    return { error: "The file couldn't be saved. Try again." };
  }
  revalidatePath(PAGE);
  return { ok: true };
}

export async function renameResourceAction(id: string, raw: string): Promise<ResourceResult> {
  await requireAdmin();
  const name = cleanName(String(raw ?? ""));
  if (!name) return { error: NAME };
  if (!(await renameResource(id, name))) return { error: GONE };
  revalidatePath(PAGE);
  return { ok: true };
}

export async function recategorizeResourceAction(id: string, raw: string): Promise<ResourceResult> {
  await requireAdmin();
  const category = cleanCategory(String(raw ?? ""));
  if (!category) return { error: CATEGORY };
  if (!(await recategorizeResource(id, category))) return { error: GONE };
  revalidatePath(PAGE);
  return { ok: true };
}

/** The row goes first: a file left in storage by a failed removal is unreachable, never a row with no file. */
export async function deleteResourceAction(id: string): Promise<ResourceResult> {
  await requireAdmin();
  const pathname = await deleteResource(id);
  if (pathname) await del(pathname).catch((error) => console.error(`Deleted resource ${id}, but not its file ${pathname}`, error));
  revalidatePath(PAGE);
  return { ok: true };
}
