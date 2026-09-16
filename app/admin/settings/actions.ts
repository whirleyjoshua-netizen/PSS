"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/session";
import { installRateSchema, installSettingsSchema, teamMemberSchema } from "@/lib/admin/schema";
import { addTeamMember, removeTeamMember } from "@/lib/admin/team";
import { INSTALLABLE_TREATMENTS, type InstallRate } from "@/lib/admin/install-pricing";
import { saveInstallRates } from "@/lib/admin/install-rates";

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

/** On failure, `values` carries what was submitted so the form can show it again instead of resetting. */
export type InstallRatesFormState = { error?: string; ok?: boolean; values?: Record<string, string> };

export async function saveInstallRatesAction(
  _prev: InstallRatesFormState,
  formData: FormData,
): Promise<InstallRatesFormState> {
  const admin = await requireAdmin();
  const values: Record<string, string> = {};
  for (const [name, value] of formData) if (typeof value === "string") values[name] = value;
  const settings = installSettingsSchema.safeParse({
    minimumCents: formData.get("minimumCents") ?? "",
    hardSurfaceCents: formData.get("hardSurfaceCents") ?? "",
    highLadderCents: formData.get("highLadderCents") ?? "",
    motorizedCents: formData.get("motorizedCents") ?? "",
  });
  if (!settings.success) return { error: settings.error.issues[0].message, values };

  const rates: InstallRate[] = [];
  for (const treatment of INSTALLABLE_TREATMENTS) {
    const raw = String(formData.get(`rate-${treatment}`) ?? "").trim();
    // A blank rate means "not priced yet"; saving a zero would claim it is free.
    if (raw === "") continue;
    const parsed = installRateSchema.safeParse({
      treatment, basis: formData.get(`basis-${treatment}`), rateCents: raw,
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message, values };
    rates.push(parsed.data);
  }

  await saveInstallRates(rates, settings.data, admin.email);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/jobs/[id]", "page");
  return { ok: true };
}
