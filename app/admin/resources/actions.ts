"use server";

import { del, head } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/session";
import { cleanCategory, cleanName, RESOURCE_MAX_BYTES, resourceIdFromPathname, UNCATEGORIZED, uploadName } from "@/lib/admin/resource-rules";
import {
  createCategory, createResource, deleteCategory, deleteResource, getResource, recategorizeResource, renameCategory, renameResource,
} from "@/lib/admin/resources";

export type ResourceResult = { ok: true } | { error: string };

const NAME = "Give the file a name (up to 200 characters).";
const CATEGORY = "Pick a category.";
const CATEGORY_NAME = "Give the category a name (up to 60 characters).";
const CATEGORY_GONE = "That category was deleted. Pick another.";
const FIXED = `${UNCATEGORIZED} can't be renamed or deleted.`;
const GONE = "That file was deleted.";
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const code = (error: unknown) => (error as { code?: string } | null)?.code;
const taken = (name: string) => `A category named ${name} already exists.`;
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
    await discard(pathname);
    // The category was deleted while the file uploaded (migration 041's reference).
    if (code(error) === FOREIGN_KEY_VIOLATION) return { error: CATEGORY_GONE };
    console.error(`Could not record the upload ${pathname}`, error);
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
  try {
    if (!(await recategorizeResource(id, category))) return { error: GONE };
  } catch (error) {
    if (code(error) === FOREIGN_KEY_VIOLATION) return { error: CATEGORY_GONE };
    throw error;
  }
  revalidatePath(PAGE);
  return { ok: true };
}

export async function addCategoryAction(raw: string): Promise<ResourceResult> {
  await requireAdmin();
  const name = cleanCategory(String(raw ?? ""));
  if (!name) return { error: CATEGORY_NAME };
  if (!(await createCategory(name))) return { error: taken(name) };
  revalidatePath(PAGE);
  return { ok: true };
}

/** Its files follow the new name in the same statement (on update cascade). */
export async function renameCategoryAction(from: string, raw: string): Promise<ResourceResult> {
  await requireAdmin();
  if (from === UNCATEGORIZED) return { error: FIXED };
  const name = cleanCategory(String(raw ?? ""));
  if (!name) return { error: CATEGORY_NAME };
  try {
    if (!(await renameCategory(String(from ?? ""), name))) return { error: "That category was deleted." };
  } catch (error) {
    if (code(error) === UNIQUE_VIOLATION) return { error: taken(name) };
    throw error;
  }
  revalidatePath(PAGE);
  return { ok: true };
}

/** Its files drop to Uncategorized in the same statement (on delete set default). Already gone counts as done. */
export async function deleteCategoryAction(name: string): Promise<ResourceResult> {
  await requireAdmin();
  if (name === UNCATEGORIZED) return { error: FIXED };
  await deleteCategory(String(name ?? ""));
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
