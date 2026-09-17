import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const rates = { listInstallRates: vi.fn(), getInstallSettings: vi.fn() };
vi.mock("@/lib/admin/install-rates", () => rates);
const saveInstallQuote = vi.fn();
vi.mock("@/lib/admin/install-quotes", () => ({ saveInstallQuote }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const { saveInstallQuoteAction } = await import("@/app/admin/jobs/[id]/install-actions");
const { priceQuote, priceFingerprint } = await import("@/lib/admin/install-pricing");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const settings = { minimumCents: 15_000, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500 };
const line = {
  treatment: "roller_shades" as const, count: 2, widthEighths: null, heightEighths: null,
  hardSurface: false, highLadder: false, motorized: false,
};

/** What the owner's page would send: the fingerprint of the price it showed. */
const shown = (lines: typeof line[], rateCents = 10_000, shownSettings = settings) =>
  priceFingerprint(
    priceQuote(lines, [{ treatment: "roller_shades", basis: "window", rateCents }], shownSettings),
    shownSettings.minimumCents,
  );
const MATCHING = () => shown([line]);

beforeEach(() => {
  calls.length = 0;
  requireAdmin.mockReset().mockImplementation(async () => { calls.push("requireAdmin"); return { email: "owner@example.com" }; });
  rates.listInstallRates.mockReset().mockImplementation(async () => {
    calls.push("listInstallRates");
    return [{ treatment: "roller_shades", basis: "window", rateCents: 10_000 }];
  });
  rates.getInstallSettings.mockReset().mockImplementation(async () => { calls.push("getInstallSettings"); return settings; });
  saveInstallQuote.mockReset().mockResolvedValue("quote-id");
  revalidatePath.mockReset();
});

describe("saveInstallQuoteAction", () => {
  it("checks the session before anything else", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(saveInstallQuoteAction(JOB, "estimate", [line], MATCHING())).rejects.toThrow("NEXT_REDIRECT");
    expect(rates.listInstallRates).not.toHaveBeenCalled();
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("rejects invalid lines without pricing or saving", async () => {
    const result = await saveInstallQuoteAction(JOB, "estimate", [{ ...line, count: 1.5 }], MATCHING());
    expect(result.error).toBeTruthy();
    expect(calls).toEqual(["requireAdmin"]);
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("rejects an unknown kind", async () => {
    const result = await saveInstallQuoteAction(JOB, "draft" as never, [line], MATCHING());
    expect(result.error).toBeTruthy();
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("asks for a line when there are none", async () => {
    // The fingerprint is irrelevant here: an empty job is refused before any price is compared.
    expect(await saveInstallQuoteAction(JOB, "estimate", [], MATCHING())).toEqual({ error: "Add at least one line before saving." });
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("returns the engine's message when a rate is missing", async () => {
    const result = await saveInstallQuoteAction(JOB, "estimate", [{ ...line, treatment: "shutters" as never }], MATCHING());
    expect(result.error).toMatch(/no installation rate is set/i);
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("saves when the server's price matches the price the owner saw", async () => {
    expect(await saveInstallQuoteAction(JOB, "final", [line], MATCHING())).toEqual({ ok: true });
    expect(calls[0]).toBe("requireAdmin");
    expect(saveInstallQuote).toHaveBeenCalledWith(
      JOB, "final",
      expect.objectContaining({ subtotalCents: 20_000, totalCents: 20_000, minimumApplied: false }),
      15_000, "owner@example.com",
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/jobs/${JOB}`);
  });

  it("refuses to save a different price than the owner saw when rates changed", async () => {
    // The page previewed against a $75 rate; the stored rate is now $100.
    expect(await saveInstallQuoteAction(JOB, "final", [line], shown([line], 7_500))).toEqual({
      error: "Rates changed since this page loaded. Review the new total and save again.",
    });
    expect(saveInstallQuote).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses when the total matches but the lines came to a different subtotal", async () => {
    // A $500 minimum masks the rate change: the page saw 2 rollers at $75 ($150 of lines) and the
    // server now prices them at $100 ($200 of lines), but both totals are the $500 minimum.
    const masking = { ...settings, minimumCents: 50_000 };
    rates.getInstallSettings.mockImplementation(async () => masking);
    const result = await saveInstallQuoteAction(JOB, "final", [line], shown([line], 7_500, masking));
    expect(result).toEqual({ error: "Rates changed since this page loaded. Review the new total and save again." });
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("refuses when only the minimum changed, since the saved price records it", async () => {
    rates.getInstallSettings.mockImplementation(async () => ({ ...settings, minimumCents: 16_000 }));
    // Lines come to $200 either way and clear both minimums, so the total is unchanged and the
    // minimum is not even shown. The save is still refused on purpose: the saved price records
    // the minimum in force (spec §3), and that must be the one this page was loaded with.
    const result = await saveInstallQuoteAction(JOB, "final", [line], MATCHING());
    expect(result.error).toMatch(/^Rates changed since this page loaded/);
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("rejects a preview that is not a price fingerprint before reading any rates", async () => {
    for (const preview of [20_000, "", "x".repeat(20_001), null] as never[]) {
      const result = await saveInstallQuoteAction(JOB, "final", [line], preview);
      expect(result.error).toBeTruthy();
    }
    expect(rates.listInstallRates).not.toHaveBeenCalled();
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("returns a generic message, not the database's, when the save fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    saveInstallQuote.mockRejectedValue(new Error('insert or update on table "install_quotes" violates foreign key constraint'));
    const result = await saveInstallQuoteAction(JOB, "final", [line], MATCHING());
    expect(result).toEqual({ error: "Could not save this price. Try again." });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
