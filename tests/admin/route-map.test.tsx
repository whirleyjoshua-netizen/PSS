import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DayStop, Installer, RoutePlan } from "@/lib/routes/types";
import { ROUTE_COLORS, routeColor } from "@/lib/routes/colors";

type P = { children?: React.ReactNode; title?: string; glyphText?: string; background?: string; encodedPath?: string; path?: unknown[]; strokeColor?: string };
const status = { value: "LOADED" };
vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: P) => <div data-testid="provider">{children}</div>,
  Map: ({ children }: P) => <div data-testid="google-map">{children}</div>,
  AdvancedMarker: ({ title, children }: P) => <div data-testid="marker" title={title}>{children}</div>,
  Pin: ({ glyphText, background }: P) => <span data-testid="pin" data-bg={background}>{glyphText}</span>,
  Polyline: ({ encodedPath, path, strokeColor }: P) => (
    <i data-testid="line" data-color={strokeColor} data-encoded={encodedPath ?? ""} data-points={path ? path.length : 0} />
  ),
  useMap: () => null,
  useMapsLibrary: () => null,
  useApiLoadingStatus: () => status.value,
  APILoadingStatus: { FAILED: "FAILED", AUTH_FAILURE: "AUTH_FAILURE", LOADED: "LOADED" },
}));
const { RouteMap } = await import("@/app/admin/schedule/RouteMap");

const ANA = "ana", BO = "bo";
const installers: Installer[] = [{ id: ANA, name: "Ana" }, { id: BO, name: "Bo" }];
const stop = (appointmentId: string, name: string, lat: number | null = 36.1, lng: number | null = -115.1): DayStop => ({
  appointmentId, jobId: `j-${appointmentId}`, name, address: "1 Main St", city: "Henderson", kind: "consultation",
  startsAt: "2026-09-24T15:00:00.000Z", allDay: false, confirmed: true, windowStart: null, windowEnd: null,
  durationMinutes: 60, lat, lng, assignedTo: null, updatedAt: "2026-09-20T00:00:00.000Z",
});
const stops = [stop("s1", "Dana"), stop("s2", "Eli", 36.2, -115.2), stop("s3", "Fay", 36.3, -115.3), stop("s4", "Gus", null, null)];
const base = { stops, plan: null, installers, apiKey: "key", mapId: "map" };
const pinOf = (title: string) => screen.getByTitle(title).querySelector("[data-testid=pin]")!;

beforeEach(() => { status.value = "LOADED"; });

describe("colors", () => {
  it("uses the literal palette and wraps", () => {
    expect(ROUTE_COLORS).toEqual(["#8a6d3b", "#2f5d62", "#7a3e48", "#4a5a2f", "#3d4f7a", "#6b4e7a"]);
    expect(routeColor(1)).toBe("#2f5d62");
    expect(routeColor(6)).toBe("#8a6d3b");
  });
});

describe("RouteMap", () => {
  it("renders nothing without a key or a map id", () => {
    expect(render(<RouteMap {...base} apiKey={null} />).container).toBeEmptyDOMElement();
    expect(render(<RouteMap {...base} mapId={null} />).container).toBeEmptyDOMElement();
  });

  it.each(["FAILED", "AUTH_FAILURE"])("renders nothing when the script status is %s", (s) => {
    status.value = s;
    render(<RouteMap {...base} />);
    expect(screen.queryByTestId("google-map")).toBeNull();
    expect(screen.queryByTestId("marker")).toBeNull();
  });

  it("shows the map visibly on every screen size", () => {
    render(<RouteMap {...base} />);
    const frame = screen.getByTestId("google-map").parentElement!;
    expect(frame.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(frame.className).toMatch(/h-80/);
  });

  it("without a plan, one grey pin per located stop, titled by name", () => {
    render(<RouteMap {...base} />);
    expect(screen.getAllByTestId("marker").map((m) => m.title)).toEqual(["Dana", "Eli", "Fay"]);
    screen.getAllByTestId("pin").forEach((p) => expect(p).toHaveAttribute("data-bg", "#9ca3af"));
    expect(screen.queryByTestId("line")).toBeNull();
  });

  it("with a plan, numbered pins in the installer's colour, lines per route, skipped stays grey", () => {
    const plan: RoutePlan = {
      day: "2026-09-24", builtAt: "x", skipped: [{ appointmentId: "s3", reason: "late" }],
      routes: [
        { teamMemberId: BO, polyline: "abc", driveMinutes: 10, stops: [
          { appointmentId: "s2", arrival: "", driveMinutes: 5, outsideWindow: false },
          { appointmentId: "s1", arrival: "", driveMinutes: 5, outsideWindow: false },
        ] },
      ],
    };
    render(<RouteMap {...base} plan={plan} />);
    expect(pinOf("Eli")).toHaveAttribute("data-bg", routeColor(1));
    expect(pinOf("Eli")).toHaveTextContent("1");
    expect(pinOf("Dana")).toHaveAttribute("data-bg", routeColor(1));
    expect(pinOf("Dana")).toHaveTextContent("2");
    expect(pinOf("Fay")).toHaveAttribute("data-bg", "#9ca3af");
    expect(pinOf("Fay")).toHaveTextContent("");
    const line = screen.getByTestId("line");
    expect(line).toHaveAttribute("data-color", routeColor(1));
    expect(line).toHaveAttribute("data-encoded", "abc");
  });

  it("a route without an encoded path draws straight segments between its stops", () => {
    const plan: RoutePlan = {
      day: "2026-09-24", builtAt: "x", skipped: [],
      routes: [{ teamMemberId: ANA, polyline: null, driveMinutes: 0, stops: [
        { appointmentId: "s1", arrival: "", driveMinutes: 0, outsideWindow: false },
        { appointmentId: "s3", arrival: "", driveMinutes: 0, outsideWindow: false },
      ] }],
    };
    render(<RouteMap {...base} plan={plan} />);
    const line = screen.getByTestId("line");
    expect(line).toHaveAttribute("data-encoded", "");
    expect(line).toHaveAttribute("data-points", "2");
    expect(pinOf("Fay")).toHaveAttribute("data-bg", routeColor(0));
  });
});
