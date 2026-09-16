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
    await expect(saveInstallQuoteAction(JOB, "estimate", [line])).rejects.toThrow("NEXT_REDIRECT");
    expect(rates.listInstallRates).not.toHaveBeenCalled();
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("rejects invalid lines without pricing or saving", async () => {
    const result = await saveInstallQuoteAction(JOB, "estimate", [{ ...line, count: 1.5 }]);
    expect(result.error).toBeTruthy();
    expect(calls).toEqual(["requireAdmin"]);
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("rejects an unknown kind", async () => {
    const result = await saveInstallQuoteAction(JOB, "draft" as never, [line]);
    expect(result.error).toBeTruthy();
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("asks for a line when there are none", async () => {
    expect(await saveInstallQuoteAction(JOB, "estimate", [])).toEqual({ error: "Add at least one line before saving." });
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("returns the engine's message when a rate is missing", async () => {
    const result = await saveInstallQuoteAction(JOB, "estimate", [{ ...line, treatment: "shutters" as never }]);
    expect(result.error).toMatch(/no installation rate is set/i);
    expect(saveInstallQuote).not.toHaveBeenCalled();
  });

  it("prices on the server from the stored rates and saves that result", async () => {
    expect(await saveInstallQuoteAction(JOB, "final", [line])).toEqual({ ok: true });
    expect(calls[0]).toBe("requireAdmin");
    expect(saveInstallQuote).toHaveBeenCalledWith(
      JOB, "final",
      expect.objectContaining({ subtotalCents: 20_000, totalCents: 20_000, minimumApplied: false }),
      15_000, "owner@example.com",
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/jobs/${JOB}`);
  });
});
