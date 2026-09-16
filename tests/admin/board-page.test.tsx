import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "@/lib/admin/jobs";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const ID_B = "4a3c9d2f-9d63-4b64-8b2d-2e3f4a5b6c7d";
const job: Job = {
  id: ID, createdAt: new Date("2026-09-01T00:00:00Z"), name: "Dana Reyes", phone: "7025550134",
  email: null, address: null, city: "Henderson", treatments: [], windowCount: null, heardVia: null,
  notes: null, source: "contact", status: "quoted", stageChangedAt: new Date(), visitAt: null,
  quoteCents: null, soldCents: null, depositCents: null, brands: [], orderedOn: null, installOn: null,
  lostReason: null, referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null,
  reviewOptOut: false,
};
const jobSold: Job = { ...job, id: ID, status: "sold" };
const jobB: Job = { ...job, id: ID_B, name: "Chris Lane", status: "quoted" };

const jobs = { listJobs: vi.fn(), getJob: vi.fn(), SEARCH_MAX: 100 };
vi.mock("@/lib/admin/jobs", () => jobs);
const listMeasurements = vi.fn();
vi.mock("@/lib/admin/measurements", () => ({ listMeasurements }));
const listFiles = vi.fn();
vi.mock("@/lib/admin/files", () => ({ listFiles }));
const listDueFollowUps = vi.fn();
vi.mock("@/lib/admin/follow-ups", () => ({ listDueFollowUps }));
vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "owner@example.com" })) }));
vi.mock("@/app/admin/jobs/actions", () => ({
  moveStage: vi.fn(), markLost: vi.fn(async () => ({})), assignJobAction: vi.fn(async () => ({})),
}));
const listTeam = vi.fn();
vi.mock("@/lib/admin/team", () => ({ listTeam }));
vi.mock("@/app/admin/jobs/measure-actions", () => ({ removeMeasurement: vi.fn(), removeFile: vi.fn(), setFileShared: vi.fn() }));

const { default: BoardPage } = await import("@/app/admin/page");
const open = async (params: { list?: string; job?: string; q?: string }) =>
  render(await BoardPage({ searchParams: Promise.resolve(params) }));

beforeEach(() => {
  jobs.listJobs.mockReset().mockResolvedValue([job]);
  jobs.getJob.mockReset().mockResolvedValue(job);
  listMeasurements.mockReset().mockResolvedValue([]);
  listFiles.mockReset().mockResolvedValue([]);
  listDueFollowUps.mockReset().mockResolvedValue([]);
  listTeam.mockReset().mockResolvedValue([]);
});

describe("board page", () => {
  it("shows no panel and loads no job details without ?job", async () => {
    await open({});
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(jobs.getJob).not.toHaveBeenCalled();
    // The team is only for the panel's Assigned to, so it isn't loaded either.
    expect(listTeam).not.toHaveBeenCalled();
    // Each card carries a mobile link to the full page and a desktop link to the panel.
    const [mobile, desktop] = within(screen.getByRole("region", { name: "Board" })).getAllByRole("link", { name: /dana reyes/i });
    expect(mobile).toHaveAttribute("href", `/admin/jobs/${ID}`);
    expect(desktop).toHaveAttribute("href", `/admin?job=${ID}`);
  });

  it("opens the panel for ?job, marks the card, and closes back to the board", async () => {
    await open({ job: ID });
    expect(screen.getByRole("complementary", { name: /dana reyes/i })).toBeInTheDocument();
    expect(listMeasurements).toHaveBeenCalledWith(ID);
    expect(listFiles).toHaveBeenCalledWith(ID);
    expect(within(screen.getByRole("region", { name: "Board" })).getByRole("link", { name: /dana reyes/i, current: true })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute("href", "/admin");
  });

  it("points the panel at Settings while there is no team", async () => {
    await open({ job: ID });
    expect(listTeam).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Add people in Settings" })).toBeInTheDocument();
  });

  it("shows the not-found panel for a job that no longer exists", async () => {
    jobs.getJob.mockResolvedValue(null);
    await open({ job: "nope" });
    expect(screen.getByText("That job no longer exists.")).toBeInTheDocument();
    expect(listMeasurements).not.toHaveBeenCalled();
  });

  it("resets the panel's form state when switching jobs", async () => {
    jobs.getJob.mockResolvedValueOnce(jobSold);
    const { rerender } = render(await BoardPage({ searchParams: Promise.resolve({ job: ID }) }));
    expect(screen.getByLabelText("Set stage")).toHaveValue("sold");

    jobs.getJob.mockResolvedValueOnce(jobB);
    rerender(await BoardPage({ searchParams: Promise.resolve({ job: ID_B }) }));
    expect(screen.getByLabelText("Set stage")).toHaveValue("quoted");
  });

  it("opens the first job when ?job arrives as an array", async () => {
    jobs.getJob.mockResolvedValue(job);
    await open({ job: [ID, ID_B] } as unknown as { job?: string });
    expect(jobs.getJob).toHaveBeenCalledWith(ID);
    expect(screen.getByRole("complementary", { name: /dana reyes/i })).toBeInTheDocument();
  });
});

describe("board look and conveniences", () => {
  it("has no stage tiles and no lost toggle", async () => {
    await open({});
    expect(screen.queryByRole("navigation", { name: "Stages" })).toBeNull();
    expect(screen.queryByRole("link", { name: /show lost/i })).toBeNull();
  });

  it("keeps completed and lost jobs off the board", async () => {
    jobs.listJobs.mockResolvedValue([job, { ...jobB, status: "completed" }, { ...jobB, id: "5b4d0e3a-0e74-4c75-9c3e-3f4a5b6c7d8e", name: "Lee Park", status: "lost" }]);
    await open({});
    const board = screen.getByRole("region", { name: "Board" });
    expect(within(board).getAllByRole("region")).toHaveLength(6);
    expect(within(board).queryByText("Chris Lane")).toBeNull();
    expect(within(board).queryByText("Lee Park")).toBeNull();
  });

  it("has an add link in every board column", async () => {
    await open({});
    expect(screen.getByRole("link", { name: "+ Add lead" })).toHaveAttribute("href", "/admin/jobs/new?stage=new");
    expect(screen.getAllByRole("link", { name: "+ Add job" })).toHaveLength(5);
  });

  it("has a New Job button and a search box that keeps the list filter and open panel", async () => {
    await open({ list: "lost", job: ID });
    expect(screen.getByRole("link", { name: "New Job" })).toHaveAttribute("href", "/admin/jobs/new");
    const search = screen.getByRole("search");
    expect(within(search).getByRole("searchbox", { name: "Search jobs" })).toBeInTheDocument();
    expect(search.querySelector('input[name="list"]')).toHaveValue("lost");
    expect(search.querySelector('input[name="job"]')).toHaveValue(ID);
  });

  it("filters by ?q, keeps q in links, and offers to clear the search", async () => {
    await open({ q: "reyes", job: ID });
    expect(jobs.listJobs).toHaveBeenCalledWith({ search: "reyes" });
    expect(screen.getByText(/1 job matches "reyes"/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute("href", `/admin?job=${ID}`);
    expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute("href", "/admin?q=reyes");
    expect(within(screen.getByRole("region", { name: "Board" })).getByRole("link", { name: /dana reyes/i, current: true })).toHaveAttribute("href", `/admin?q=reyes&job=${ID}`);
  });

  it("counts only the jobs the list shows when a stage filter is on", async () => {
    jobs.listJobs.mockResolvedValue([job, { ...jobB, name: "Chris Reyes", status: "lost" }]);
    await open({ list: "lost", q: "reyes" });
    expect(screen.getByText(/1 job matches "reyes"/i)).toBeInTheDocument();
    const list = screen.getByRole("region", { name: /all jobs/i });
    expect(within(list).getAllByRole("row")).toHaveLength(2);
  });

  it("says when nothing matches", async () => {
    jobs.listJobs.mockResolvedValue([]);
    await open({ q: "zzz" });
    expect(screen.getByText(/no jobs match "zzz"/i)).toBeInTheDocument();
  });

  it("shows no follow-ups region when none are due", async () => {
    await open({});
    expect(screen.queryByRole("region", { name: /follow-ups due/i })).toBeNull();
  });

  it("shows the follow-ups due region when one is due", async () => {
    listDueFollowUps.mockResolvedValue([{ ...job, followUpAt: new Date("2026-09-01T00:00:00Z"), followUpNote: null }]);
    await open({});
    expect(screen.getByRole("region", { name: "Follow-ups due · 1" })).toBeInTheDocument();
  });

  it("lists every job below the board and filters it by ?list", async () => {
    jobs.listJobs.mockResolvedValue([job, { ...jobB, status: "completed" }]);
    await open({});
    const list = screen.getByRole("region", { name: /all jobs/i });
    expect(within(list).getAllByRole("row")).toHaveLength(3);

    jobs.listJobs.mockResolvedValue([job, { ...jobB, status: "completed" }]);
    await open({ list: "completed" });
    const filtered = screen.getAllByRole("region", { name: /all jobs/i }).at(-1)!;
    expect(within(filtered).getAllByRole("row")).toHaveLength(2);
    expect(filtered).toHaveTextContent("Chris Lane");
  });

  it("treats an unknown ?list as all jobs", async () => {
    await open({ list: "bogus", job: ID });
    expect(screen.getByLabelText("Stage")).toHaveValue("");
    // The desktop link of each pair is the one that carries board state.
    const card = within(screen.getByRole("region", { name: "Board" })).getAllByRole("link", { name: /dana reyes/i })[1];
    const row = within(screen.getByRole("region", { name: /all jobs/i })).getAllByRole("link", { name: /dana reyes/i })[1];
    const close = screen.getByRole("link", { name: "Close" });
    expect(card).toHaveAttribute("href", `/admin?job=${ID}`);
    expect(row).toHaveAttribute("href", `/admin?job=${ID}`);
    expect(close).toHaveAttribute("href", "/admin");
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href") ?? "").not.toContain("list=bogus");
    }
  });
});
