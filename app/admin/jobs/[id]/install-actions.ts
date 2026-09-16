"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/session";
import { getInstallSettings, listInstallRates } from "@/lib/admin/install-rates";
import { saveInstallQuote, type InstallQuoteKind } from "@/lib/admin/install-quotes";
import { priceQuote, type LineInput, type PricedQuote } from "@/lib/admin/install-pricing";
import { installKindSchema, installLinesSchema } from "@/lib/admin/schema";

const previewedTotalSchema = z.number({ error: "Could not check this price. Reload the page and try again." })
  .int("Could not check this price. Reload the page and try again.")
  .min(0, "Could not check this price. Reload the page and try again.");

/**
 * Prices again on the server from the stored rates, and saves only if that matches
 * `previewedTotalCents` — the total the owner was looking at when they pressed Save.
 * A saved price is immutable, so it must be the price the owner saw: if a rate or the
 * minimum changed after the page loaded, nothing is saved and the owner is asked to
 * review the new total. The lines come straight from the browser, so they are validated
 * before pricing. Pricing problems are returned as written; database failures are logged
 * and reported generically, so raw database text never reaches the page.
 */
export async function saveInstallQuoteAction(
  jobId: string,
  kind: InstallQuoteKind,
  lines: LineInput[],
  previewedTotalCents: number,
): Promise<{ error?: string; ok?: boolean }> {
  const admin = await requireAdmin();
  const parsedKind = installKindSchema.safeParse(kind);
  if (!parsedKind.success) return { error: parsedKind.error.issues[0].message };
  const parsedLines = installLinesSchema.safeParse(lines);
  if (!parsedLines.success) return { error: parsedLines.error.issues[0].message };
  const parsedTotal = previewedTotalSchema.safeParse(previewedTotalCents);
  if (!parsedTotal.success) return { error: parsedTotal.error.issues[0].message };
  const [rates, settings] = await Promise.all([listInstallRates(), getInstallSettings()]);

  let priced: PricedQuote;
  try {
    priced = priceQuote(parsedLines.data, rates, settings);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not price this job." };
  }
  if (priced.totalCents !== parsedTotal.data) {
    return { error: "Rates changed since this page loaded. Review the new total and save again." };
  }

  try {
    await saveInstallQuote(jobId, parsedKind.data, priced, settings.minimumCents, admin.email);
  } catch (error) {
    console.error("Saving an installation price failed", error);
    return { error: "Could not save this price. Try again." };
  }
  revalidatePath(`/admin/jobs/${jobId}`);
  return { ok: true };
}
