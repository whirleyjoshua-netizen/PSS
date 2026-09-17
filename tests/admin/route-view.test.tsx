import { Component, type ReactNode } from "react";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DayStop, Installer, RoutePlan } from "@/lib/routes/types";

const actions = { buildRoutes: vi.fn(), recheckRoutes: vi.fn(), saveRoutes: vi.fn() };
vi.mock("@/app/admin/schedule/route-actions", () => actions);
// The real rethrow helper, so redirect handling is tested against Next itself.
vi.mock("next/navigation", async () => ({ ...(await vi.importActual<object>("next/navigation")) }));
vi.mock("@/app/admin/schedule/RouteMap", () => ({ RouteMap: () => <div data-testid="map" /> }));
const { RouteView } = await import("@/app/admin/schedule/RouteView");
const { moveStop } = await import("@/lib/routes/edit");

const DAY = "2026-09-24";
const ANA = "11111111-1111-4111-8111-111111111111";
const BO = "22222222-2222-4222-8222-222222222222";
const installers: Installer[] = [{ id: ANA, name: "Ana" }, { id: BO, name: "Bo" }];

const stop = (over: Partial<DayStop>): DayStop => ({
  appointmentId: "a", jobId: "j", name: "x", address: "1 Main St", city: "Henderson", kind: "consultation",
  startsAt: `${DAY}T15:00:00.000Z`, allDay: false, confirmed: true, windowStart: null, windowEnd: null,
  durationMinutes: 60, lat: 36.1, lng: -115.1, assignedTo: null, updatedAt: "2026-09-20T00:00:00.000Z", ...over,
});
// Out of time order on purpose; the list sorts by startsAt.
const stops: DayStop[] = [
  stop({ appointmentId: "s2", jobId: "j2", name: "Eli Park", city: "Las Vegas", startsAt: `${DAY}T17:00:00.000Z`, confirmed: false, lat: 36.2, lng: -115.2 }),
  stop({ appointmentId: "s1", jobId: "j1", name: "Dana Reyes", windowStart: "08:00", windowEnd: "10:00" }),
  stop({ appointmentId: "s3", jobId: "j3", name: "Fay Moss", city: "Summerlin", startsAt: `${DAY}T19:00:00.000Z`, lat: 36.3, lng: -115.3 }),
  stop({ appointmentId: "s4", jobId: "j4", name: "Gus Hill", startsAt: `${DAY}T16:00:00.000Z`, lat: null, lng: null }),
];

const plan: RoutePlan = {
  day: DAY, builtAt: "2026-09-23T10:00:00.000Z",
  routes: [
    { teamMemberId: ANA, polyline: null, driveMinutes: 25, stops: [
      { appointmentId: "s1", arrival: `${DAY}T16:00:00.000Z`, driveMinutes: 15, outsideWindow: false },
      { appointmentId: "s2", arrival: `${DAY}T18:00:00.000Z`, driveMinutes: 10, outsideWindow: true },
    ] },
    { teamMemberId: BO, polyline: null, driveMinutes: 0, stops: [] },
  ],
  skipped: [{ appointmentId: "s3", reason: "Too far for the day" }],
};

type Props = Parameters<typeof RouteView>[0];
const view = (over: Partial<Props> = {}) => render(
  <RouteView day={DAY} stops={stops} installers={installers} saved={null}
    configured mapsKey={null} mapId={null} {...over} />,
);
const buildButton = () => screen.getByRole("button", { name: "Build routes" });
const saveButton = () => screen.getByRole("button", { name: "Save routes" });
const build = async () => {
  fireEvent.click(buildButton());
  await screen.findByRole("region", { name: "Ana · 25 min driving" });
  await waitFor(() => expect(buildButton()).toBeEnabled());
};

beforeEach(() => {
  actions.buildRoutes.mockReset().mockResolvedValue({ ok: true, plan });
  actions.recheckRoutes.mockReset();
  actions.saveRoutes.mockReset();
});

describe("RouteView before any build", () => {
  it("checks every installer, lists the day's appointments by time and keeps Save disabled", () => {
    view();
    expect(screen.getByRole("checkbox", { name: "Ana" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Bo" })).toBeChecked();
    const items = within(screen.getByRole("list", { name: "Appointments" })).getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining("Dana Reyes · Henderson"),
      expect.stringContaining("Eli Park · Las Vegas"),
      expect.stringContaining("Fay Moss · Summerlin"),
    ]);
    expect(items[0]).toHaveTextContent("Arrives 8:00 – 10:00 am");
    expect(items[1]).toHaveTextContent("Pending");
    expect(items[0]).not.toHaveTextContent("Pending");
    expect(saveButton()).toBeDisabled();
    expect(screen.getByTestId("map")).toBeInTheDocument();
  });

  it("lists appointments with no address, each linked to its job", () => {
    view();
    const section = within(screen.getByRole("region", { name: "Needs address (1)" }));
    expect(section.getByRole("link", { name: "Gus Hill" })).toHaveAttribute("href", "/admin/jobs/j4");
  });

  it("links the previous and next day", () => {
    view();
    expect(screen.getByRole("link", { name: /previous day/i })).toHaveAttribute("href", "/admin/schedule?view=route&day=2026-09-23");
    expect(screen.getByRole("link", { name: /next day/i })).toHaveAttribute("href", "/admin/schedule?view=route&day=2026-09-25");
    expect(within(screen.getByRole("navigation", { name: "View" })).getByRole("link", { name: "Route" }))
      .toHaveAttribute("aria-current", "page");
  });
});

describe("Build routes", () => {
  it("is disabled with a reason when no installer is checked", () => {
    view();
    fireEvent.click(screen.getByRole("checkbox", { name: "Ana" }));
    expect(buildButton()).toBeEnabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Bo" }));
    expect(buildButton()).toBeDisabled();
    expect(screen.getByText("Pick at least one installer.")).toBeInTheDocument();
  });

  it("is disabled with a reason when nothing is scheduled", () => {
    view({ stops: [] });
    expect(buildButton()).toBeDisabled();
    expect(screen.getByText("Nothing is scheduled that day.")).toBeInTheDocument();
  });

  it("says planning is unavailable without calling the server when it is not configured", () => {
    view({ configured: false });
    expect(buildButton()).toBeEnabled();
    fireEvent.click(buildButton());
    expect(screen.getByRole("alert")).toHaveTextContent("Route planning is unavailable right now");
    expect(actions.buildRoutes).not.toHaveBeenCalled();
  });

  it("builds for the checked installers and shows each route, the misfits and a directions link", async () => {
    view();
    fireEvent.click(screen.getByRole("checkbox", { name: "Bo" }));
    await build();
    expect(actions.buildRoutes).toHaveBeenCalledWith(DAY, [ANA]);
    const ana = within(screen.getByRole("region", { name: "Ana · 25 min driving" }));
    const rows = ana.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("1");
    expect(rows[0]).toHaveTextContent("Dana Reyes");
    expect(rows[0]).toHaveTextContent("9:00 AM");
    expect(rows[1]).toHaveTextContent("2");
    expect(rows[1]).toHaveTextContent("Eli Park");
    expect(rows[1]).toHaveTextContent("11:00 AM");
    expect(rows[1]).toHaveTextContent("Misses its window");
    expect(rows[0]).not.toHaveTextContent("Misses its window");
    expect(ana.getByRole("link", { name: "Open in Google Maps" }))
      .toHaveAttribute("href", "https://www.google.com/maps/dir/36.1,-115.1/36.2,-115.2");
    const misfits = within(screen.getByRole("region", { name: "Didn't fit (1)" }));
    expect(misfits.getByText(/Fay Moss/)).toBeInTheDocument();
    expect(misfits.getByText(/Too far for the day/)).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it("shows the server's error", async () => {
    actions.buildRoutes.mockResolvedValue({ ok: false, error: "No appointment that day has a mappable address." });
    view();
    fireEvent.click(buildButton());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No appointment that day has a mappable address."));
    expect(saveButton()).toBeDisabled();
  });
});

describe("editing a built plan", () => {
  it("moves a stop to another installer, re-checks it and disables controls while pending", async () => {
    let resolve!: (v: unknown) => void;
    actions.recheckRoutes.mockReturnValue(new Promise((r) => { resolve = r; }));
    view();
    await build();
    const select = screen.getByRole("combobox", { name: "Move Dana Reyes to" });
    expect(within(select).getByRole("option", { name: "Ana" })).toBeDisabled();
    fireEvent.change(select, { target: { value: BO } });
    const edited = moveStop(plan, "s1", BO);
    expect(actions.recheckRoutes).toHaveBeenCalledWith(DAY, edited, [ANA, BO]);
    await waitFor(() => expect(buildButton()).toBeDisabled());
    expect(screen.getByRole("button", { name: "Move Dana Reyes up" })).toBeDisabled();
    const rechecked = { ...edited, routes: edited.routes.map((r) => r.teamMemberId === BO ? { ...r, driveMinutes: 40 } : r) };
    resolve({ ok: true, plan: rechecked });
    const bo = within(await screen.findByRole("region", { name: "Bo · 40 min driving" }));
    expect(bo.getByText("Dana Reyes")).toBeInTheDocument();
    await waitFor(() => expect(buildButton()).toBeEnabled());
  });

  it("moves a stop down within its route", async () => {
    actions.recheckRoutes.mockImplementation(async (_d, next: RoutePlan) => ({ ok: true, plan: next }));
    view();
    await build();
    fireEvent.click(screen.getByRole("button", { name: "Move Dana Reyes down" }));
    const ana = within(await screen.findByRole("region", { name: "Ana · 25 min driving" }));
    await waitFor(() => expect(ana.getAllByRole("listitem")[0]).toHaveTextContent("Eli Park"));
    expect(actions.recheckRoutes.mock.calls[0][1].routes[0].stops.map((s: { appointmentId: string }) => s.appointmentId))
      .toEqual(["s2", "s1"]);
  });
});

describe("Save routes", () => {
  it("shows the refusal as an alert", async () => {
    actions.saveRoutes.mockResolvedValue({ ok: false, error: "This day changed — rebuild first." });
    view();
    await build();
    fireEvent.click(saveButton());
    expect(actions.saveRoutes).toHaveBeenCalledWith(DAY, plan);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This day changed — rebuild first."));
  });

  it("confirms a save and disables Save until the next change", async () => {
    actions.saveRoutes.mockResolvedValue({ ok: true });
    view();
    await build();
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Routes saved."));
    expect(saveButton()).toBeDisabled();
  });

  it("calls the server once when Save is double-clicked", async () => {
    actions.saveRoutes.mockResolvedValue({ ok: true });
    view();
    await build();
    fireEvent.click(saveButton());
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Routes saved."));
    expect(actions.saveRoutes).toHaveBeenCalledTimes(1);
  });
});

describe("a saved plan", () => {
  it("renders the saved routes and warns when they are out of date", () => {
    view({ saved: { plan, savedAt: "2026-09-23T11:00:00.000Z", stale: true } });
    expect(screen.getByRole("region", { name: "Ana · 25 min driving" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Route is out of date — rebuild");
    expect(saveButton()).toBeDisabled();
  });

  it("shows no banner when the saved plan is current", () => {
    view({ saved: { plan, savedAt: "2026-09-23T11:00:00.000Z", stale: false } });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("names a stop whose appointment left the day and gives an empty route no Maps link", () => {
    const withGhost = { ...plan, routes: [plan.routes[0], { ...plan.routes[1], stops: [
      { appointmentId: "gone", arrival: `${DAY}T20:00:00.000Z`, driveMinutes: 5, outsideWindow: false },
    ] }, { teamMemberId: "33333333-3333-4333-8333-333333333333", polyline: null, driveMinutes: 0, stops: [] }] };
    view({ saved: { plan: withGhost, savedAt: "2026-09-23T11:00:00.000Z", stale: false } });
    const bo = within(screen.getByRole("region", { name: "Bo · 0 min driving" }));
    expect(bo.getByText("Removed appointment")).toBeInTheDocument();
    expect(bo.queryByRole("link", { name: /Open in Google Maps/ })).toBeNull();
    const empty = within(screen.getByRole("region", { name: "Former installer · 0 min driving" }));
    expect(empty.getByText("No stops.")).toBeInTheDocument();
    expect(empty.queryByRole("link")).toBeNull();
  });

  it("splits a 23-stop route into Maps links of 10 points each", () => {
    const many = Array.from({ length: 23 }, (_, i) =>
      stop({ appointmentId: `m${i}`, jobId: `mj${i}`, name: `Stop ${i}`, lat: 36 + i / 100, lng: -115 }));
    const long: RoutePlan = { ...plan, skipped: [], routes: [{ teamMemberId: ANA, polyline: null, driveMinutes: 90,
      stops: many.map((m) => ({ appointmentId: m.appointmentId, arrival: `${DAY}T16:00:00.000Z`, driveMinutes: 4, outsideWindow: false })) }] };
    view({ stops: many, saved: { plan: long, savedAt: "2026-09-23T11:00:00.000Z", stale: false } });
    const links = screen.getAllByRole("link", { name: /Open in Google Maps/ });
    expect(links.map((l) => l.textContent)).toEqual([
      "Open in Google Maps (part 1)", "Open in Google Maps (part 2)", "Open in Google Maps (part 3)",
    ]);
    const points = (el: HTMLElement) => el.getAttribute("href")!.split("/maps/dir/")[1].split("/");
    expect(points(links[0])).toHaveLength(10);
    expect(points(links[1])[0]).toBe(points(links[0])[9]);
    expect(points(links[2])).toHaveLength(5);
  });
});

describe("a new day", () => {
  it("drops the old day's edits when the view is keyed by day", async () => {
    const { rerender } = render(
      <RouteView key={DAY} day={DAY} stops={stops} installers={installers} saved={null} configured mapsKey={null} mapId={null} />,
    );
    await build();
    expect(saveButton()).toBeEnabled();
    const next = { ...plan, day: "2026-09-25", routes: [{ ...plan.routes[0], driveMinutes: 7 }, plan.routes[1]] };
    rerender(
      <RouteView key="2026-09-25" day="2026-09-25" stops={stops} installers={installers}
        saved={{ plan: next, savedAt: "2026-09-24T11:00:00.000Z", stale: false }} configured mapsKey={null} mapId={null} />,
    );
    expect(screen.getByRole("region", { name: "Ana · 7 min driving" })).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });
});

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  render() { return this.state.error ? <p>boundary caught</p> : this.props.children; }
}

describe("a thrown action", () => {
  const boom = () => Promise.reject(new Error("network down"));
  beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

  it("shows unavailable when the build throws", async () => {
    actions.buildRoutes.mockImplementation(boom);
    view();
    fireEvent.click(buildButton());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Route planning is unavailable right now"));
    await waitFor(() => expect(buildButton()).toBeEnabled());
    expect(saveButton()).toBeDisabled();
  });

  it("shows unavailable when the save throws", async () => {
    view();
    await build();
    actions.saveRoutes.mockImplementation(boom);
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Route planning is unavailable right now"));
    await waitFor(() => expect(saveButton()).toBeEnabled());
  });

  it("lets a Next redirect through instead of reporting it", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/admin/login;307;" });
    actions.buildRoutes.mockRejectedValue(redirect);
    render(<Boundary><RouteView day={DAY} stops={stops} installers={installers} saved={null} configured mapsKey={null} mapId={null} /></Boundary>);
    fireEvent.click(buildButton());
    expect(await screen.findByText("boundary caught")).toBeInTheDocument();
  });
});

describe("a failed re-check", () => {
  const saved = { plan, savedAt: "2026-09-23T11:00:00.000Z", stale: false };
  const anaFirst = () => within(screen.getByRole("region", { name: "Ana · 25 min driving" })).getAllByRole("listitem")[0];

  it("restores the plan from before the edit and shows the error", async () => {
    actions.recheckRoutes.mockResolvedValue({ ok: false, error: "That route could not be read. Build again." });
    view({ saved });
    fireEvent.click(screen.getByRole("button", { name: "Move Dana Reyes down" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("That route could not be read. Build again."));
    await waitFor(() => expect(buildButton()).toBeEnabled());
    expect(anaFirst()).toHaveTextContent("Dana Reyes");
    expect(saveButton()).toBeDisabled();
  });

  it("restores the plan when the re-check throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    actions.recheckRoutes.mockRejectedValue(new Error("network down"));
    view({ saved });
    fireEvent.change(screen.getByRole("combobox", { name: "Move Dana Reyes to" }), { target: { value: BO } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Route planning is unavailable right now"));
    await waitFor(() => expect(buildButton()).toBeEnabled());
    expect(anaFirst()).toHaveTextContent("Dana Reyes");
    expect(screen.getByRole("region", { name: "Bo · 0 min driving" })).not.toHaveTextContent("Dana Reyes");
    expect(saveButton()).toBeDisabled();
  });
});
