import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn(async () => ({ email: "owner@example.com" }));
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));

const calendarEnabled = vi.fn();
vi.mock("@/lib/calendar/config", () => ({ calendarEnabled }));

const getSyncState = vi.fn();
vi.mock("@/lib/calendar/store", () => ({ getSyncState }));

const { default: SettingsPage } = await import("@/app/admin/settings/page");

beforeEach(() => {
  requireAdmin.mockClear();
  calendarEnabled.mockReset();
  getSyncState.mockReset();
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
