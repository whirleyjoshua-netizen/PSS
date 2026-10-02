import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieGet = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }) }));
const saveQuestionnaire = vi.fn();
vi.mock("@/lib/leads/questionnaire", () => ({ saveQuestionnaire }));
const redirect = vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); });
vi.mock("next/navigation", () => ({ redirect }));
const geocodeLead = vi.fn();
vi.mock("@/lib/routes/geocode", () => ({ geocodeLead }));
const syncJobCalendar = vi.fn();
vi.mock("@/lib/calendar/sync", () => ({ syncJobCalendar }));
vi.mock("next/server", () => ({ after: (cb: () => unknown) => { (cb() as Promise<unknown> | undefined)?.catch?.(() => {}); } }));
const { submitQuestionnaire } = await import("@/app/(site)/thank-you/actions");

const EXPIRED = "This form has expired — call us and we'll take it from here.";
const form = (entries: [string, string][]) => { const d = new FormData(); for (const [k, v] of entries) d.append(k, v); return d; };

beforeEach(() => {
  cookieGet.mockReset().mockImplementation((name: string) => (name === "pss_q" ? { value: "the-key" } : undefined));
  saveQuestionnaire.mockReset().mockResolvedValue("lead-1");
  geocodeLead.mockReset().mockResolvedValue(undefined);
  syncJobCalendar.mockReset().mockResolvedValue(undefined);
  redirect.mockClear();
});

describe("submitQuestionnaire and the gate code", () => {
  // Owner 2026-10-01: the gate code is taken in the scheduler, not asked of the customer, so a
  // submitted gateCode is ignored and nothing the questionnaire saves reaches Outlook.
  it("ignores a gate code sent anyway and never syncs the calendar", async () => {
    await expect(submitQuestionnaire({}, form([["windowCountExact", "12"], ["gateCode", "#4321"]]))).rejects.toThrow("NEXT_REDIRECT /thank-you/all-set");
    expect(saveQuestionnaire.mock.calls[0][1]).not.toHaveProperty("gateCode");
    expect(syncJobCalendar).not.toHaveBeenCalled();
  });
});

describe("submitQuestionnaire geocoding", () => {
  it("geocodes the saved lead when an address was given, and still redirects if that fails", async () => {
    geocodeLead.mockRejectedValue(new Error("google down"));
    await expect(submitQuestionnaire({}, form([["address", "12 Sample St"]]))).rejects.toThrow("NEXT_REDIRECT /thank-you/all-set");
    expect(geocodeLead).toHaveBeenCalledWith("lead-1");
  });
  it("does not geocode without an address", async () => {
    await expect(submitQuestionnaire({}, form([["windowCountExact", "3"]]))).rejects.toThrow("NEXT_REDIRECT");
    expect(geocodeLead).not.toHaveBeenCalled();
  });
  it("does not geocode when the save found no lead", async () => {
    saveQuestionnaire.mockResolvedValue(null);
    await submitQuestionnaire({}, form([["address", "12 Sample St"]]));
    expect(geocodeLead).not.toHaveBeenCalled();
  });
});

describe("submitQuestionnaire", () => {
  it("saves the answers against the cookie's key and redirects to all-set", async () => {
    await expect(submitQuestionnaire({}, form([
      ["windowCountExact", "12"], ["treatmentTypes", "shutters"], ["treatmentTypes", "cellular_shades"], ["motorized", "on"],
      ["address", "12 Sample St"], ["finish", "luxury"],
    ]))).rejects.toThrow("NEXT_REDIRECT /thank-you/all-set");
    expect(saveQuestionnaire).toHaveBeenCalledWith("the-key", {
      windowCountExact: 12, treatmentTypes: ["shutters", "cellular_shades"], motorized: true,
      address: "12 Sample St", finish: "luxury",
    });
  });
  it("ignores any key sent in the form", async () => {
    await expect(submitQuestionnaire({}, form([["key", "attacker"], ["pss_q", "attacker"], ["windowCountExact", "3"]])))
      .rejects.toThrow("NEXT_REDIRECT");
    expect(saveQuestionnaire.mock.calls[0][0]).toBe("the-key");
  });
  it("says the form expired without a cookie, and saves nothing", async () => {
    cookieGet.mockReturnValue(undefined);
    expect(await submitQuestionnaire({}, form([["windowCountExact", "3"]]))).toMatchObject({ error: EXPIRED });
    expect(saveQuestionnaire).not.toHaveBeenCalled();
  });
  it("says the form expired when the key no longer matches", async () => {
    saveQuestionnaire.mockResolvedValue(false);
    expect(await submitQuestionnaire({}, form([["windowCountExact", "3"]]))).toMatchObject({ error: EXPIRED });
  });
  it("redirects to all-set on an empty submit without saving", async () => {
    await expect(submitQuestionnaire({}, form([]))).rejects.toThrow("NEXT_REDIRECT /thank-you/all-set");
    expect(saveQuestionnaire).not.toHaveBeenCalled();
  });
  it("keeps what was typed when validation fails", async () => {
    const state = await submitQuestionnaire({}, form([["address", "x".repeat(201)], ["treatmentTypes", "shutters"]]));
    expect(state.error).toBe("Keep the address under 200 characters");
    expect(state.values).toMatchObject({ address: "x".repeat(201), treatmentTypes: "shutters" });
    expect(saveQuestionnaire).not.toHaveBeenCalled();
  });
  it("reports a failed save without losing the answers", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    saveQuestionnaire.mockRejectedValue(new Error("Neon down"));
    const state = await submitQuestionnaire({}, form([["windowCountExact", "3"]]));
    expect(state.error).toMatch(/couldn't save/i);
    expect(state.values).toMatchObject({ windowCountExact: "3" });
  });
});
