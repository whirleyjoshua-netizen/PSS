"use server";

import { del, head } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/session";
import { cleanCategory, cleanName, RESOURCE_MAX_BYTES, resourceIdFromPathname } from "@/lib/admin/resource-rules";
import { createResource, deleteResource, recategorizeResource, renameResource } from "@/lib/admin/resources";

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
 */
export async function saveResourceAction(input: { pathname: string; name: string; category: string }): Promise<ResourceResult> {
  const { email } = await requireAdmin();
  const id = resourceIdFromPathname(input.pathname);
  if (!id) return { error: "That upload can't be saved." };
  const name = cleanName(input.name);
  const category = cleanCategory(input.category);
  if (!name || !category) {
    await discard(input.pathname);
    return { error: name ? CATEGORY : NAME };
  }
  let stored: { size: number; contentType: string };
  try {
    stored = await head(input.pathname);
  } catch {
    return { error: "The upload didn't finish. Try again." };
  }
  if (stored.size > RESOURCE_MAX_BYTES) {
    await discard(input.pathname);
    return { error: "Files must be 200 MB or smaller." };
  }
  try {
    await createResource({
      id, name, category, contentType: stored.contentType || "application/octet-stream", sizeBytes: stored.size,
      pathname: input.pathname, uploadedBy: email,
    });
  } catch (error) {
    await discard(input.pathname);
    throw error;
  }
  revalidatePath(PAGE);
  return { ok: true };
}

export async function renameResourceAction(id: string, raw: string): Promise<ResourceResult> {
  await requireAdmin();
  const name = cleanName(raw);
  if (!name) return { error: NAME };
  if (!(await renameResource(id, name))) return { error: GONE };
  revalidatePath(PAGE);
  return { ok: true };
}

export async function recategorizeResourceAction(id: string, raw: string): Promise<ResourceResult> {
  await requireAdmin();
  const category = cleanCategory(raw);
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
