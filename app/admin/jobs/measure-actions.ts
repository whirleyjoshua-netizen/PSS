"use server";

import { revalidatePath } from "next/cache";
import { deleteFile, getFile } from "@/lib/admin/files";
import { addMeasurement, deleteMeasurement, updateMeasurement } from "@/lib/admin/measurements";
import { measurementSchema } from "@/lib/admin/schema";
import { requireAdmin } from "@/lib/admin/session";
import type { FormState } from "./actions";

const FIELDS = [
  "room", "label", "widthIn", "widthEighth", "heightIn", "heightEighth",
  "depthIn", "depthEighth", "mount", "requirements", "notes", "photoFileId",
];

function captureValues(formData: FormData): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const key of FIELDS) {
    const all = formData.getAll(key).map(String);
    if (all.length) values[key] = key === "requirements" ? all : all[0];
  }
  return values;
}

// measurementSchema requires every key to be present on the object (even as
// `undefined`) — a key missing entirely fails validation differently from an
// empty/absent form field, so every field is included explicitly here.
function captureRaw(formData: FormData): Record<string, unknown> {
  const raw: Record<string, unknown> = { requirements: formData.getAll("requirements").map(String) };
  for (const key of FIELDS) {
    if (key === "requirements") continue;
    raw[key] = formData.has(key) ? String(formData.get(key)) : undefined;
  }
  return raw;
}

// Every action calls requireAdmin() before reading its input.

export async function saveMeasurement(jobId: string, windowId: string | null, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const values = captureValues(formData);
  const parsed = measurementSchema.safeParse(captureRaw(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const saved = windowId
    ? await updateMeasurement(jobId, windowId, parsed.data, email)
    : Boolean(await addMeasurement(jobId, parsed.data, email));
  if (!saved) return { error: "That job or window no longer exists." };

  revalidatePath(`/admin/jobs/${jobId}`);
  return { ok: true };
}

export async function removeMeasurement(jobId: string, windowId: string): Promise<void> {
  const { email } = await requireAdmin();
  await deleteMeasurement(jobId, windowId, email);
  revalidatePath(`/admin/jobs/${jobId}`);
}

export async function removeFile(jobId: string, fileId: string): Promise<void> {
  const { email } = await requireAdmin();
  const file = await getFile(fileId);
  if (!file || file.leadId !== jobId) return;
  await deleteFile(file.id, email);
  revalidatePath(`/admin/jobs/${jobId}`);
}
