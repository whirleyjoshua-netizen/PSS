import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AddedAdmin } from "@/lib/admin/admin-access";

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
const routePlanningConfigured = vi.fn(() => false);
vi.mock("@/lib/routes/optimize", () => ({ routePlanningConfigured }));
vi.mock("@/lib/admin/install-rates", () => ({
  listInstallRates: vi.fn(async () => []),
  getInstallSettings: vi.fn(async () => ({ minimumCents: 0, hardSurfaceCents: 0, highLadderCents: 0, motorizedCents: 0 })),
}));

vi.mock("@/app/admin/settings/actions", () => ({
  addMember: vi.fn(async () => ({})),
  removeMember: vi.fn(),
  saveRouteSettingsAction: vi.fn(async () => ({})),
  saveInstallRatesAction: vi.fn(async () => ({})),
  saveLeadDefaultsAction: vi.fn(async () => ({})),
  giveAccess: vi.fn(async () => ({})),
  removeAccess: vi.fn(),
  saveMarkupAction: vi.fn(async () => ({})),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const dcStore = {
  listMarkupRules: vi.fn(async (): Promise<Record<string, number>> => ({})),
  listSeenCollections: vi.fn(async (): Promise<string[]> => []),
  getDcSettings: vi.fn(async () => ({ termsPathname: null as string | null, termsUpdatedAt: null as Date | null, lastPolledAt: null })),
};
vi.mock("@/lib/dc/store", () => dcStore);
const getDefaultAssignee = vi.fn(async (): Promise<string | null> => null);
vi.mock("@/lib/admin/lead-settings", () => ({ getDefaultAssignee }));

const listAddedAdmins = vi.fn(async (): Promise<AddedAdmin[]> => []);
vi.mock("@/lib/admin/admin-access", () => ({ listAddedAdmins }));

const { default: SettingsPage } = await import("@/app/admin/settings/page");

beforeEach(() => {
  requireAdmin.mockClear();
  calendarEnabled.mockReset();
  getSyncState.mockReset();
  listTeam.mockReset().mockResolvedValue([]);
  vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
});

describe("settings page", () => {
  it("offers the default for new leads with the saved choice", async () => {
    calendarEnabled.mockReturnValue(false);
    const shade = { id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", name: "Shade Momodu", role: "designer" };
    listTeam.mockResolvedValue([shade]);
    getDefaultAssignee.mockResolvedValueOnce(shade.id);
    render(await SettingsPage());
    expect(screen.getByLabelText("Default for new leads")).toHaveValue(shade.id);
  });

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

describe("admin access section", () => {
  it("lists who can sign in, owners first", async () => {
    calendarEnabled.mockReturnValue(false);
    listAddedAdmins.mockResolvedValueOnce([
      { email: "alia@example.com", addedBy: "owner@example.com", addedAt: new Date("2026-09-28T18:00:00Z") },
    ]);
    render(await SettingsPage());
    const region = screen.getByRole("region", { name: "Admin access" });
    expect(region).toHaveTextContent(/owner@example\.com[\s\S]*alia@example\.com/);
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

  it("shows which pieces are set up, never the key values", async () => {
    calendarEnabled.mockReturnValue(false);
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_KEY", "browser-key-secret");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAP_ID", "map-id-secret");
    vi.stubEnv("GOOGLE_GEOCODING_KEY", "");
    routePlanningConfigured.mockReturnValueOnce(true);
    try {
      const { container } = render(await SettingsPage());
      const routes = screen.getByRole("region", { name: "Routes" });
      expect(routes).toHaveTextContent("Route planning is connected.");
      expect(routes).toHaveTextContent("Map is connected.");
      expect(routes).toHaveTextContent("Address lookup is not set up yet. Follow docs/route-setup.md.");
      expect(container.innerHTML).not.toContain("browser-key-secret");
      expect(container.innerHTML).not.toContain("map-id-secret");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("installation rates section", () => {
  it("renders the installation rates section", async () => {
    calendarEnabled.mockReturnValue(false);
    render(await SettingsPage());
    expect(screen.getByRole("region", { name: "Installation rates" })).toBeInTheDocument();
  });
});

describe("Direct Connect sections", () => {
  it("shows markup per product line and the contract terms after installation rates", async () => {
    calendarEnabled.mockReturnValue(false);
    dcStore.listSeenCollections.mockResolvedValueOnce(["Duette", "Pirouette"]);
    dcStore.listMarkupRules.mockResolvedValueOnce({ Duette: 60 });
    dcStore.getDcSettings.mockResolvedValueOnce({
      termsPathname: "settings/contract-terms/a.pdf", termsUpdatedAt: new Date("2026-09-20T18:00:00Z"), lastPolledAt: null,
    });
    render(await SettingsPage());
    expect(screen.getByLabelText("Duette % of MSRP")).toHaveValue("60");
    expect(screen.getByLabelText("Pirouette % of MSRP")).toHaveValue("");
    expect(screen.getByRole("region", { name: "Contract terms" })).toHaveTextContent(/Terms last updated Sun, Sep 20/);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    const at = (name: string) => headings.indexOf(name);
    expect(at("Installation rates")).toBeGreaterThanOrEqual(0);
    expect(at("Markup by product line")).toBe(at("Installation rates") + 1);
    expect(at("Contract terms")).toBe(at("Markup by product line") + 1);
    expect(at("Google Ads")).toBe(headings.length - 1);
  });

  it("says contracts can't be sent until terms are uploaded", async () => {
    calendarEnabled.mockReturnValue(false);
    render(await SettingsPage());
    expect(screen.getByText("No terms uploaded. Contracts can't be sent until you add them.")).toBeInTheDocument();
  });
});
