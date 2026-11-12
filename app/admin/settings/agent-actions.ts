"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/session";
import { addSuppression, removeSuppression } from "@/lib/agents/store";

export type FormState = { error?: string; ok?: boolean };

const refresh = () => revalidatePath("/admin/settings");

const address = z.string().trim().toLowerCase().pipe(z.email("Enter one email address"));

// Each action calls requireAdmin() before reading its input.
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
