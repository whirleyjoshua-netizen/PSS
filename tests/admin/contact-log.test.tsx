import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/admin/jobs/contact-actions", () => ({ logContactAction: vi.fn(async () => ({ ok: true })) }));
const { ContactLog } = await import("@/app/admin/jobs/[id]/ContactLog");

describe("ContactLog", () => {
  it("opens the ways and a note once Mark contacted is ticked", () => {
    render(<ContactLog jobId="3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c" />);
    expect(screen.queryByLabelText("Called")).toBeNull();
    fireEvent.click(screen.getByLabelText("Mark contacted"));
    for (const label of ["Called", "Texted", "Voicemail", "Email"]) expect(screen.getByLabelText(label)).not.toBeChecked();
    expect(screen.getByLabelText("Note (optional)")).toHaveAttribute("maxLength", "500");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
