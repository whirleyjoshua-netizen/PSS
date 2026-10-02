import { safeName } from "./uploads";

/**
 * The Resources library's rules, shared by the browser (the uploader, the list) and the server
 * (the upload token route, the actions, the store). Spec: docs/superpowers/specs/2026-10-02-logo-and-resources-design.md, Part B.
 */

export const RESOURCE_MAX_BYTES = 200 * 1024 * 1024;
export const NAME_MAX = 200;
export const CATEGORY_MAX = 60;

export type Resource = {
  id: string; name: string; category: string; contentType: string; sizeBytes: number; uploadedBy: string; createdAt: Date;
};

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

/** A typed category, cleaned, spelled as an existing one when it differs only in case, so "licenses" files under "Licenses". */
export function matchCategory(raw: string, existing: string[]): string | null {
  const category = cleanCategory(raw);
  if (!category) return null;
  return existing.find((c) => c.toLowerCase() === category.toLowerCase()) ?? category;
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

/** The list as the page shows it: matching files by category A–Z, each category's files by name A–Z. */
export function groupResources(list: Resource[], query: string): { category: string; files: Resource[] }[] {
  const q = query.trim().toLowerCase();
  const matching = q ? list.filter((r) => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)) : list;
  const byCategory = new Map<string, Resource[]>();
  for (const r of matching) byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r]);
  const order = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });
  return [...byCategory.keys()].sort(order).map((category) => ({
    category, files: byCategory.get(category)!.sort((a, b) => order(a.name, b.name)),
  }));
}
