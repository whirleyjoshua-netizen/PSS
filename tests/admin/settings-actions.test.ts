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
const saveRouteSettings = vi.fn(async () => {
  order.push("saveRoutes");
});
vi.mock("@/lib/routes/settings", () => ({ saveRouteSettings }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const { addMember, removeMember, saveRouteSettingsAction } = await import("@/app/admin/settings/actions");
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
