import { safeName } from "./uploads";

/**
 * The Resources library's rules, shared by the browser (the uploader, the list) and the server
 * (the upload token route, the actions, the store). Spec: docs/superpowers/specs/2026-10-02-logo-and-resources-design.md, Part B.
 */

export const RESOURCE_MAX_BYTES = 200 * 1024 * 1024;
export const NAME_MAX = 200;
export const CATEGORY_MAX = 60;

/** Where a deleted category's files go (migration 041). Never renamed or deleted. */
export const UNCATEGORIZED = "Uncategorized";

export type Category = { name: string; fileCount: number };

export type Resource = {
  id: string; name: string; category: string; contentType: string; sizeBytes: number; uploadedBy: string; createdAt: Date;
};

/** A file as the library lists it: with how many tasks link to it. */
export type ListedResource = Resource & { taskCount: number };

/** What Delete asks, warning when tasks link to the file: the link goes with it. */
export function deleteQuestion(file: ListedResource): string {
  const tasks = file.taskCount === 1 ? "1 task and will be removed from it" : `${file.taskCount} tasks and will be removed from them`;
  return file.taskCount > 0
    ? `Delete ${file.name}? It's attached to ${tasks}. This can't be undone.`
    : `Delete ${file.name}? This can't be undone.`;
}

const PATH = /^resources\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([A-Za-z0-9._-]{1,80})$/;

/** Where an upload is stored: its own folder, named by the id its row will have. */
export function resourcePathname(id: string, fileName: string): string {
  const name = safeName(fileName);
  return `resources/${id}/${name === "." || name === ".." ? "file" : name}`;
}

/** The id in a path resourcePathname made, or null for any other path. */
export function resourceIdFromPathname(pathname: string): string | null {
  const match = PATH.exec(pathname);
  if (!match || match[2] === "." || match[2] === "..") return null;
  return match[1];
}

export function cleanName(raw: string): string | null {
  const name = raw.trim();
  return name.length >= 1 && name.length <= NAME_MAX ? name : null;
}

/**
 * An uploaded file's name as it is stored: never refused, since the upload is already made and the
 * owner couldn't fix it. Over NAME_MAX it is shortened with "…", keeping a short extension.
 */
export function uploadName(raw: string): string {
  const name = raw.trim();
  if (!name) return "Untitled file";
  if (name.length <= NAME_MAX) return name;
  const ext = /\.[A-Za-z0-9]{1,10}$/.exec(name)?.[0] ?? "";
  return `${name.slice(0, NAME_MAX - 1 - ext.length)}…${ext}`;
}

export function cleanCategory(raw: string): string | null {
  const category = raw.trim().replace(/\s+/g, " ");
  return category.length >= 1 && category.length <= CATEGORY_MAX ? category : null;
}

const INLINE = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);

/** PDFs and photos open in the browser. Everything else downloads, so nothing uploaded runs on our site. */
export function opensInline(contentType: string): boolean {
  return INLINE.has(contentType.split(";")[0].trim().toLowerCase());
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${Number(value.toFixed(value < 10 ? 1 : 0))} ${units[unit]}`;
}

const byName = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });

/** The categories in A–Z order, Uncategorized only while it holds files: the order the page lists them in. */
export function shownCategories(categories: Category[]): Category[] {
  return categories.filter((c) => c.name !== UNCATEGORIZED || c.fileCount > 0).sort((a, b) => byName(a.name, b.name));
}

/** What Upload and Move offer: the named categories A–Z, then Uncategorized last. */
export function categoryChoices(categories: Category[]): string[] {
  const named = categories.map((c) => c.name).filter((n) => n !== UNCATEGORIZED).sort(byName);
  return [...named, UNCATEGORIZED];
}

/**
 * The list as the page shows it: categories A–Z, each category's files by name A–Z. Without a search every
 * category in `categories` is listed, empty ones too (Uncategorized only with files); a search lists only the
 * categories holding matching files.
 */
export function groupResources<T extends Resource>(list: T[], query: string, categories: string[] = []): { category: string; files: T[] }[] {
  const q = query.trim().toLowerCase();
  const matching = q ? list.filter((r) => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)) : list;
  const byCategory = new Map<string, T[]>();
  if (!q) for (const c of categories) if (c !== UNCATEGORIZED) byCategory.set(c, []);
  for (const r of matching) byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r]);
  return [...byCategory.keys()].sort(byName).map((category) => ({
    category, files: byCategory.get(category)!.sort((a, b) => byName(a.name, b.name)),
  }));
}
