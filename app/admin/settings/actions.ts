"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/session";
import { teamMemberSchema } from "@/lib/admin/schema";
import { addTeamMember, removeTeamMember } from "@/lib/admin/team";

export type TeamFormState = { error?: string; ok?: boolean; name?: string };

const refresh = () => {
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  // Job pages name the assignee, so they go stale when the team list changes.
  revalidatePath("/admin/jobs/[id]", "page");
};

// Each action calls requireAdmin() before reading its input.
export async function addMember(_prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  await requireAdmin();
  const parsed = teamMemberSchema.safeParse({ name: formData.get("name"), role: formData.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, name: String(formData.get("name") ?? "") };
  await addTeamMember(parsed.data.name, parsed.data.role);
  refresh();
  return { ok: true };
}

export async function removeMember(id: string): Promise<void> {
  await requireAdmin();
  await removeTeamMember(id);
  refresh();
}
