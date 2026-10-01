import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const KEPT = { at: new Date("2026-10-01T15:00:00Z"), by: "owner@example.com" };
const getMeasureSet = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "owner@example.com" })) }));
vi.mock("@/lib/admin/jobs", () => ({ getJob: vi.fn(async () => ({ id: ID, name: "Dana Reyes" })) }));
vi.mock("@/lib/admin/measurements", () => ({ getMeasureSet }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/app/admin/jobs/[id]/measure/MeasureForm", () => ({
  MeasureForm: ({ kind, defaultRoom }: { kind: string; defaultRoom: string }) => <p>{kind} form starting in “{defaultRoom}”</p>,
}));
vi.mock("@/app/admin/jobs/[id]/KeepOfficialBox", () => ({
  KeepOfficialBox: ({ kept, blocked }: { kept: boolean; blocked: boolean }) => <p>box kept={String(kept)} blocked={String(blocked)}</p>,
}));

const { default: MeasurePage } = await import("@/app/admin/jobs/[id]/measure/page");
const open = async (kind?: string | string[]) =>
  render(await MeasurePage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve(kind === undefined ? {} : { kind }) }));

const designer = [{ kind: "designer", room: "Den", quantity: 10 }, { kind: "designer", room: "Office", quantity: 2 }];
const official = [{ kind: "official", room: "Hall", quantity: 3 }];

beforeEach(() => getMeasureSet.mockReset().mockResolvedValue({ windows: [...designer, ...official], kept: null }));

describe("measure page", () => {
  it("asks which measure first, with each one's count", async () => {
    await open();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Measure");
    expect(screen.getByRole("link", { name: /Designer measure.*12 windows/ })).toHaveAttribute("href", `/admin/jobs/${ID}/measure?kind=designer`);
    expect(screen.getByRole("link", { name: /Official measure.*3 windows/ })).toHaveAttribute("href", `/admin/jobs/${ID}/measure?kind=official`);
    expect(screen.queryByText(/form starting/)).toBeNull();
  });

  it("shows the chooser for a missing, repeated-garbage or unknown kind", async () => {
    for (const kind of [undefined, "", "final", ["bogus", "designer"]]) {
      const { unmount } = await open(kind);
      expect(screen.getByRole("link", { name: /Designer measure/ })).toBeInTheDocument();
      unmount();
    }
  });

  it("measures the designer list: its own count, last room, and the keep box", async () => {
    await open("designer");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Designer measure");
    expect(screen.getByText("12 windows so far")).toBeInTheDocument();
    expect(screen.getByText("designer form starting in “Office”")).toBeInTheDocument();
    expect(screen.getByText("box kept=false blocked=true")).toBeInTheDocument();
  });

  it("starts the official measure blank: no designer room, no keep box", async () => {
    getMeasureSet.mockResolvedValue({ windows: designer, kept: null });
    await open("official");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Official measure");
    expect(screen.getByText("0 windows so far")).toBeInTheDocument();
    expect(screen.getByText("official form starting in “”")).toBeInTheDocument();
    expect(screen.queryByText(/box kept/)).toBeNull();
  });

  it("will not open the official form on a kept job, and says why", async () => {
    getMeasureSet.mockResolvedValue({ windows: designer, kept: KEPT });
    await open("official");
    expect(screen.queryByText(/form starting/)).toBeNull();
    expect(screen.getByText(/Using designer measure/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Official measure/ })).toBeNull();
  });
});
