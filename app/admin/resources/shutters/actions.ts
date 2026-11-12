"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/session";
import { saveShutterRates } from "@/lib/admin/shutter-rates";
import { ratesSchema } from "@/lib/admin/shutter-pricing";

export type ShutterRatesState = { error?: string; ok?: boolean };

/** The editor sends the whole rate set as one JSON field; it is validated here before saving. */
export async function saveShutterRatesAction(_prev: ShutterRatesState, formData: FormData): Promise<ShutterRatesState> {
  const admin = await requireAdmin();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("rates") ?? ""));
  } catch {
    return { error: "The rates could not be read. Reload the page and try again." };
  }
  const parsed = ratesSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const [group, index] = issue.path;
    const where = typeof index === "number" ? `${group === "lines" ? "Line" : group === "options" ? "Add-on" : "Freight"} ${index + 1}: ` : "";
    return { error: `${where}${issue.message}` };
  }
  await saveShutterRates(parsed.data, admin.email);
  revalidatePath("/admin/resources/shutters");
  revalidatePath("/admin/resources/shutters/rates");
  return { ok: true };
}
