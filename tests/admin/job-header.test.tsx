import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Job } from "@/lib/admin/jobs";

vi.mock("@/app/admin/jobs/actions", () => ({
  moveStage: vi.fn(), markLost: vi.fn(async () => ({})), assignJobAction: vi.fn(async () => ({})),
  deleteJobAction: vi.fn(async () => {}),
}));
vi.mock("@/app/admin/jobs/contact-actions", () => ({ logContactAction: vi.fn(async () => ({})) }));
vi.mock("@/app/admin/jobs/appointment-actions", () => ({
  bookAppointment: vi.fn(async () => ({})), confirmSchedule: vi.fn(async () => ({})),
  cancelAppointmentAction: vi.fn(async () => ({})),
}));
vi.mock("@/app/admin/jobs/follow-up-actions", () => ({ saveFollowUp: vi.fn(async () => ({})), clearFollowUpAction: vi.fn(async () => {}) }));
const { JobHeader } = await import("@/app/admin/jobs/[id]/JobHeader");

const MINUTES = { consultation: 60, measure: 60, install: 240, service: 90 };
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const now = new Date("2026-09-14T18:00:00Z");
const job: Job = {
  id: ID, createdAt: new Date("2026-09-11T18:00:00Z"), name: "Dana Reyes", phone: "7025550134",
  email: "dana@example.com", address: null, city: "Henderson", treatments: [], windowCount: null, heardVia: null,
  notes: null, source: "phone", status: "new", stageChangedAt: new Date("2026-09-13T18:00:00Z"),
  visitAt: null, quoteCents: null, soldCents: null, depositCents: null, brands: [], orderedOn: null,
  installOn: null, lostReason: null, referralCode: null, referredBy: null, referralPaidAt: null,
  reviewRequestedAt: null, reviewOptOut: false, budgetTier: null,
};

const team = [{ id: "b", name: "Shade", role: "designer" as const }];

describe("JobHeader", () => {
  it("shows the job's PSS number next to the name, for Direct Connect's PO Reference", () => {
    render(<JobHeader job={{ ...job, projectNo: 1042 }} now={now} team={team} defaultMinutes={MINUTES} />);
    expect(screen.getByText("PSS-1042")).toBeInTheDocument();
  });

  it("shows no number for a job that has none", () => {
    render(<JobHeader job={{ ...job, projectNo: null }} now={now} team={team} defaultMinutes={MINUTES} />);
    expect(screen.queryByText(/^PSS-/)).toBeNull();
  });

  it("offers the Assigned to control", () => {
    render(<JobHeader job={job} now={now} team={team} defaultMinutes={MINUTES} />);
    expect(screen.getByLabelText("Assigned to")).toBeInTheDocument();
  });

  it("shows the name, stage and age of the job", () => {
    render(<JobHeader job={job} now={now} team={team} defaultMinutes={MINUTES} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dana Reyes");
    expect(screen.getByText("Henderson · Created Sep 11, 2026 · 1 day in stage")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("New lead");
  });

  it("has call, text, email and schedule actions", () => {
    render(<JobHeader job={job} now={now} team={team} defaultMinutes={MINUTES} />);
    expect(screen.getByRole("link", { name: "Log a call" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Text" })).toHaveAttribute("href", "sms:+17025550134");
    expect(screen.getByRole("link", { name: "Email" })).toHaveAttribute("href", "mailto:dana@example.com");
    // Scheduling is a dialog now, not a trip to the details form.
    expect(screen.getByRole("button", { name: "Schedule" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Schedule" })).toBeNull();
  });

  it("hides Email when there is no email", () => {
    render(<JobHeader job={{ ...job, email: null }} now={now} team={team} defaultMinutes={MINUTES} />);
    expect(screen.queryByRole("link", { name: "Email" })).toBeNull();
  });

  it("puts mark contacted, the call-back and change stage in the More menu, with no Move button", () => {
    render(<JobHeader job={job} now={now} team={team} defaultMinutes={MINUTES} />);
    const menu = within(screen.getByLabelText("More actions").closest("details")!);
    expect(menu.getByLabelText("Mark contacted")).toBeInTheDocument();
    expect(menu.getByText("No call-back set")).toBeInTheDocument();
    expect(menu.getByText("Change stage…")).toBeInTheDocument();
    expect(menu.getByLabelText("Set stage")).toBeInTheDocument();
    expect(menu.getByLabelText(/mark lost/i)).toBeInTheDocument();
    expect(menu.queryByRole("button", { name: /^Move to/ })).toBeNull();
    expect(menu.queryByText(/^Next/)).toBeNull();
  });

  it("shows when the client was last contacted", () => {
    render(<JobHeader job={{ ...job, lastContactAt: new Date("2026-09-16T05:00:00Z") }} now={now} team={team} defaultMinutes={MINUTES} />);
    expect(screen.getByText("Last contacted Tue 9/15")).toBeInTheDocument();
    render(<JobHeader job={{ ...job, lastContactAt: null }} now={now} team={team} defaultMinutes={MINUTES} />);
    expect(screen.getAllByText(/Last contacted/)).toHaveLength(1);
  });

  it("flags an overdue call-back beside the stage", () => {
    render(<JobHeader job={{ ...job, followUpAt: new Date("2026-09-13T17:00:00Z") }} now={now} team={team} defaultMinutes={MINUTES} />);
    expect(screen.getByText("Call-back overdue")).toBeInTheDocument();
  });

  it("keeps the More-actions panel within the header row below sm", () => {
    render(<JobHeader job={job} now={now} team={team} defaultMinutes={MINUTES} />);
    const details = screen.getByLabelText("More actions").closest("details")!;
    expect(details.className).toContain("sm:relative");
    const panel = details.querySelector("div")!;
    expect(panel.className).toContain("inset-x-0");
    expect(panel.className).toContain("sm:right-0");
  });

  it("shows a lost banner with the reason", () => {
    render(<JobHeader job={{ ...job, status: "lost", lostReason: "Went with another company" }} now={now} team={team} defaultMinutes={MINUTES} />);
    expect(screen.getByText("Lost — Went with another company")).toBeInTheDocument();
  });

  it("links a service job back to the project it came from", () => {
    const parent: Job = { ...job, id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", projectNo: 1002 };
    render(<JobHeader job={{ ...job, parentJobId: parent.id, source: "service" }} now={now} team={team} defaultMinutes={MINUTES} parent={parent} />);
    const link = screen.getByRole("link", { name: "Service request for PSS-1002" });
    expect(link).toHaveAttribute("href", `/admin/jobs/${parent.id}`);
  });

  it("falls back to the customer's name when the parent has no project number", () => {
    const parent: Job = { ...job, id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", name: "Ray Ortiz", projectNo: null };
    render(<JobHeader job={{ ...job, parentJobId: parent.id, source: "service" }} now={now} team={team} defaultMinutes={MINUTES} parent={parent} />);
    expect(screen.getByRole("link", { name: "Service request for Ray Ortiz" })).toBeInTheDocument();
  });

  it("says nothing about a service request on an ordinary job", () => {
    render(<JobHeader job={job} now={now} team={team} defaultMinutes={MINUTES} parent={null} />);
    expect(screen.queryByText(/Service request for/)).toBeNull();
  });

  it("puts Delete last in the More menu, apart from the reversible actions", () => {
    render(<JobHeader job={{ ...job, projectNo: 1002 }} now={now} team={team} defaultMinutes={MINUTES} />);
    const panel = screen.getByLabelText("More actions").closest("details")!.querySelector("div > div")!;
    const children = [...panel.children];
    const reveal = screen.getByText("Delete this job…").closest("details")!;
    // Last child of the panel, and the thing directly before it is a rule.
    expect(children.at(-1)).toBe(reveal);
    expect(children.at(-2)!.tagName).toBe("HR");
    // Change stage… stays above it.
    expect(children.indexOf(screen.getByText("Change stage…").closest("details")!)).toBeLessThan(children.length - 1);
  });

  it("names the customer and project number in the delete warning", () => {
    render(<JobHeader job={{ ...job, projectNo: 1002 }} now={now} team={team} defaultMinutes={MINUTES} />);
    const reveal = screen.getByText("Delete this job…").closest("details")!;
    expect(within(reveal).getByText(/Dana Reyes/)).toBeInTheDocument();
    expect(within(reveal).getByText(/PSS-1002/)).toBeInTheDocument();
  });

  it("shows the service-request explanation only when the page says the delete was blocked", () => {
    render(<JobHeader job={job} now={now} team={team} defaultMinutes={MINUTES} />);
    expect(screen.queryByText(/service request against it/)).toBeNull();
    render(<JobHeader job={job} now={now} team={team} defaultMinutes={MINUTES} deleteBlocked />);
    expect(screen.getByText("This job has a service request against it. Delete that first.")).toBeInTheDocument();
  });

  it("says a job moved stages today", () => {
    render(<JobHeader job={{ ...job, stageChangedAt: now }} now={now} team={team} defaultMinutes={MINUTES} />);
    expect(screen.getByText(/In stage since today/)).toBeInTheDocument();
  });
});
