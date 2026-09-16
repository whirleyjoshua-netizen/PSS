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

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const settings = { minimumCents: 15_000, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500 };
const line = {
  treatment: "roller_shades" as const, count: 2, widthEighths: null, heightEighths: null,
  hardSurface: false, highLadder: false, motorized: false,
};

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
    await expect(saveInstallQuoteAction(JOB, "estimate", [line], 20_000)).rejects.toThrow("NEXT_REDIRECT");
    expect(rates.listInstallRates).not.toHaveBeenCalled();
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("rejects invalid lines without pricing or saving", async () => {
    const result = await saveInstallQuoteAction(JOB, "estimate", [{ ...line, count: 1.5 }], 20_000);
    expect(result.error).toBeTruthy();
    expect(calls).toEqual(["requireAdmin"]);
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("rejects an unknown kind", async () => {
    const result = await saveInstallQuoteAction(JOB, "draft" as never, [line], 20_000);
    expect(result.error).toBeTruthy();
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("asks for a line when there are none", async () => {
    expect(await saveInstallQuoteAction(JOB, "estimate", [], 0)).toEqual({ error: "Add at least one line before saving." });
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("returns the engine's message when a rate is missing", async () => {
    const result = await saveInstallQuoteAction(JOB, "estimate", [{ ...line, treatment: "shutters" as never }], 20_000);
    expect(result.error).toMatch(/no installation rate is set/i);
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("saves when the server's price matches the total the owner saw", async () => {
    expect(await saveInstallQuoteAction(JOB, "final", [line], 20_000)).toEqual({ ok: true });
    expect(calls[0]).toBe("requireAdmin");
    expect(saveInstallQuote).toHaveBeenCalledWith(
      JOB, "final",
      expect.objectContaining({ subtotalCents: 20_000, totalCents: 20_000, minimumApplied: false }),
      15_000, "owner@example.com",
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/jobs/${JOB}`);
  });

  it("refuses to save a different price than the owner saw when rates changed", async () => {
    // The page previewed $150 against old rates; the stored rates now price the line at $200.
    expect(await saveInstallQuoteAction(JOB, "final", [line], 15_000)).toEqual({
      error: "Rates changed since this page loaded. Review the new total and save again.",
    });
    expect(saveInstallQuote).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a previewed total that is not a whole, non-negative number of cents", async () => {
    for (const total of [-1, 1.5, Number.NaN, "20000" as never]) {
      const result = await saveInstallQuoteAction(JOB, "final", [line], total);
      expect(result.error).toBeTruthy();
    }
    expect(rates.listInstallRates).not.toHaveBeenCalled();
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("returns a generic message, not the database's, when the save fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    saveInstallQuote.mockRejectedValue(new Error('insert or update on table "install_quotes" violates foreign key constraint'));
    const result = await saveInstallQuoteAction(JOB, "final", [line], 20_000);
    expect(result).toEqual({ error: "Could not save this price. Try again." });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
