import { revalidatePath } from "next/cache";

/** What every job form action hands back to useActionState. */
export type FormState = {
  error?: string;
  ok?: boolean;
  /** The submitted values, echoed back so a failed submit can keep them. */
  values?: Record<string, string | string[]>;
};

export const MISSING: FormState = { error: "That job no longer exists." };

export const refresh = (id: string) => {
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${id}`);
};

/** Captures a FormData's entries so a failed submit can restore them as defaults. */
export function captureValues(formData: FormData, keys: string[]): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const key of keys) {
    const all = formData.getAll(key);
    if (all.length === 0) continue;
    values[key] = all.length > 1 ? all.map(String) : String(all[0]);
  }
  return values;
}
