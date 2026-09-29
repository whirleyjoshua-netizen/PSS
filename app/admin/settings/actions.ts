"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/session";
import {
  adminAccessSchema, installRateSchema, installSettingsSchema, routeSettingsSchema, teamMemberSchema,
} from "@/lib/admin/schema";
import { addTeamMember, removeTeamMember } from "@/lib/admin/team";
import { saveRouteSettings } from "@/lib/routes/settings";
import { INSTALLABLE_TREATMENTS, type InstallRate } from "@/lib/admin/install-pricing";
import { saveInstallRates } from "@/lib/admin/install-rates";
import { TREATMENT_TYPES } from "@/lib/leads/treatment-types";
import { saveDefaultAssignee } from "@/lib/admin/lead-settings";
import { isUuid } from "@/lib/admin/jobs";
import { isOwner } from "@/lib/admin/allowlist";
import { addAdmin, removeAdmin } from "@/lib/admin/admin-access";
import { adminSignInUrl, sendAccessEmail } from "@/lib/admin/access-email";

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

export type RouteSettingsState = { error?: string; ok?: boolean };

export async function saveRouteSettingsAction(_prev: RouteSettingsState, formData: FormData): Promise<RouteSettingsState> {
  await requireAdmin();
  const parsed = routeSettingsSchema.safeParse({
    dayStart: formData.get("dayStart"), dayEnd: formData.get("dayEnd"),
    consultationHours: formData.get("consultationHours"), measureHours: formData.get("measureHours"),
    installHours: formData.get("installHours"), serviceHours: formData.get("serviceHours"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await saveRouteSettings(parsed.data);
  revalidatePath("/admin/settings");
  // The schedule plans routes with the working day and these lengths.
  revalidatePath("/admin/schedule");
  return { ok: true };
}

/** On failure, `values` carries what was submitted so the form can show it again instead of resetting. */
export type InstallRatesFormState = { error?: string; ok?: boolean; values?: Record<string, string> };

const TREATMENT_LABEL = new Map(TREATMENT_TYPES.map((type) => [type.key, type.label]));

/** The job-level fields as the form labels them, so an error names the box to fix. */
const SETTING_LABEL: Record<string, string> = {
  minimumCents: "Minimum job cost",
  hardSurfaceCents: "Hard surface",
  highLadderCents: "High ladder",
  motorizedCents: "Motorized",
  measureCents: "Measurement fee",
  takedownCents: "Takedown, blinds or drapery",
  shutterTakedownCents: "Takedown, shutters",
  appSetupSmallCents: "App set-up, 1–3 motors",
  appSetupLargeCents: "App set-up, 4–9 motors",
};

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
    measureCents: formData.get("measureCents") ?? "",
    takedownCents: formData.get("takedownCents") ?? "",
    shutterTakedownCents: formData.get("shutterTakedownCents") ?? "",
    appSetupSmallCents: formData.get("appSetupSmallCents") ?? "",
    appSetupLargeCents: formData.get("appSetupLargeCents") ?? "",
  });
  if (!settings.success) {
    const issue = settings.error.issues[0];
    return { error: `${SETTING_LABEL[String(issue.path[0])]}: ${issue.message}`, values };
  }

  const rates: InstallRate[] = [];
  for (const treatment of INSTALLABLE_TREATMENTS) {
    const raw = String(formData.get(`rate-${treatment}`) ?? "").trim();
    // A blank rate means "not priced yet"; saving a zero would claim it is free.
    if (raw === "") continue;
    const parsed = installRateSchema.safeParse({
      treatment, basis: formData.get(`basis-${treatment}`), rateCents: raw,
    });
    if (!parsed.success) {
      return { error: `${TREATMENT_LABEL.get(treatment) ?? treatment}: ${parsed.error.issues[0].message}`, values };
    }
    rates.push(parsed.data);
  }

  await saveInstallRates(rates, settings.data, admin.email);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/jobs/[id]", "page");
  return { ok: true };
}

export type LeadDefaultsState = { error?: string; ok?: boolean };

/** Who new leads are assigned to. An empty choice is Nobody. Jobs that already exist keep their assignee. */
export async function saveLeadDefaultsAction(_prev: LeadDefaultsState, formData: FormData): Promise<LeadDefaultsState> {
  const admin = await requireAdmin();
  const raw = String(formData.get("defaultAssignee") ?? "");
  const memberId = raw === "" ? null : raw;
  if (memberId !== null && !isUuid(memberId)) return { error: "Pick someone from the team list" };
  const result = await saveDefaultAssignee(memberId, admin.email);
  if (result === "unknown-member") return { error: "That person is no longer on the team" };
  revalidatePath("/admin/settings");
  return { ok: true };
}

/**
 * `ok` is the sentence to show; on error `email` carries what was typed. `given` is the normalized
 * address a success or "already has access" is about, so the form can drop it once they are removed.
 */
export type AccessFormState = { error?: string; ok?: string; email?: string; given?: string };

export async function giveAccess(_prev: AccessFormState, formData: FormData): Promise<AccessFormState> {
  const admin = await requireAdmin();
  const typed = String(formData.get("email") ?? "");
  const parsed = adminAccessSchema.safeParse({ email: typed });
  if (!parsed.success) return { error: parsed.error.issues[0].message, email: typed };
  const { email } = parsed.data;
  if (isOwner(email)) return { error: "That address is already an owner.", email: typed };
  if (!(await addAdmin(email, admin.email))) return { error: "That address already has access.", email: typed, given: email };
  revalidatePath("/admin/settings");
  const sent = await sendAccessEmail(email, admin.email);
  return {
    given: email,
    ok: sent
      ? `Access given to ${email}. We emailed them the sign-in link.`
      : `Access given to ${email}, but the welcome email could not be sent. Tell them to sign in at ${adminSignInUrl()}.`,
  };
}

/** Owners and your own address are refused here too, not only hidden in the page. */
export async function removeAccess(rawEmail: string): Promise<void> {
  const admin = await requireAdmin();
  // A hand-posted non-string must not throw.
  const email = String(rawEmail ?? "").trim().toLowerCase();
  if (isOwner(email) || email === admin.email.trim().toLowerCase()) return;
  await removeAdmin(email);
  revalidatePath("/admin/settings");
}
