"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/session";
import { getInstallSettings, listInstallRates } from "@/lib/admin/install-rates";
import { saveInstallQuote, type InstallQuoteKind } from "@/lib/admin/install-quotes";
import { priceQuote, type LineInput } from "@/lib/admin/install-pricing";
import { installKindSchema, installLinesSchema } from "@/lib/admin/schema";

/**
 * Prices on the server from the stored rates. The browser's total is a preview;
 * what gets saved is priced here, so a stale page cannot write a stale price.
 * The lines come straight from the browser, so they are validated before pricing.
 */
export async function saveInstallQuoteAction(
  jobId: string,
  kind: InstallQuoteKind,
  lines: LineInput[],
): Promise<{ error?: string; ok?: boolean }> {
  const admin = await requireAdmin();
  const parsedKind = installKindSchema.safeParse(kind);
  if (!parsedKind.success) return { error: parsedKind.error.issues[0].message };
  const parsedLines = installLinesSchema.safeParse(lines);
  if (!parsedLines.success) return { error: parsedLines.error.issues[0].message };
  const [rates, settings] = await Promise.all([listInstallRates(), getInstallSettings()]);
  try {
    const priced = priceQuote(parsedLines.data, rates, settings);
    await saveInstallQuote(jobId, parsedKind.data, priced, settings.minimumCents, admin.email);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not price this job." };
  }
  revalidatePath(`/admin/jobs/${jobId}`);
  return { ok: true };
}
