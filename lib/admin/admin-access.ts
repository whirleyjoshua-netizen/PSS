import "server-only";
import { db } from "@/lib/db";

/** Someone given sign-in from Settings. Owners (ADMIN_EMAILS) are never rows here. */
export type AddedAdmin = { email: string; addedBy: string; addedAt: Date };

export async function listAddedAdmins(): Promise<AddedAdmin[]> {
  const rows = await db()`select email, added_by, created_at from admin_access order by created_at, email`;
  return rows.map((row) => ({
    email: row.email as string,
    addedBy: row.added_by as string,
    addedAt: new Date(row.created_at as string),
  }));
}

/** False when the address already had access. The caller passes a normalized address. */
export async function addAdmin(email: string, addedBy: string): Promise<boolean> {
  const rows = await db()`
    insert into admin_access (email, added_by) values (${email}, ${addedBy})
    on conflict (email) do nothing
    returning email`;
  return rows.length > 0;
}

/**
 * One statement, so the access row, their sessions, unused sign-in links, Face ID devices and open
 * tasks go together.
 */
export async function removeAdmin(email: string): Promise<boolean> {
  const rows = await db()`
    with removed as (
      delete from admin_access where email = ${email} returning email
    ), ended as (
      delete from admin_sessions where email in (select email from removed)
    ), unused as (
      delete from admin_login_tokens where used_at is null and email in (select email from removed)
    ), passkeys as (
      delete from admin_passkeys where email in (select email from removed)
    ), unassigned as (
      update tasks set assignee_email = null, updated_at = now()
      where status <> 'done' and assignee_email in (select email from removed)
    )
    select email from removed`;
  return rows.length > 0;
}
