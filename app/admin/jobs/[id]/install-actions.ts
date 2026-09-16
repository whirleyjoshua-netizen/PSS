"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/session";
import { getInstallSettings, listInstallRates } from "@/lib/admin/install-rates";
import { saveInstallQuote, type InstallQuoteKind } from "@/lib/admin/install-quotes";
import { priceFingerprint, priceQuote, type LineInput, type PricedQuote } from "@/lib/admin/install-pricing";
import { installKindSchema, installLinesSchema } from "@/lib/admin/schema";

const UNCHECKABLE = "Could not check this price. Reload the page and try again.";
/** A fingerprint is a short JSON string; the cap keeps a hand-crafted request from sending megabytes. */
const previewSchema = z.string({ error: UNCHECKABLE }).min(1, UNCHECKABLE).max(20_000, UNCHECKABLE);

/**
 * Prices again on the server from the stored rates, and saves only if that price's
 * fingerprint equals `previewFingerprint` — the price the owner was looking at when they
 * pressed Save. A saved price is immutable, so every figure it records must be one the owner
 * saw: if a rate or the minimum changed after the page loaded, nothing is saved and the owner
 * is asked to review the new total. The whole fingerprint is compared, not just the total,
 * because rates can move between lines or the minimum can hide a changed subtotal while the
 * total stays the same. The lines come straight from the browser, so they are validated
 * before pricing. Pricing problems are returned as written; database failures are logged
 * and reported generically, so raw database text never reaches the page.
 */
export async function saveInstallQuoteAction(
  jobId: string,
  kind: InstallQuoteKind,
  lines: LineInput[],
  previewFingerprint: string,
): Promise<{ error?: string; ok?: boolean }> {
  const admin = await requireAdmin();
  const parsedKind = installKindSchema.safeParse(kind);
  if (!parsedKind.success) return { error: parsedKind.error.issues[0].message };
  const parsedLines = installLinesSchema.safeParse(lines);
  if (!parsedLines.success) return { error: parsedLines.error.issues[0].message };
  const parsedPreview = previewSchema.safeParse(previewFingerprint);
  if (!parsedPreview.success) return { error: parsedPreview.error.issues[0].message };
  const [rates, settings] = await Promise.all([listInstallRates(), getInstallSettings()]);

  let priced: PricedQuote;
  try {
    priced = priceQuote(parsedLines.data, rates, settings);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not price this job." };
  }
  if (priceFingerprint(priced, settings.minimumCents) !== parsedPreview.data) {
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
