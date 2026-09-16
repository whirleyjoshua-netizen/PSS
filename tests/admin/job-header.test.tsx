import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Job } from "@/lib/admin/jobs";

vi.mock("@/app/admin/jobs/actions", () => ({
  moveStage: vi.fn(), markLost: vi.fn(async () => ({})), assignJobAction: vi.fn(async () => ({})),
}));
vi.mock("@/app/admin/jobs/contact-actions", () => ({ logContactAction: vi.fn(async () => ({})) }));
vi.mock("@/app/admin/jobs/follow-up-actions", () => ({ saveFollowUp: vi.fn(async () => ({})), clearFollowUpAction: vi.fn(async () => {}) }));
const { JobHeader } = await import("@/app/admin/jobs/[id]/JobHeader");

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
  it("offers the Assigned to control", () => {
    render(<JobHeader job={job} now={now} team={team} />);
    expect(screen.getByLabelText("Assigned to")).toBeInTheDocument();
  });

  it("shows the name, stage and age of the job", () => {
    render(<JobHeader job={job} now={now} team={team} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dana Reyes");
    expect(screen.getByText("Henderson · Created Sep 11, 2026 · 1 day in stage")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("New lead");
  });

  it("has call, text, email and schedule actions", () => {
    render(<JobHeader job={job} now={now} team={team} />);
    expect(screen.getByRole("link", { name: "Log a call" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Text" })).toHaveAttribute("href", "sms:+17025550134");
    expect(screen.getByRole("link", { name: "Email" })).toHaveAttribute("href", "mailto:dana@example.com");
    expect(screen.getByRole("link", { name: "Schedule" })).toHaveAttribute(
      "href", `/admin/jobs/${ID}?tab=overview&edit=details#visitAt`,
    );
  });

  it("hides Email when there is no email", () => {
    render(<JobHeader job={{ ...job, email: null }} now={now} team={team} />);
    expect(screen.queryByRole("link", { name: "Email" })).toBeNull();
  });

  it("puts mark contacted, the call-back and change stage in the More menu, with no Move button", () => {
    render(<JobHeader job={job} now={now} team={team} />);
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
    render(<JobHeader job={{ ...job, lastContactAt: new Date("2026-09-16T05:00:00Z") }} now={now} team={team} />);
    expect(screen.getByText("Last contacted Tue 9/15")).toBeInTheDocument();
    render(<JobHeader job={{ ...job, lastContactAt: null }} now={now} team={team} />);
    expect(screen.getAllByText(/Last contacted/)).toHaveLength(1);
  });

  it("flags an overdue call-back beside the stage", () => {
    render(<JobHeader job={{ ...job, followUpAt: new Date("2026-09-13T17:00:00Z") }} now={now} team={team} />);
    expect(screen.getByText("Call-back overdue")).toBeInTheDocument();
  });

  it("keeps the More-actions panel within the header row below sm", () => {
    render(<JobHeader job={job} now={now} team={team} />);
    const details = screen.getByLabelText("More actions").closest("details")!;
    expect(details.className).toContain("sm:relative");
    const panel = details.querySelector("div")!;
    expect(panel.className).toContain("inset-x-0");
    expect(panel.className).toContain("sm:right-0");
  });

  it("shows a lost banner with the reason", () => {
    render(<JobHeader job={{ ...job, status: "lost", lostReason: "Went with another company" }} now={now} team={team} />);
    expect(screen.getByText("Lost — Went with another company")).toBeInTheDocument();
  });

  it("says a job moved stages today", () => {
    render(<JobHeader job={{ ...job, stageChangedAt: now }} now={now} team={team} />);
    expect(screen.getByText(/In stage since today/)).toBeInTheDocument();
  });
});
