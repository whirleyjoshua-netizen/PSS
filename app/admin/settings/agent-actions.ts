"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/session";
import { agentFormSchema, hashKey, newAgentKey, settingsSchema } from "@/lib/agents/rules";
import { addSuppression, createAgent, removeSuppression, saveAgentSettings, setAgentKeyHash } from "@/lib/agents/store";

export type FormState = { error?: string; ok?: boolean };
export type KeyState = { key?: string; error?: string };

const refresh = () => {
  revalidatePath("/admin/settings");
  revalidatePath("/admin/agents");
};

// Each action calls requireAdmin() before reading its input.
export async function addAgentAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = agentFormSchema.safeParse({
    slug: form.get("slug"), name: form.get("name"), role: form.get("role") ?? "",
    statsAccess: form.get("statsAccess") === "on", dailySendCap: form.get("dailySendCap"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await createAgent(parsed.data))) return { error: `An agent called "${parsed.data.slug}" already exists.` };
  refresh();
  return { ok: true };
}

/** A new key replaces the old one at once, so the old key stops working. Shown once, never stored or logged. */
export async function createKeyAction(slug: string, _prev: KeyState, _form: FormData): Promise<KeyState> {
  await requireAdmin();
  const key = newAgentKey();
  if (!(await setAgentKeyHash(slug, hashKey(key)))) return { error: "That agent no longer exists." };
  refresh();
  return { key };
}

/** The schema trims, so a whitespace-only mailing address saves as empty (stored null) and sending stays blocked. */
export async function saveAgentSettingsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = settingsSchema.safeParse({
    mailingAddress: form.get("mailingAddress") ?? "", signature: form.get("signature") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await saveAgentSettings({ ...parsed.data, by: admin.email });
  refresh();
  return { ok: true };
}

const address = z.string().trim().toLowerCase().pipe(z.email("Enter one email address"));

export async function addSuppressionAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = address.safeParse(form.get("address"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await addSuppression(parsed.data, "Added by owner", "owner");
  refresh();
  return { ok: true };
}

export async function removeSuppressionAction(addr: string): Promise<void> {
  await requireAdmin();
  await removeSuppression(addr);
  refresh();
}
