"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logCall } from "@/lib/admin/calls";
import { callSchema } from "@/lib/admin/schema";
import { requireAdmin } from "@/lib/admin/session";
import type { FormState } from "./actions";

const FIELDS = ["outcome", "treatments", "windowCount", "budget", "notes", "visitAt"];

function captureValues(formData: FormData): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const key of FIELDS) {
    const all = formData.getAll(key);
    if (all.length === 0) continue;
    values[key] = all.length > 1 ? all.map(String) : String(all[0]);
  }
  return values;
}

// Calls requireAdmin() before reading its input.
export async function logCallAction(jobId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const values = captureValues(formData);
  const parsed = callSchema.safeParse({
    outcome: formData.get("outcome") ?? undefined,
    treatments: formData.getAll("treatments").map(String),
    windowCount: formData.get("windowCount") ?? "",
    budget: formData.get("budget") ?? "",
    notes: formData.get("notes") ?? "",
    visitAt: formData.get("visitAt") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const saved = await logCall(jobId, parsed.data, email);
  if (!saved) return { error: "That job no longer exists." };

  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${jobId}`);
  redirect(`/admin/jobs/${jobId}`);
}
