"use server";

import { revalidatePath } from "next/cache";
import { clearFollowUp, setFollowUp } from "@/lib/admin/follow-ups";
import { followUpSchema } from "@/lib/admin/schema";
import { requireAdmin } from "@/lib/admin/session";
import type { FormState } from "./actions";

const refresh = (id: string) => {
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${id}`);
};

// Each action calls requireAdmin() before reading its input.
export async function saveFollowUp(jobId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const raw = { at: String(formData.get("at") ?? ""), note: String(formData.get("note") ?? "") };
  const parsed = followUpSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values: raw };
  const saved = await setFollowUp(jobId, parsed.data.at, parsed.data.note, email);
  if (!saved) return { error: "That job no longer exists." };
  refresh(jobId);
  return { ok: true };
}

export async function clearFollowUpAction(jobId: string): Promise<void> {
  const { email } = await requireAdmin();
  await clearFollowUp(jobId, email);
  refresh(jobId);
}
