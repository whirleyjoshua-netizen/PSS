import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { RefreshButton } = await import("@/app/admin/RefreshButton");

describe("RefreshButton", () => {
  it("re-fetches the page's server data, as a plain button with no event tricks", () => {
    render(<RefreshButton />);
    // fireEvent returns false only when a handler called preventDefault. It sits outside the
    // Menu's <summary> (AdminNav), so it has nothing to prevent.
    const notPrevented = fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(true);
  });
});
