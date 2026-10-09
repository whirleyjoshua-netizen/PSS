"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/session";
import { pollMailbox } from "@/lib/dc/import";
import { sendContract, sendQuote } from "@/lib/dc/send";
import { addQuoteOption, setLineOverride, setVersionChoices, setVersionDiscount, validDiscountLabel } from "@/lib/dc/store";

const PCT = /^\d{1,4}(\.\d{1,2})?$/;
const DOLLARS = /^\$?\d{1,3}(,?\d{3})*(\.\d{1,2})?$/;
const LOCKED = "This version can no longer be changed.";
const refresh = (jobId: string) => revalidatePath(`/admin/jobs/${jobId}`);

/** One line's % of MSRP. Blank goes back to the Settings markup. Drafts only. */
export async function setLinePctAction(jobId: string, versionId: string, position: number, raw: string): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  const text = typeof raw === "string" ? raw.trim() : "";
  const pct = text === "" ? null : Number(text);
  if (pct !== null && (!PCT.test(text) || pct <= 0 || pct > 1000)) return { error: "Enter a percentage like 60 or 57.5" };
  if (!(await setLineOverride(jobId, versionId, position, pct, admin.email))) return { error: LOCKED };
  refresh(jobId);
  return {};
}

/** Waive the HD handling fee, or no installation on this job. Only real booleans are passed on. */
export async function setChoicesAction(jobId: string, versionId: string, choices: { waiveHandling?: boolean; noInstall?: boolean }): Promise<{ error?: string }> {
  await requireAdmin();
  const clean = {
    waiveHandling: typeof choices?.waiveHandling === "boolean" ? choices.waiveHandling : undefined,
    noInstall: typeof choices?.noInstall === "boolean" ? choices.noInstall : undefined,
  };
  if (!(await setVersionChoices(jobId, versionId, clean))) return { error: LOCKED };
  refresh(jobId);
  return {};
}

/**
 * The version's discount: a percent ("10") or a dollar amount ("200" or "$1,250.50"), with the label the client
 * sees. Null removes it. Drafts only.
 */
export async function setDiscountAction(
  jobId: string, versionId: string, input: { kind: "pct" | "amount"; value: string; label: string } | null,
): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  let discount: { pct: number | null; amountCents: number | null; label: string } | null = null;
  if (input !== null) {
    const value = typeof input?.value === "string" ? input.value.trim() : "";
    const label = typeof input?.label === "string" ? input.label.trim() : "";
    if (!validDiscountLabel(label)) return { error: "Give the discount a name of up to 60 characters, like Holiday special." };
    if (input.kind === "pct") {
      const pct = Number(value.replace(/%$/, ""));
      if (!PCT.test(value.replace(/%$/, "")) || pct <= 0 || pct >= 100) return { error: "Enter a percentage over 0 and under 100, like 10" };
      discount = { pct, amountCents: null, label };
    } else if (input.kind === "amount") {
      const cents = Math.round(Number(value.replace(/[$,]/g, "")) * 100);
      if (!DOLLARS.test(value) || cents <= 0) return { error: "Enter a dollar amount like 200 or 150.50" };
      discount = { pct: null, amountCents: cents, label };
    } else {
      return { error: "Choose percent or dollars." };
    }
  }
  if (!(await setVersionDiscount(jobId, versionId, discount, admin.email))) return { error: LOCKED };
  refresh(jobId);
  return {};
}

/** Send quote (spec §2). The fingerprint is passed through untouched for Send quote to compare. */
export async function sendQuoteAction(jobId: string, versionId: string, fingerprint: string): Promise<{ error?: string; ok?: boolean; emailed?: boolean }> {
  const admin = await requireAdmin();
  if (typeof fingerprint !== "string" || fingerprint.length > 50_000) return { error: "Reload the page and try again." };
  let result: Awaited<ReturnType<typeof sendQuote>>;
  try {
    result = await sendQuote({ jobId, versionId, fingerprint, actor: admin.email });
  } catch (error) {
    // Blob or pdf-lib can throw. The owner gets a plain answer, not the error page.
    console.error("Sending the quote failed", error);
    return { error: "The quote could not be sent. Try again, and if it keeps failing, contact support." };
  }
  if ("error" in result) return { error: result.error };
  refresh(jobId);
  return { ok: true, emailed: result.emailed };
}

/** Send contract (spec §2): the recovery when the client approved but the contract did not go out. */
export async function sendContractAction(jobId: string, versionId: string): Promise<{ error?: string; ok?: boolean; emailed?: boolean }> {
  const admin = await requireAdmin();
  let result: Awaited<ReturnType<typeof sendContract>>;
  try {
    result = await sendContract({ jobId, versionId, actor: admin.email });
  } catch (error) {
    console.error("Sending the contract failed", error);
    return { error: "The contract could not be sent. Try again, and if it keeps failing, contact support." };
  }
  if ("error" in result) return { error: result.error };
  refresh(jobId);
  return { ok: true, emailed: result.emailed };
}

/** Checks support@ for Dealer Copies now, instead of waiting for the cron. */
export async function checkNowAction(jobId: string): Promise<{ message: string }> {
  await requireAdmin();
  let polled: Awaited<ReturnType<typeof pollMailbox>>;
  try {
    polled = await pollMailbox();
  } catch (error) {
    console.error("Checking the mailbox for Dealer Copies failed", error);
    return { message: "Could not check the mailbox. Try again in a few minutes." };
  }
  const { seen, results } = polled;
  refresh(jobId);
  const imported = results.filter((r) => r.outcome === "imported").length;
  const failed = results.filter((r) => r.outcome === "failed").length;
  if (seen === 0 || results.length === 0) return { message: "No new Dealer Copies." };
  // A failure is never emailed on the spot, so it must be said here rather than hidden behind "the owners were emailed".
  const parts = [
    imported > 0 ? `Imported ${imported}.` : null,
    failed > 0 ? `${failed} Dealer ${failed === 1 ? "Copy" : "Copies"} could not be imported. Try again shortly.` : null,
  ].filter((p): p is string => p !== null);
  return { message: parts.length > 0 ? parts.join(" ") : "Checked. Nothing new to import (the owners were emailed about anything that needs fixing)." };
}

/** Add another quote (quote options spec §3): the next letter, B when none. The store refuses a Lost or signed job and past Z. */
export async function addQuoteOptionAction(jobId: string): Promise<{ error?: string; letter?: string }> {
  const admin = await requireAdmin();
  const result = await addQuoteOption(jobId, admin.email);
  if ("error" in result) return { error: result.error };
  refresh(jobId);
  return { letter: result.letter };
}
