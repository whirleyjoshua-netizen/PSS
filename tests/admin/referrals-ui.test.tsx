import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { Job } from "@/lib/admin/jobs";

const sendReviewNow = vi.fn(async () => ({ error: "This job has no email address." }));
const saveReviewOptOut: (id: string, optOut: boolean) => Promise<void> = vi.fn(async () => {});
const createReferralLink = vi.fn(async () => ({ ok: true }));
const payReferral = vi.fn(async () => ({ ok: true }));
vi.mock("@/app/admin/jobs/actions", () => ({ sendReviewNow, saveReviewOptOut, createReferralLink, payReferral }));

const { ReviewSection } = await import("@/app/admin/jobs/[id]/ReviewSection");
const { ReferralSection } = await import("@/app/admin/jobs/[id]/ReferralSection");
const { ReferralsList } = await import("@/app/admin/jobs/[id]/ReferralsList");
const { business } = await import("@/content/business");

const job: Job = {
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", createdAt: new Date(), name: "Dana Reyes",
  phone: "7025550134", email: "dana@example.com", address: null, city: "Henderson", treatments: [],
  windowCount: null, heardVia: null, notes: null, source: "contact", status: "installed",
  stageChangedAt: new Date(), visitAt: null, quoteCents: null, soldCents: null, depositCents: null,
  brands: [], orderedOn: null, installOn: null, lostReason: null,
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false,
};

describe("review section", () => {
  it("says when nothing has been sent and offers to send now", () => {
    render(<ReviewSection job={job} />);
    expect(screen.getByText(/not sent/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send now" })).toBeInTheDocument();
  });

  it("shows a send error inline", async () => {
    render(<ReviewSection job={job} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Send now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no email/i);
  });

  it("saves the opt-out when the box is ticked", async () => {
    render(<ReviewSection job={job} />);
    await userEvent.setup().click(screen.getByRole("checkbox", { name: /don't send/i }));
    expect(saveReviewOptOut).toHaveBeenCalledWith(job.id, true);
  });

  it("reverts the checkbox and shows an error when the save fails", async () => {
    vi.mocked(saveReviewOptOut).mockRejectedValueOnce(new Error("boom"));
    render(<ReviewSection job={job} />);
    const checkbox = screen.getByRole("checkbox", { name: /don't send/i });
    await userEvent.setup().click(checkbox);
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't save/i);
    expect(checkbox).not.toBeChecked();
  });

  it("offers no Send now before installation, and says when the request will go out", () => {
    render(<ReviewSection job={{ ...job, status: "sold" }} />);
    expect(screen.queryByRole("button", { name: "Send now" })).toBeNull();
    expect(screen.getByText(/morning after installation/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /don't send/i })).toBeInTheDocument();
  });
});

describe("referral section", () => {
  it("offers to create a link when the job has none", () => {
    render(<ReferralSection job={job} />);
    expect(screen.getByRole("button", { name: "Get referral link" })).toBeInTheDocument();
  });

  it("shows the link once the job has a code", () => {
    render(<ReferralSection job={{ ...job, referralCode: "K7M2QX" }} />);
    expect(screen.getByText(`${business.domain}/r/K7M2QX`)).toBeInTheDocument();
  });

  it("shows Copied when the clipboard write succeeds", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<ReferralSection job={{ ...job, referralCode: "K7M2QX" }} />);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("shows an inline error when the clipboard write fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<ReferralSection job={{ ...job, referralCode: "K7M2QX" }} />);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't copy/i);
  });
});

describe("referrals list", () => {
  it("shows each referral's reward and a pay button only when owed", () => {
    render(
      <ReferralsList
        referrerId={job.id}
        referrals={[
          { id: "a", name: "Ana Diaz", status: "sold", referralPaidAt: null, reward: "pending" },
          { id: "b", name: "Ben Ortiz", status: "installed", referralPaidAt: null, reward: "owed" },
          { id: "c", name: "Cy Park", status: "installed", referralPaidAt: new Date("2026-09-01T18:00:00Z"), reward: "paid" },
        ]}
      />,
    );
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("$100 owed")).toBeInTheDocument();
    expect(screen.getByText(/^Paid /)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Mark paid" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Ana Diaz" })).toHaveAttribute("href", "/admin/jobs/a");
  });
});
