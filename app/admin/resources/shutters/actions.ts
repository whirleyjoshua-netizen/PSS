"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/session";
import { saveShutterRates } from "@/lib/admin/shutter-rates";
import { makeShutterQuote } from "@/lib/admin/shutter-quote";
import { SUPPLIERS, ratesSchema } from "@/lib/admin/shutter-pricing";

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

export type MakeQuoteState = { error?: string };

const quoteInputSchema = z.object({
  supplier: z.enum(SUPPLIERS),
  windows: z.array(z.object({
    room: z.string().max(120),
    lineId: z.string().min(1).max(64),
    widthEighths: z.number().int().min(1).max(4800),
    heightEighths: z.number().int().min(1).max(4800),
    quantity: z.number().int().min(1).max(99),
    panels: z.number().int().min(1).max(20),
    options: z.record(z.string().max(64), z.number().min(0).max(1000)),
  })).min(1, "Add at least one window.").max(100),
  orderOptions: z.record(z.string().max(64), z.number().min(0).max(1000)),
});

/**
 * Make this a quote: the guide sends the windows exactly as priced on screen, the job and the total it showed.
 * The server prices them again and files the quote only when the totals match, then opens the job's Quote tab.
 */
export async function makeShutterQuoteAction(_prev: MakeQuoteState, formData: FormData): Promise<MakeQuoteState> {
  const admin = await requireAdmin();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("quote") ?? ""));
  } catch {
    return { error: "The windows could not be read. Reload the page and try again." };
  }
  const parsed = quoteInputSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "The windows could not be read." };
  const expected = Number(formData.get("total"));
  if (!Number.isInteger(expected) || expected <= 0) return { error: "Price every window first." };
  const result = await makeShutterQuote({ jobId: String(formData.get("jobId") ?? ""), quote: parsed.data, expectedTotalCents: expected, actor: admin.email });
  if ("error" in result) return { error: result.error };
  revalidatePath(`/admin/jobs/${result.jobId}`);
  redirect(`/admin/jobs/${result.jobId}?tab=quote`);
}
