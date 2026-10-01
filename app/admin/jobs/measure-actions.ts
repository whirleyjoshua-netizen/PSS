"use server";

import { revalidatePath } from "next/cache";
import type { DocType } from "@/lib/admin/doc-types";
import { deleteFile, getFile, setDocType, setShared } from "@/lib/admin/files";
import { addMeasurement, deleteMeasurement, setKeptOfficial, updateMeasurement } from "@/lib/admin/measurements";
import { isMeasureKind, type MeasureKind } from "@/lib/admin/measure-kinds";
import { measurementSchema } from "@/lib/admin/schema";
import { requireAdmin } from "@/lib/admin/session";
import type { FormState } from "./actions";

const FIELDS = [
  "room", "label", "widthIn", "widthEighth", "heightIn", "heightEighth",
  "depthIn", "depthEighth", "mount", "requirements", "notes", "photoFileId", "quantity",
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

// Not exported: a "use server" file may export only async functions.
const KEPT_REFUSAL =
  "This job is using the designer measure as its official measure. Untick “Keep as official measure” to take a separate one.";

export async function saveMeasurement(
  jobId: string, windowId: string | null, kind: MeasureKind, formData: FormData,
): Promise<FormState> {
  const { email } = await requireAdmin();
  const values = captureValues(formData);
  if (!isMeasureKind(kind)) return { error: "Choose Designer measure or Official measure first.", values };
  const parsed = measurementSchema.safeParse(captureRaw(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  // An edit keeps the window's own kind; `kind` only decides which list a new window joins.
  if (windowId) {
    if (!(await updateMeasurement(jobId, windowId, parsed.data, email))) {
      return { error: "That job or window no longer exists." };
    }
  } else {
    const added = await addMeasurement(jobId, kind, parsed.data, email);
    if ("refused" in added) {
      return added.refused === "kept" ? { error: KEPT_REFUSAL, values } : { error: "That job or window no longer exists." };
    }
  }

  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function removeMeasurement(jobId: string, windowId: string): Promise<void> {
  const { email } = await requireAdmin();
  await deleteMeasurement(jobId, windowId, email);
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin");
}

/** Ticks or unticks "Keep as official measure". Anything but `true` unticks. */
export async function setKeptOfficialAction(jobId: string, kept: boolean): Promise<{ error?: string }> {
  const { email } = await requireAdmin();
  const result = await setKeptOfficial(jobId, kept === true, email);
  if (result === "missing") return { error: "That job no longer exists." };
  if (result === "has-official") {
    return { error: "An official measure is already recorded, so the designer measure can’t be kept as official." };
  }
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath(`/admin/jobs/${jobId}/measure`);
  return {};
}

export async function removeFile(jobId: string, fileId: string): Promise<void> {
  const { email } = await requireAdmin();
  const file = await getFile(fileId);
  if (!file || file.leadId !== jobId) return;
  await deleteFile(file.id, email);
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin");
}

export async function setFileShared(jobId: string, fileId: string, shared: boolean): Promise<void> {
  const { email } = await requireAdmin();
  await setShared(jobId, fileId, shared, email);
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin");
}

/** Labels a document. Sharing is a separate, explicit action; this never shares. */
export async function setFileDocType(jobId: string, fileId: string, type: DocType | null): Promise<void> {
  const { email } = await requireAdmin();
  await setDocType(jobId, fileId, type, email);
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin");
}
