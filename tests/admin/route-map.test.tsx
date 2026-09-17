import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import type { DayStop, Installer, RoutePlan } from "@/lib/routes/types";
import { ROUTE_COLORS, routeColor, UNKNOWN_ROUTE_COLOR } from "@/lib/routes/colors";

type P = { children?: ReactNode; title?: string; glyphText?: string; background?: string; encodedPath?: string; path?: google.maps.LatLngLiteral[]; strokeColor?: string };
const status = { value: "LOADED" };
const mapRef: { value: { setCenter: Mock; setZoom: Mock; fitBounds: Mock } | null } = { value: null };
vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: P) => <div data-testid="provider">{children}</div>,
  Map: ({ children }: P) => <div data-testid="google-map">{children}</div>,
  AdvancedMarker: ({ title, children }: P) => <div data-testid="marker" title={title}>{children}</div>,
  Pin: ({ glyphText, background }: P) => <span data-testid="pin" data-bg={background}>{glyphText}</span>,
  Polyline: ({ encodedPath, path, strokeColor }: P) => (
    <i data-testid="line" data-color={strokeColor} data-encoded={encodedPath ?? ""} data-points={path ? path.length : 0} />
  ),
  useMap: () => mapRef.value,
  useApiLoadingStatus: () => status.value,
  APILoadingStatus: { FAILED: "FAILED", AUTH_FAILURE: "AUTH_FAILURE", LOADED: "LOADED", LOADING: "LOADING" },
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

beforeEach(() => { status.value = "LOADED"; mapRef.value = null; });

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

  it.each(["FAILED", "AUTH_FAILURE"])("renders no frame when the script status is %s", (s) => {
    status.value = s;
    const { getByTestId } = render(<RouteMap {...base} />);
    expect(getByTestId("provider")).toBeEmptyDOMElement();
  });

  it("renders the frame while the script is loading", () => {
    status.value = "LOADING";
    render(<RouteMap {...base} />);
    expect(screen.getByTestId("provider")).not.toBeEmptyDOMElement();
    expect(screen.getByTestId("google-map")).toBeInTheDocument();
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

  it("gives an installer missing from the list a colour outside the palette", () => {
    const plan: RoutePlan = { day: "d", builtAt: "x", skipped: [], routes: [{ teamMemberId: "gone", polyline: null, driveMinutes: 0,
      stops: [{ appointmentId: "s1", arrival: "", driveMinutes: 0, outsideWindow: false }] }] };
    render(<RouteMap {...base} plan={plan} />);
    expect(pinOf("Dana")).toHaveAttribute("data-bg", UNKNOWN_ROUTE_COLOR);
    expect(ROUTE_COLORS).not.toContain(UNKNOWN_ROUTE_COLOR);
  });
});

describe("RouteMap framing", () => {
  const extended: google.maps.LatLngLiteral[] = [];
  beforeEach(() => {
    extended.length = 0;
    mapRef.value = { setCenter: vi.fn(), setZoom: vi.fn(), fitBounds: vi.fn() };
    vi.stubGlobal("google", { maps: { LatLngBounds: class { extend(p: google.maps.LatLngLiteral) { extended.push(p); } } } });
    return () => vi.unstubAllGlobals();
  });
  const map = () => mapRef.value!;

  it("does nothing with no located stops", () => {
    render(<RouteMap {...base} stops={[stop("s4", "Gus", null, null)]} />);
    expect(map().setCenter).not.toHaveBeenCalled();
    expect(map().fitBounds).not.toHaveBeenCalled();
  });

  it("centres at zoom 13 on a single stop", () => {
    render(<RouteMap {...base} stops={[stop("s1", "Dana", 36.1, -115.1)]} />);
    expect(map().setCenter).toHaveBeenCalledWith({ lat: 36.1, lng: -115.1 });
    expect(map().setZoom).toHaveBeenCalledWith(13);
    expect(map().fitBounds).not.toHaveBeenCalled();
  });

  it("centres at zoom 13 when every stop is at one spot", () => {
    render(<RouteMap {...base} stops={[stop("s1", "Dana", 36.1, -115.1), stop("s2", "Eli", 36.1, -115.1)]} />);
    expect(map().setCenter).toHaveBeenCalledWith({ lat: 36.1, lng: -115.1 });
    expect(map().setZoom).toHaveBeenCalledWith(13);
    expect(map().fitBounds).not.toHaveBeenCalled();
  });

  it("fits bounds around two or more spots", () => {
    render(<RouteMap {...base} />);
    expect(map().fitBounds).toHaveBeenCalledTimes(1);
    expect(map().fitBounds.mock.calls[0][1]).toBe(48);
    expect(extended).toEqual([{ lat: 36.1, lng: -115.1 }, { lat: 36.2, lng: -115.2 }, { lat: 36.3, lng: -115.3 }]);
    expect(map().setCenter).not.toHaveBeenCalled();
  });

  it("does not refit when a refresh brings the same stops in a new array", () => {
    const { rerender } = render(<RouteMap {...base} />);
    rerender(<RouteMap {...base} stops={stops.map((s) => ({ ...s }))} />);
    expect(map().fitBounds).toHaveBeenCalledTimes(1);
    rerender(<RouteMap {...base} stops={[...stops, stop("s5", "Hal", 36.5, -115.5)]} />);
    expect(map().fitBounds).toHaveBeenCalledTimes(2);
  });
});
