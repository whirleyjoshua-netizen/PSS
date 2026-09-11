"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/session";
import { addNote, createJob, setStage, updateDetails } from "@/lib/admin/jobs";
import { detailsSchema, lostSchema, newJobSchema, noteSchema } from "@/lib/admin/schema";
import type { Stage } from "@/lib/admin/stages";

export type FormState = {
  error?: string;
  ok?: boolean;
  /** The submitted values, echoed back so a failed submit can keep them. */
  values?: Record<string, string | string[]>;
};

const MISSING: FormState = { error: "That job no longer exists." };

const refresh = (id: string) => {
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${id}`);
};

/** Captures a FormData's entries so a failed submit can restore them as defaults. */
function captureValues(formData: FormData, keys: string[]): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const key of keys) {
    const all = formData.getAll(key);
    if (all.length === 0) continue;
    values[key] = all.length > 1 ? all.map(String) : String(all[0]);
  }
  return values;
}

// Every action calls requireAdmin() before reading its input.

export async function moveStage(id: string, to: Stage): Promise<void> {
  const { email } = await requireAdmin();
  await setStage(id, to, email);
  refresh(id);
}

export async function markLost(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const values = captureValues(formData, ["reason"]);
  const parsed = lostSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const changed = await setStage(id, "lost", email, parsed.data.reason);
  if (!changed) return MISSING;
  refresh(id);
  return { ok: true };
}

export async function saveDetails(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const values = captureValues(formData, [
    "visitAt", "quote", "sold", "deposit", "brands", "orderedOn", "installOn",
  ]);
  const parsed = detailsSchema.safeParse({
    visitAt: formData.get("visitAt") ?? "",
    quote: formData.get("quote") ?? "",
    sold: formData.get("sold") ?? "",
    deposit: formData.get("deposit") ?? "",
    brands: formData.getAll("brands"),
    orderedOn: formData.get("orderedOn") ?? "",
    installOn: formData.get("installOn") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const saved = await updateDetails(id, parsed.data, email);
  if (!saved) return MISSING;
  refresh(id);
  return { ok: true };
}

export async function saveNote(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const parsed = noteSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const logged = await addNote(id, parsed.data.body, email);
  if (!logged) return MISSING;
  refresh(id);
  return { ok: true };
}

export async function addJob(_prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const values = captureValues(formData, ["name", "phone", "email", "city", "address", "source", "notes"]);
  const parsed = newJobSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const id = await createJob(parsed.data, email);
  revalidatePath("/admin");
  redirect(`/admin/jobs/${id}`);
}
