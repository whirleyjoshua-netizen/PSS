import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Job } from "@/lib/admin/jobs";

vi.mock("@/app/admin/jobs/actions", () => ({
  moveStage: vi.fn(async () => {}),
  markLost: vi.fn(async () => ({})),
  assignJobAction: vi.fn(async () => ({})),
}));
vi.mock("@/app/admin/jobs/measure-actions", () => ({
  removeMeasurement: vi.fn(async () => {}),
  removeFile: vi.fn(async () => {}),
  setFileShared: vi.fn(async () => {}),
}));

const { JobPanel } = await import("@/app/admin/JobPanel");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const job: Job = {
  id: ID, createdAt: new Date("2026-09-01T00:00:00Z"), name: "Dana Reyes", phone: "7025550134",
  email: "dana@example.com", address: "12 Main St", city: "Henderson", treatments: [], windowCount: null,
  heardVia: null, notes: null, source: "contact", status: "sold",
  stageChangedAt: new Date("2026-09-08T00:00:00Z"), visitAt: null, quoteCents: 480000, soldCents: 450000,
  depositCents: 225000, brands: [], orderedOn: null, installOn: "2026-10-02", lostReason: null,
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false,
};
const NOW = new Date("2026-09-10T18:00:00Z");
const team = [{ id: "b", name: "Shade", role: "designer" as const }];
const panel = (overrides: Partial<Job> | null = {}) =>
  render(
    <JobPanel job={overrides === null ? null : { ...job, ...overrides }} measurements={[]} files={[]} now={NOW} closeHref="/admin" team={team} />,
  );

describe("client panel", () => {
  it("is labelled with the client's name and links to close and to the full page", () => {
    panel();
    const aside = screen.getByRole("complementary", { name: /dana reyes/i });
    expect(within(aside).getByRole("heading", { name: "Dana Reyes" })).toBeInTheDocument();
    expect(within(aside).getByRole("link", { name: "Close" })).toHaveAttribute("href", "/admin");
    expect(within(aside).getByRole("link", { name: "Full page" })).toHaveAttribute("href", `/admin/jobs/${ID}`);
  });

  it("offers a Call button at the top of the Contact section", () => {
    panel();
    expect(screen.getByRole("link", { name: "Log a call" })).toHaveAttribute("href", `/admin/jobs/${ID}/call`);
  });

  it("offers the Assigned to control in the Contact section", () => {
    panel();
    const contact = screen.getByRole("region", { name: "Contact" });
    expect(within(contact).getByLabelText("Assigned to")).toBeInTheDocument();
  });

  it("shows contact and address links", () => {
    panel();
    expect(screen.getByRole("link", { name: "(702) 555-0134" })).toHaveAttribute("href", "tel:+17025550134");
    expect(screen.getByRole("link", { name: "dana@example.com" })).toHaveAttribute("href", "mailto:dana@example.com");
    expect(screen.getByRole("link", { name: "12 Main St, Henderson" })).toHaveAttribute(
      "href", "https://maps.google.com/?q=12%20Main%20St%2C%20Henderson%2C%20NV",
    );
  });

  it("shows the money, with balance due as sold minus deposit", () => {
    panel();
    const money = screen.getByRole("region", { name: "Money" });
    expect(money).toHaveTextContent("Quote$4,800");
    expect(money).toHaveTextContent("Sold$4,500");
    expect(money).toHaveTextContent("Deposit$2,250");
    expect(money).toHaveTextContent("Balance due$2,250");
  });

  it("shows a dash for balance due unless both sold and deposit are set", () => {
    panel({ depositCents: null });
    expect(screen.getByRole("region", { name: "Money" })).toHaveTextContent("Balance due—");
  });

  it("shows the stage controls, key dates, and days in stage with the overdue flag", () => {
    // Sold for 2 days: the limit is 3, so not overdue.
    panel();
    const stage = screen.getByRole("region", { name: "Stage and dates" });
    expect(within(stage).getByText(/Stage:/)).toHaveTextContent("Sold");
    expect(stage).toHaveTextContent("Install2026-10-02");
    expect(stage).toHaveTextContent("Visit—");
    expect(stage).toHaveTextContent("2 days in stage");
    expect(stage).not.toHaveTextContent("Overdue");
    expect(within(stage).getByLabelText("Set stage")).toBeInTheDocument();
    expect(within(stage).queryByRole("button", { name: /^Move to/ })).toBeNull();
  });

  it("flags an overdue job in the stage section", () => {
    panel({ stageChangedAt: new Date("2026-09-01T00:00:00Z") }); // sold 9 days
    expect(screen.getByRole("region", { name: "Stage and dates" })).toHaveTextContent("Overdue");
  });

  it("includes the measurements and files section", () => {
    panel();
    const files = screen.getByRole("region", { name: "Measurements and files" });
    expect(files).toHaveTextContent("Measurements · 0");
  });

  it("says when the job no longer exists, with a way back", () => {
    panel(null);
    expect(screen.getByText("That job no longer exists.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute("href", "/admin");
  });
});
