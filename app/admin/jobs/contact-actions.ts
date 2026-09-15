"use server";

import { revalidatePath } from "next/cache";
import { contactBody } from "@/lib/admin/contact";
import { addContact } from "@/lib/admin/jobs";
import { contactSchema } from "@/lib/admin/schema";
import { requireAdmin } from "@/lib/admin/session";
import type { FormState } from "./actions";

// Calls requireAdmin() before reading its input. Never touches the stage or the call-back.
export async function logContactAction(jobId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const methods = formData.getAll("methods").map(String);
  const note = String(formData.get("note") ?? "");
  const parsed = contactSchema.safeParse({ methods, note });
  if (!parsed.success) {
    const values: Record<string, string | string[]> = {};
    if (methods.length) values.methods = methods.length > 1 ? methods : methods[0];
    if (note) values.note = note;
    return { error: parsed.error.issues[0].message, values };
  }
  const saved = await addContact(jobId, contactBody(parsed.data.methods, parsed.data.note), email);
  if (!saved) return { error: "That job no longer exists." };
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${jobId}`);
  return { ok: true };
}
