import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const pathname = vi.fn(() => "/admin");
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => pathname(), useRouter: () => ({ refresh }) }));
vi.mock("@/app/admin/actions", () => ({ signOut: vi.fn(async () => {}) }));

const { AdminNav, initialsFor } = await import("@/app/admin/AdminNav");

// The desktop column and the phone menu render the same links; check the column.
const column = () => screen.getAllByRole("navigation", { name: "Admin" })[0];

beforeEach(() => {
  pathname.mockReset();
});

describe("AdminNav", () => {
  it("links to Jobs, Schedule, Tasks, Documents and Settings, with no New job link", () => {
    pathname.mockReturnValue("/admin");
    render(<AdminNav email="owner@example.com" />);

    const nav = within(column());
    expect(nav.getByRole("link", { name: "Jobs" })).toHaveAttribute("href", "/admin");
    expect(nav.queryByRole("link", { name: /new job/i })).toBeNull();
    expect(nav.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/admin/settings");
    expect(nav.getByRole("link", { name: "Schedule" })).toHaveAttribute("href", "/admin/schedule");
    expect(nav.getByRole("link", { name: "Documents" })).toHaveAttribute("href", "/admin/documents");
    expect(nav.getByRole("link", { name: "Tasks" })).toHaveAttribute("href", "/admin/tasks");
    // Order: Tasks sits between Schedule and Documents.
    expect(nav.getAllByRole("link").map((link) => link.textContent?.trim())).toEqual(
      expect.arrayContaining(["Jobs", "Schedule", "Tasks", "Documents", "Settings"]));
    const names = nav.getAllByRole("link").map((link) => link.textContent?.trim());
    expect(names.indexOf("Tasks")).toBe(names.indexOf("Schedule") + 1);
    expect(names.indexOf("Documents")).toBe(names.indexOf("Tasks") + 1);
  });

  it("marks the board and every task page as Tasks", () => {
    for (const path of ["/admin/tasks", "/admin/tasks/3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c"]) {
      pathname.mockReturnValue(path);
      const { unmount } = render(<AdminNav email="owner@example.com" />);
      expect(within(column()).getByRole("link", { name: "Tasks" })).toHaveAttribute("aria-current", "page");
      unmount();
    }
  });

  it("marks the Schedule page as active and Jobs as not", () => {
    pathname.mockReturnValue("/admin/schedule");
    render(<AdminNav email="owner@example.com" />);
    expect(within(column()).getByRole("link", { name: "Schedule" })).toHaveAttribute("aria-current", "page");
    expect(within(column()).getByRole("link", { name: "Jobs" })).not.toHaveAttribute("aria-current");
  });

  it("marks a job page and the new-job form as part of Jobs", () => {
    pathname.mockReturnValue("/admin/jobs/3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c");
    const { unmount } = render(<AdminNav email="owner@example.com" />);
    expect(within(column()).getByRole("link", { name: "Jobs" })).toHaveAttribute("aria-current", "page");
    unmount();

    pathname.mockReturnValue("/admin/jobs/new");
    render(<AdminNav email="owner@example.com" />);
    expect(within(column()).getByRole("link", { name: "Jobs" })).toHaveAttribute("aria-current", "page");
  });

  it("shows who is signed in and a sign-out button", () => {
    pathname.mockReturnValue("/admin/settings");
    render(<AdminNav email="owner@example.com" />);

    expect(screen.getAllByText("owner@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Sign out" }).length).toBeGreaterThan(0);
  });

  it("marks the Documents page and every template page as Documents", () => {
    for (const path of ["/admin/documents", "/admin/documents/new", "/admin/documents/3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c"]) {
      pathname.mockReturnValue(path);
      const { unmount } = render(<AdminNav email="owner@example.com" />);
      expect(within(column()).getByRole("link", { name: "Documents" })).toHaveAttribute("aria-current", "page");
      for (const other of ["Jobs", "Schedule", "Settings"]) {
        expect(within(column()).getByRole("link", { name: other })).not.toHaveAttribute("aria-current");
      }
      unmount();
    }
  });
  it("lists the six sections in order", () => {
    pathname.mockReturnValue("/admin");
    render(<AdminNav email="owner@example.com" />);
    expect(within(column()).getAllByRole("link").map((l) => l.textContent)).toEqual(["Jobs", "Schedule", "Tasks", "Documents", "Resources", "Settings"]);
  });

  it("marks the Resources page as Resources", () => {
    pathname.mockReturnValue("/admin/resources");
    render(<AdminNav email="owner@example.com" />);
    const link = within(column()).getByRole("link", { name: "Resources" });
    expect(link).toHaveAttribute("href", "/admin/resources");
    expect(link).toHaveAttribute("aria-current", "page");
  });
});

describe("sidebar focus ring", () => {
  it("puts admin-sidebar on the desktop aside and the phone header, for the focus-ring override", () => {
    pathname.mockReturnValue("/admin");
    const { container } = render(<AdminNav email="owner@example.com" />);
    expect(container.querySelector("aside")).toHaveClass("admin-sidebar");
    expect(container.querySelector("header")).toHaveClass("admin-sidebar");
    expect(container.querySelector("header details")).not.toBeNull();
  });
});

describe("phone header", () => {
  it("stays on screen under the status bar, padded clear of the notch in either orientation", () => {
    pathname.mockReturnValue("/admin");
    const { container } = render(<AdminNav email="owner@example.com" />);
    const header = container.querySelector("header")!;
    for (const name of [
      "sticky",
      "top-0",
      "bg-sidebar",
      "md:hidden",
      "pt-[env(safe-area-inset-top)]",
      "pl-[max(1rem,env(safe-area-inset-left))]",
      "pr-[max(1rem,env(safe-area-inset-right))]",
    ]) expect(header, name).toHaveClass(name);
  });

  it("scrolls the open menu inside the sticky header when it is taller than the screen", () => {
    pathname.mockReturnValue("/admin");
    const { container } = render(<AdminNav email="owner@example.com" />);
    const menu = container.querySelector("header details > div")!;
    for (const name of ["max-h-[calc(100dvh-3.5rem)]", "overflow-y-auto"]) expect(menu, name).toHaveClass(name);
  });

  it("offers Refresh beside the Menu, outside its summary, since the home-screen app has no pull-to-refresh", () => {
    pathname.mockReturnValue("/admin");
    const { container } = render(<AdminNav email="owner@example.com" />);
    const header = container.querySelector("header")!;
    const summary = header.querySelector("summary")!;
    expect(within(summary).getByText("Menu")).toBeInTheDocument();
    expect(within(summary).queryByRole("button", { name: "Refresh" })).toBeNull();
    const button = within(header).getByRole("button", { name: "Refresh" });
    expect(header.querySelector("details")!.contains(button)).toBe(false);
  });

  it("refreshes without opening or closing the menu", () => {
    pathname.mockReturnValue("/admin");
    refresh.mockClear();
    const { container } = render(<AdminNav email="owner@example.com" />);
    const header = container.querySelector("header")!;
    const details = header.querySelector("details")!;
    const toggles = vi.fn();
    details.addEventListener("toggle", toggles);

    fireEvent.click(within(header).getByRole("button", { name: "Refresh" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(details.open).toBe(false);

    details.open = true;
    fireEvent.click(within(header).getByRole("button", { name: "Refresh" }));
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(details.open).toBe(true);
  });
});

describe("sidebar look", () => {
  it("shows the Premier Shade Solutions logo and an initials badge", () => {
    pathname.mockReturnValue("/admin");
    render(<AdminNav email="joshua.whirley@example.com" />);
    expect(screen.getAllByRole("img", { name: "Premier Shade Solutions" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("JW").length).toBeGreaterThan(0);
  });

  it("makes initials from the email's local part", () => {
    expect(initialsFor("joshua.whirley@example.com")).toBe("JW");
    expect(initialsFor("owner@example.com")).toBe("OW");
    expect(initialsFor("a@example.com")).toBe("A");
  });
});
