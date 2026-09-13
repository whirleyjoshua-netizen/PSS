import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/admin/jobs/actions", () => ({ sendPortalInviteNow: vi.fn() }));
const { InviteSection } = await import("@/app/admin/jobs/[id]/InviteSection");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

describe("InviteSection", () => {
  it("asks for an email when there is none", () => {
    render(<InviteSection jobId={JOB} hasEmail={false} canInvite invitedLabel={null} />);
    expect(screen.getByText("Add an email to invite this customer to their project page.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("waits for Quoted", () => {
    render(<InviteSection jobId={JOB} hasEmail canInvite={false} invitedLabel={null} />);
    expect(screen.getByText("The customer can be invited once the job is Quoted.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers a first invite", () => {
    render(<InviteSection jobId={JOB} hasEmail canInvite invitedLabel={null} />);
    expect(screen.getByRole("button", { name: "Send portal invite" })).toBeInTheDocument();
  });

  it("offers a resend once invited, with when", () => {
    render(<InviteSection jobId={JOB} hasEmail canInvite invitedLabel="Sep 13, 10:00 AM" />);
    expect(screen.getByText("Invite sent Sep 13, 10:00 AM.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend portal invite" })).toBeInTheDocument();
  });
});
