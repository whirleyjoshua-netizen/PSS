export type FileKind = "photo" | "document";

const MB = 1024 * 1024;

export const LIMITS = {
  photo: { types: ["image/jpeg"], maxBytes: 10 * MB, allowed: "JPG" },
  document: { types: ["application/pdf", "image/jpeg", "image/png"], maxBytes: 20 * MB, allowed: "PDF, JPG, or PNG" },
} as const satisfies Record<FileKind, { types: readonly string[]; maxBytes: number; allowed: string }>;

/** An error message for a file that may not be uploaded, or null when it may. */
export function checkUpload(kind: FileKind, type: string, size: number): string | null {
  const limit = LIMITS[kind];
  if (size <= 0) return "That file is empty.";
  if (!(limit.types as readonly string[]).includes(type)) return `Upload a ${limit.allowed} file.`;
  if (size > limit.maxBytes) return `Files must be ${limit.maxBytes / MB} MB or smaller.`;
  return null;
}

/** A storage-safe file name: no spaces or symbols, never empty, at most 80 characters. */
export function safeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80);
  return cleaned || "file";
}

/** Scales width and height so the longer side is at most `max`, keeping the ratio. */
export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
