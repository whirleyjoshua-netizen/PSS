import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { RefreshButton } = await import("@/app/admin/RefreshButton");

describe("RefreshButton", () => {
  it("re-fetches the page without opening the menu it sits in", () => {
    const summaryClicks = vi.fn();
    const { container } = render(
      <details>
        <summary onClick={summaryClicks}>
          <RefreshButton />
          <span>Menu</span>
        </summary>
      </details>,
    );

    // fireEvent returns false when the handler called preventDefault — the summary's toggle.
    const notPrevented = fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
    // jsdom never toggles <details> for a nested button, so also prove the click never reached the summary's handlers.
    expect(summaryClicks).not.toHaveBeenCalled();
    expect(container.querySelector("details")!.open).toBe(false);
  });
});
