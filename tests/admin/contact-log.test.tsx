import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const logContactAction = vi.fn<(...args: unknown[]) => Promise<{ ok: true }>>(async () => ({ ok: true }));
vi.mock("@/app/admin/jobs/contact-actions", () => ({ logContactAction: (...args: unknown[]) => logContactAction(...args) }));
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

  it("closes the form and shows a saved status after a successful save", async () => {
    logContactAction.mockResolvedValueOnce({ ok: true });
    render(<ContactLog jobId="3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c" />);
    fireEvent.click(screen.getByLabelText("Mark contacted"));
    fireEvent.click(screen.getByLabelText("Called"));
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Contact saved");
    expect(screen.queryByLabelText("Called")).toBeNull();
  });
});
