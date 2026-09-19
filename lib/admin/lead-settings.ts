import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";

/**
 * The team member every new lead is assigned to, or null for nobody. New leads read it inside
 * their own insert (see insertLead and createJob); this is for the Settings page.
 * Never throws: a missing table (migration 023 not applied) reads as nobody.
 */
export async function getDefaultAssignee(): Promise<string | null> {
  try {
    const [row] = await db()`select default_assignee from lead_settings where id`;
    return (row?.default_assignee as string | null | undefined) ?? null;
  } catch (error) {
    console.error("Could not read lead settings", error);
    return null;
  }
}

/**
 * Saves the default, or clears it with null. One statement: the member check and the write
 * cannot be split by a removal in between, and an unknown id writes nothing.
 */
export async function saveDefaultAssignee(memberId: string | null, actor: string): Promise<"ok" | "unknown-member"> {
  if (memberId !== null && !isUuid(memberId)) return "unknown-member";
  const [result] = await db()`
    with member as (
      select id from team_members where id = ${memberId}::uuid
    ),
    saved as (
      insert into lead_settings (id, default_assignee, updated_by, updated_at)
      select true, (select id from member), ${actor}, now()
      where ${memberId}::uuid is null or exists (select 1 from member)
      on conflict (id) do update set
        default_assignee = excluded.default_assignee, updated_by = excluded.updated_by, updated_at = excluded.updated_at
      returning 1
    )
    select (select count(*) from member)::int as member, (select count(*) from saved)::int as saved`;
  return result?.saved ? "ok" : "unknown-member";
}
