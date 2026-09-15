import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";
import type { TeamRole } from "./team-roles";

/** A person the owners assign jobs to. Names only: never a sign-in. */
export type TeamMember = { id: string; name: string; role: TeamRole };

export async function listTeam(): Promise<TeamMember[]> {
  const rows = await db()`select id, name, role from team_members order by lower(name), created_at`;
  return rows.map((row) => ({ id: row.id as string, name: row.name as string, role: row.role as TeamRole }));
}

export async function addTeamMember(name: string, role: TeamRole): Promise<string> {
  const [row] = await db()`insert into team_members (name, role) values (${name}, ${role}) returning id`;
  return row.id as string;
}

/** Their jobs become unassigned (the foreign key clears them). */
export async function removeTeamMember(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db()`delete from team_members where id = ${id} returning id`;
  return rows.length > 0;
}
