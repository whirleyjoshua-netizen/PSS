import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const pathname = vi.fn(() => "/admin");
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));
vi.mock("@/app/admin/actions", () => ({ signOut: vi.fn(async () => {}) }));

const { AdminNav } = await import("@/app/admin/AdminNav");

// The desktop column and the phone menu render the same links; check the column.
const column = () => screen.getAllByRole("navigation", { name: "Admin" })[0];

beforeEach(() => {
  pathname.mockReset();
});

describe("AdminNav", () => {
  it("links to Jobs, New job, and Settings", () => {
    pathname.mockReturnValue("/admin");
    render(<AdminNav email="owner@example.com" />);

    const nav = within(column());
    expect(nav.getByRole("link", { name: "Jobs" })).toHaveAttribute("href", "/admin");
    expect(nav.getByRole("link", { name: "New job" })).toHaveAttribute("href", "/admin/jobs/new");
    expect(nav.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/admin/settings");
  });

  it("marks a job page as part of Jobs, and the new-job form as its own page", () => {
    pathname.mockReturnValue("/admin/jobs/3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c");
    const { unmount } = render(<AdminNav email="owner@example.com" />);
    expect(within(column()).getByRole("link", { name: "Jobs" })).toHaveAttribute("aria-current", "page");
    unmount();

    pathname.mockReturnValue("/admin/jobs/new");
    render(<AdminNav email="owner@example.com" />);
    expect(within(column()).getByRole("link", { name: "New job" })).toHaveAttribute("aria-current", "page");
    expect(within(column()).getByRole("link", { name: "Jobs" })).not.toHaveAttribute("aria-current");
  });

  it("shows who is signed in and a sign-out button", () => {
    pathname.mockReturnValue("/admin/settings");
    render(<AdminNav email="owner@example.com" />);

    expect(screen.getAllByText("owner@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Sign out" }).length).toBeGreaterThan(0);
  });
});
