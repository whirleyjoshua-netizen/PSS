import { db } from "@/lib/db";

export const parseAllowlist = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

/** The owners, from ADMIN_EMAILS. The site can never remove them. */
export const isOwner = (email: string, raw = process.env.ADMIN_EMAILS): boolean =>
  parseAllowlist(raw).includes(email.trim().toLowerCase());

/**
 * An owner, or someone given access in Settings. Read on every request, so
 * removing an address locks it out immediately. A failed lookup throws; it never allows.
 */
export async function isAllowed(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  if (isOwner(normalized)) return true;
  const rows = await db()`select 1 from admin_access where email = ${normalized}`;
  return rows.length > 0;
}
