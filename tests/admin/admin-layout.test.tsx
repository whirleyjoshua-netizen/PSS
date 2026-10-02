import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const getAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ getAdmin }));
// A stand-in that shows where the layout puts the worker registration.
vi.mock("@/app/admin/RegisterOpsWorker", () => ({ RegisterOpsWorker: () => <span data-testid="register-ops-worker" /> }));
vi.mock("@/app/admin/AdminNav", () => ({ AdminNav: ({ email }: { email: string }) => <nav aria-label="Admin">{email}</nav> }));

const { default: AdminLayout } = await import("@/app/admin/layout");

/** The layout is an async server component: await it, then render what it returns. */
const renderLayout = async () => render(await AdminLayout({ children: <p>page body</p> }));

const SIDES = ["pl-[max(1rem,env(safe-area-inset-left))]", "pr-[max(1rem,env(safe-area-inset-right))]"];

beforeEach(() => getAdmin.mockReset());

describe("admin layout", () => {
  it("signed in: pads the page clear of the notch and home bar, in landscape too", async () => {
    getAdmin.mockResolvedValue({ email: "owner@example.com" });
    await renderLayout();
    const main = screen.getByRole("main");
    expect(main).toHaveTextContent("page body");
    for (const name of [...SIDES, "pb-[max(1.5rem,env(safe-area-inset-bottom))]"]) expect(main, name).toHaveClass(name);
    expect(screen.getByRole("navigation", { name: "Admin" })).toHaveTextContent("owner@example.com");
  });

  it("signed out: pads the page clear of the notch and status bar, in landscape too", async () => {
    getAdmin.mockResolvedValue(null);
    await renderLayout();
    const main = screen.getByRole("main");
    expect(main).toHaveTextContent("page body");
    for (const name of [...SIDES, "pt-[max(1.5rem,env(safe-area-inset-top))]"]) expect(main, name).toHaveClass(name);
    expect(screen.queryByRole("navigation", { name: "Admin" })).toBeNull();
  });

  it("registers the offline service worker whether signed in or not", async () => {
    // Signed out matters most: the installed app opens on sign-in when the session has ended.
    for (const admin of [{ email: "owner@example.com" }, null]) {
      getAdmin.mockResolvedValue(admin);
      const { unmount } = await renderLayout();
      expect(screen.getAllByTestId("register-ops-worker"), JSON.stringify(admin)).toHaveLength(1);
      unmount();
    }
  });
});
