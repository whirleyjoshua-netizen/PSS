import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn(async () => ({ email: "owner@example.com" }));
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));

const calendarEnabled = vi.fn();
vi.mock("@/lib/calendar/config", () => ({ calendarEnabled }));

const getSyncState = vi.fn();
vi.mock("@/lib/calendar/store", () => ({ getSyncState }));

const listTeam = vi.fn();
vi.mock("@/lib/admin/team", () => ({ listTeam }));

const ROUTE_SETTINGS = { dayStart: "08:00", dayEnd: "17:00", minutes: { consultation: 60, measure: 60, install: 240, service: 90 } };
vi.mock("@/lib/routes/settings", () => ({ getRouteSettings: vi.fn(async () => ROUTE_SETTINGS) }));

vi.mock("@/app/admin/settings/actions", () => ({
  addMember: vi.fn(async () => ({})),
  removeMember: vi.fn(),
  saveRouteSettingsAction: vi.fn(async () => ({})),
}));

const { default: SettingsPage } = await import("@/app/admin/settings/page");

beforeEach(() => {
  requireAdmin.mockClear();
  calendarEnabled.mockReset();
  getSyncState.mockReset();
  listTeam.mockReset().mockResolvedValue([]);
});

describe("settings page", () => {
  it("checks the session first", async () => {
    calendarEnabled.mockReturnValue(false);
    getSyncState.mockResolvedValue({ subscriptionId: null, expiresAt: null, lastError: null, lastErrorAt: null });
    render(await SettingsPage());
    expect(requireAdmin).toHaveBeenCalled();
  });

  it("shows not connected when the feature is off", async () => {
    calendarEnabled.mockReturnValue(false);
    getSyncState.mockResolvedValue({ subscriptionId: null, expiresAt: null, lastError: null, lastErrorAt: null });
    render(await SettingsPage());
    expect(
      screen.getByText("Not connected. Follow docs/outlook-setup.md to connect the shared PSS Jobs calendar."),
    ).toBeInTheDocument();
  });

  it("shows the last sync error when connected but failing", async () => {
    calendarEnabled.mockReturnValue(true);
    getSyncState.mockResolvedValue({
      subscriptionId: "sub1",
      expiresAt: new Date("2026-09-20T18:00:00Z"),
      lastError: "Graph returned 401",
      lastErrorAt: new Date("2026-09-14T15:00:00Z"),
    });
    render(await SettingsPage());
    const message = screen.getByText(/Connected, but the last sync failed on/);
    expect(message).toHaveTextContent("Graph returned 401");
    expect(message).toHaveClass("text-overdue");
  });

  it("shows the last sync error without a time when none was recorded", async () => {
    calendarEnabled.mockReturnValue(true);
    getSyncState.mockResolvedValue({ subscriptionId: "sub1", expiresAt: null, lastError: "Graph returned 401", lastErrorAt: null });
    render(await SettingsPage());
    const message = screen.getByText("Connected, but the last sync failed: Graph returned 401");
    expect(message).toHaveClass("text-overdue");
  });

  it("shows the expiry time when connected with no error", async () => {
    calendarEnabled.mockReturnValue(true);
    getSyncState.mockResolvedValue({
      subscriptionId: "sub1",
      expiresAt: new Date("2026-09-20T18:00:00Z"),
      lastError: null,
      lastErrorAt: null,
    });
    render(await SettingsPage());
    expect(screen.getByText(/Connected\. Updates from Outlook are on until/)).toBeInTheDocument();
  });

  it("shows a waiting message when connected but not yet subscribed", async () => {
    calendarEnabled.mockReturnValue(true);
    getSyncState.mockResolvedValue({ subscriptionId: null, expiresAt: null, lastError: null, lastErrorAt: null });
    render(await SettingsPage());
    expect(
      screen.getByText("Connected. Waiting for the first daily check to switch on updates from Outlook."),
    ).toBeInTheDocument();
  });

  it("explains, rather than failing, when the calendar status cannot be read", async () => {
    calendarEnabled.mockReturnValue(true);
    getSyncState.mockRejectedValue(new Error('relation "calendar_sync_state" does not exist'));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(await SettingsPage());
    expect(
      screen.getByText("Connected, but the calendar status couldn't be read. Has migration 007 been applied?"),
    ).toBeInTheDocument();
  });
});

describe("team section", () => {
  it("says no one is added yet", async () => {
    calendarEnabled.mockReturnValue(false);
    render(await SettingsPage());
    const team = screen.getByRole("region", { name: "Team" });
    expect(team).toHaveTextContent("No one added yet.");
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Role")).toHaveDisplayValue("Designer");
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("lists each person with their tag and a Remove button", async () => {
    calendarEnabled.mockReturnValue(false);
    listTeam.mockResolvedValue([
      { id: "a", name: "Joshua", role: "installer" },
      { id: "b", name: "Shade", role: "designer" },
    ]);
    render(await SettingsPage());
    const team = screen.getByRole("region", { name: "Team" });
    expect(team).toHaveTextContent("Joshua — Installer");
    expect(team).toHaveTextContent("Shade — Designer");
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Remove Shade" })).toBeInTheDocument();
    expect(team).toHaveTextContent("Removing someone leaves their jobs unassigned.");
  });
});

describe("routes section", () => {
  it("shows the saved working day", async () => {
    calendarEnabled.mockReturnValue(false);
    render(await SettingsPage());
    expect(screen.getByRole("heading", { name: "Routes" })).toBeInTheDocument();
    expect(screen.getByLabelText("Day starts")).toHaveValue("08:00");
    expect(screen.getByLabelText("Day ends")).toHaveValue("17:00");
  });
});
