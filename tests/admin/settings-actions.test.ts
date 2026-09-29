import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
const saveRouteSettings = vi.fn(async () => {
  order.push("saveRoutes");
});
vi.mock("@/lib/routes/settings", () => ({ saveRouteSettings }));
const saveInstallRates = vi.fn(async (..._args: unknown[]) => {
  order.push("saveRates");
});
vi.mock("@/lib/admin/install-rates", () => ({ saveInstallRates }));
const saveDefaultAssignee = vi.fn(async (..._args: unknown[]): Promise<"ok" | "unknown-member"> => {
  order.push("saveDefault");
  return "ok";
});
vi.mock("@/lib/admin/lead-settings", () => ({ saveDefaultAssignee }));
const addAdmin = vi.fn(async (..._args: unknown[]) => {
  order.push("addAdmin");
  return true;
});
const removeAdmin = vi.fn(async (..._args: unknown[]) => {
  order.push("removeAdmin");
  return true;
});
vi.mock("@/lib/admin/admin-access", () => ({ addAdmin, removeAdmin }));
const sendAccessEmail = vi.fn(async (..._args: unknown[]) => true);
vi.mock("@/lib/admin/access-email", () => ({
  sendAccessEmail,
  adminSignInUrl: () => "https://pss.test/admin/sign-in",
}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const {
  addMember, removeMember, saveRouteSettingsAction, saveInstallRatesAction, saveLeadDefaultsAction, giveAccess, removeAccess,
} = await import("@/app/admin/settings/actions");
const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
};

beforeEach(() => {
  order.length = 0;
  vi.clearAllMocks();
  addAdmin.mockClear();
  removeAdmin.mockClear();
  // mockReset drops any mockResolvedValue(false) a test set, so it cannot leak into the next test.
  sendAccessEmail.mockReset().mockResolvedValue(true);
  vi.stubEnv("ADMIN_EMAILS", "owner@example.com,shade@example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
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

describe("route settings action", () => {
  const valid = { dayStart: "08:00", dayEnd: "17:30", consultationHours: "1", measureHours: "0.75", installHours: "4", serviceHours: "1.5" };

  it("checks the session before saving anything", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(saveRouteSettingsAction({}, form(valid))).rejects.toThrow("NEXT_REDIRECT");
    expect(saveRouteSettings).not.toHaveBeenCalled();
  });

  it("saves the parsed values and refreshes Settings and the schedule", async () => {
    expect(await saveRouteSettingsAction({}, form(valid))).toEqual({ ok: true });
    expect(order).toEqual(["auth", "saveRoutes"]);
    expect(saveRouteSettings).toHaveBeenCalledWith({
      dayStart: "08:00", dayEnd: "17:30",
      minutes: { consultation: 60, measure: 45, install: 240, service: 90 },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/schedule");
  });

  it("returns the first problem without saving", async () => {
    expect(await saveRouteSettingsAction({}, form({ ...valid, installHours: "1.3" }))).toEqual({ error: "Use quarter hours" });
    expect(saveRouteSettings).not.toHaveBeenCalled();
  });
});

describe("saveInstallRatesAction", () => {
  const jobLevel = { minimumCents: "$1,500", hardSurfaceCents: "10", highLadderCents: "50", motorizedCents: "15.50", measureCents: "$75",
    takedownCents: "18.60", shutterTakedownCents: "2.33", appSetupSmallCents: "69.75", appSetupLargeCents: "151.13" };

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
      { minimumCents: 150_000, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1550, measureCents: 7500,
        takedownCents: 1860, shutterTakedownCents: 233, appSetupSmallCents: 6975, appSetupLargeCents: 15_113 },
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

  it("refuses a blank measurement fee, naming it, rather than saving the fee as zero", async () => {
    const submitted = { ...jobLevel, measureCents: "", "rate-roller_shades": "25", "basis-roller_shades": "window" };
    expect(await saveInstallRatesAction({}, form(submitted))).toEqual({
      error: "Measurement fee: Enter an amount, or 0",
      values: submitted,
    });
    expect(saveInstallRates).not.toHaveBeenCalled();
  });

  it("names the extras box that is missing, and saves nothing", async () => {
    const { appSetupLargeCents: _omit, ...submitted } = { ...jobLevel, "rate-roller_shades": "25", "basis-roller_shades": "window" };
    const result = await saveInstallRatesAction({}, form(submitted));
    expect(result.error).toBe("App set-up, 4–9 motors: Enter an amount, or 0");
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

describe("saveLeadDefaultsAction", () => {
  const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

  it("checks the session before reading any input", async () => {
    requireAdmin.mockImplementationOnce(async () => {
      order.push("auth");
      throw new Error("NEXT_REDIRECT");
    });
    const data = form({ defaultAssignee: ID });
    const get = vi.spyOn(data, "get");
    await expect(saveLeadDefaultsAction({}, data)).rejects.toThrow("NEXT_REDIRECT");
    expect(get).not.toHaveBeenCalled();
    expect(saveDefaultAssignee).not.toHaveBeenCalled();
  });

  it("saves the chosen team member with who saved it, and refreshes Settings", async () => {
    expect(await saveLeadDefaultsAction({}, form({ defaultAssignee: ID }))).toEqual({ ok: true });
    expect(order).toEqual(["auth", "saveDefault"]);
    expect(saveDefaultAssignee).toHaveBeenCalledWith(ID, "owner@example.com");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
  });

  it("saves Nobody as no default", async () => {
    expect(await saveLeadDefaultsAction({}, form({ defaultAssignee: "" }))).toEqual({ ok: true });
    expect(saveDefaultAssignee).toHaveBeenCalledWith(null, "owner@example.com");
  });

  it("refuses a value that is not an id, without saving", async () => {
    expect(await saveLeadDefaultsAction({}, form({ defaultAssignee: "shade" }))).toEqual({
      error: "Pick someone from the team list",
    });
    expect(saveDefaultAssignee).not.toHaveBeenCalled();
  });

  it("refuses an id that is not on the team", async () => {
    saveDefaultAssignee.mockResolvedValueOnce("unknown-member");
    expect(await saveLeadDefaultsAction({}, form({ defaultAssignee: ID }))).toEqual({
      error: "That person is no longer on the team",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

const accessForm = (email: string) => {
  const data = new FormData();
  data.set("email", email);
  return data;
};

describe("giveAccess", () => {
  it("checks the session, normalizes, adds, emails, and says so", async () => {
    const result = await giveAccess({}, accessForm("  Alia@Example.com "));
    expect(order[0]).toBe("auth");
    expect(addAdmin).toHaveBeenCalledWith("alia@example.com", "owner@example.com");
    expect(sendAccessEmail).toHaveBeenCalledWith("alia@example.com", "owner@example.com");
    expect(result).toEqual({
      ok: "Access given to alia@example.com. We emailed them the sign-in link.",
      given: "alia@example.com",
    });
  });

  it("still gives access when the email fails, and says how to tell them", async () => {
    sendAccessEmail.mockResolvedValue(false);
    const result = await giveAccess({}, accessForm("alia@example.com"));
    expect(addAdmin).toHaveBeenCalled();
    expect(result.ok).toBe(
      "Access given to alia@example.com, but the welcome email could not be sent. Tell them to sign in at https://pss.test/admin/sign-in.",
    );
    expect(result.given).toBe("alia@example.com");
  });

  it("rejects an invalid address, keeping what was typed", async () => {
    const result = await giveAccess({}, accessForm("not-an-email"));
    expect(result).toEqual({ error: "Please enter a valid email address", email: "not-an-email" });
    expect(addAdmin).not.toHaveBeenCalled();
  });

  it("refuses an owner however it is typed, adding nothing", async () => {
    const result = await giveAccess({}, accessForm(" Shade@EXAMPLE.com "));
    expect(result).toEqual({ error: "That address is already an owner.", email: " Shade@EXAMPLE.com " });
    expect(addAdmin).not.toHaveBeenCalled();
  });

  it("does not email someone who already had access", async () => {
    addAdmin.mockResolvedValueOnce(false);
    const result = await giveAccess({}, accessForm(" Alia@Example.com"));
    expect(result).toEqual({ error: "That address already has access.", email: " Alia@Example.com", given: "alia@example.com" });
    expect(sendAccessEmail).not.toHaveBeenCalled();
  });
});

describe("removeAccess", () => {
  it("checks the session, then removes", async () => {
    await removeAccess("alia@example.com");
    expect(order).toEqual(["auth", "removeAdmin"]);
    expect(removeAdmin).toHaveBeenCalledWith("alia@example.com");
  });

  it("refuses to remove an owner, even posted by hand", async () => {
    await removeAccess(" SHADE@example.com");
    expect(removeAdmin).not.toHaveBeenCalled();
  });

  it("treats a hand-posted non-string as no address, without throwing", async () => {
    await expect(removeAccess(undefined as unknown as string)).resolves.toBeUndefined();
    expect(removeAdmin).toHaveBeenCalledWith("");
  });

  it("refuses to remove yourself", async () => {
    requireAdmin.mockResolvedValueOnce({ email: "alia@example.com" });
    await removeAccess("Alia@example.com");
    expect(removeAdmin).not.toHaveBeenCalled();
  });
});
