import { describe, it, expect, vi, beforeEach } from "vitest";

const order: string[] = [];
const requireAdmin = vi.fn(async () => {
  order.push("auth");
  return { email: "owner@example.com" };
});
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const addTeamMember = vi.fn(async () => {
  order.push("add");
  return "id-1";
});
const removeTeamMember = vi.fn(async () => {
  order.push("remove");
  return true;
});
vi.mock("@/lib/admin/team", () => ({ addTeamMember, removeTeamMember }));
const saveInstallRates = vi.fn(async () => {
  order.push("saveRates");
});
vi.mock("@/lib/admin/install-rates", () => ({ saveInstallRates }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const { addMember, removeMember, saveInstallRatesAction } = await import("@/app/admin/settings/actions");
const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
};

beforeEach(() => {
  order.length = 0;
  vi.clearAllMocks();
});

describe("team actions", () => {
  it("checks the session before adding, then refreshes Settings and the board", async () => {
    expect(await addMember({}, form({ name: " Shade ", role: "designer" }))).toEqual({ ok: true });
    expect(order).toEqual(["auth", "add"]);
    expect(addTeamMember).toHaveBeenCalledWith("Shade", "designer");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("returns the first problem and keeps the typed name", async () => {
    expect(await addMember({}, form({ name: "Shade", role: "" }))).toEqual({
      error: "Pick Designer or Installer",
      name: "Shade",
    });
    expect(addTeamMember).not.toHaveBeenCalled();
  });

  it("checks the session before removing", async () => {
    await removeMember("3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c");
    expect(order).toEqual(["auth", "remove"]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
  });

  it("refreshes open job pages so a removed person disappears", async () => {
    await removeMember("3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/jobs/[id]", "page");
  });
});

describe("saveInstallRatesAction", () => {
  const jobLevel = { minimumCents: "$1,500", hardSurfaceCents: "10", highLadderCents: "50", motorizedCents: "15.50" };

  it("checks the session before reading any input", async () => {
    requireAdmin.mockImplementationOnce(async () => {
      order.push("auth");
      throw new Error("NEXT_REDIRECT");
    });
    const data = form({ ...jobLevel, "rate-roller_shades": "25", "basis-roller_shades": "window" });
    const get = vi.spyOn(data, "get");
    const entries = vi.spyOn(data, Symbol.iterator as never);
    await expect(saveInstallRatesAction({}, data)).rejects.toThrow("NEXT_REDIRECT");
    expect(get).not.toHaveBeenCalled();
    expect(entries).not.toHaveBeenCalled();
    expect(saveInstallRates).not.toHaveBeenCalled();
  });

  it("saves the typed amounts as cents, with who saved them", async () => {
    const result = await saveInstallRatesAction({}, form({
      ...jobLevel,
      "rate-roller_shades": "$25", "basis-roller_shades": "window",
      "rate-shutters": "3", "basis-shutters": "sq_ft",
    }));
    expect(result).toEqual({ ok: true });
    expect(order).toEqual(["auth", "saveRates"]);
    expect(saveInstallRates).toHaveBeenCalledWith(
      expect.arrayContaining([
        { treatment: "roller_shades", basis: "window", rateCents: 2500 },
        { treatment: "shutters", basis: "sq_ft", rateCents: 300 },
      ]),
      { minimumCents: 150_000, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1550 },
      "owner@example.com",
    );
    expect(saveInstallRates.mock.calls[0][0]).toHaveLength(2);
  });

  it("leaves a blank treatment rate out, which is what deletes it", async () => {
    await saveInstallRatesAction({}, form({
      ...jobLevel,
      "rate-roller_shades": "25", "basis-roller_shades": "window",
      "rate-shutters": "  ", "basis-shutters": "sq_ft",
    }));
    expect(saveInstallRates.mock.calls[0][0]).toEqual([{ treatment: "roller_shades", basis: "window", rateCents: 2500 }]);
  });

  it("refuses a blank job-level field, naming it, and echoes what was typed", async () => {
    const submitted = { ...jobLevel, minimumCents: "", "rate-roller_shades": "25", "basis-roller_shades": "window" };
    expect(await saveInstallRatesAction({}, form(submitted))).toEqual({
      error: "Minimum job cost: Enter an amount, or 0",
      values: submitted,
    });
    expect(saveInstallRates).not.toHaveBeenCalled();
  });

  it("names the treatment whose rate is not money, and echoes what was typed", async () => {
    const submitted = { ...jobLevel, "rate-shutters": "abc", "basis-shutters": "sq_ft" };
    const result = await saveInstallRatesAction({}, form(submitted));
    expect(result.error).toMatch(/^Shutters: /);
    expect(result.values).toEqual(submitted);
    expect(saveInstallRates).not.toHaveBeenCalled();
  });
});
