import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { DeleteButton } from "@/app/admin/jobs/[id]/DeleteButton";

describe("DeleteButton", () => {
  it("requires a second tap before it submits", async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const user = userEvent.setup();
    render(
      <form onSubmit={onSubmit}>
        <DeleteButton />
      </form>,
    );

    const button = screen.getByRole("button", { name: "Delete" });
    await user.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Tap again to delete" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tap again to delete" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
