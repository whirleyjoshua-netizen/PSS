"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/session";
import { pollMailbox } from "@/lib/dc/import";
import { sendContract } from "@/lib/dc/send";
import { setLineOverride, setVersionChoices } from "@/lib/dc/store";

const PCT = /^\d{1,4}(\.\d{1,2})?$/;
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

/** Sends the contract the owner reviewed. The fingerprint is passed through untouched for Send to compare. */
export async function sendContractAction(jobId: string, versionId: string, fingerprint: string): Promise<{ error?: string; ok?: boolean; emailed?: boolean }> {
  const admin = await requireAdmin();
  if (typeof fingerprint !== "string" || fingerprint.length > 50_000) return { error: "Reload the page and try again." };
  const result = await sendContract({ jobId, versionId, fingerprint, actor: admin.email });
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
  if (seen === 0 || results.length === 0) return { message: "No new Dealer Copies." };
  return { message: imported > 0 ? `Imported ${imported}.` : "Checked. Nothing new to import (the owners were emailed about anything that needs fixing)." };
}
