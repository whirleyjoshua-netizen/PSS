import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FormState } from "@/app/admin/jobs/actions";

const bookAppointment = vi.fn<(...args: unknown[]) => Promise<FormState>>(async () => ({ ok: true }));
vi.mock("@/app/admin/jobs/appointment-actions", () => ({
  bookAppointment, confirmSchedule: vi.fn(async () => ({})), cancelAppointmentAction: vi.fn(async () => ({})),
}));

const { ScheduleDialog } = await import("@/app/admin/jobs/[id]/ScheduleDialog");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

beforeEach(() => { bookAppointment.mockClear(); });

describe("ScheduleDialog", () => {
  it("offers Schedule as a button, not a link", () => {
    render(<ScheduleDialog jobId={ID} />);
    expect(screen.getByRole("button", { name: "Schedule" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Schedule" })).toBeNull();
  });

  it("asks for a date and what the appointment is for, defaulting to Consultation", async () => {
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} />);
    await user.click(screen.getByRole("button", { name: "Schedule" }));

    expect(screen.getByLabelText("Date and time")).toHaveAttribute("type", "datetime-local");
    const kinds = screen.getByRole("group", { name: "What is this for?" });
    for (const label of ["Consultation", "Measure", "Install", "Service"]) {
      expect(within(kinds).getByRole("radio", { name: label })).toBeInTheDocument();
    }
    expect(within(kinds).getByRole("radio", { name: "Consultation" })).toBeChecked();
  });

  it("books what the owner picked", async () => {
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} />);
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.click(screen.getByRole("radio", { name: "Measure" }));
    await user.type(screen.getByLabelText("Date and time"), "2026-09-20T10:00");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(bookAppointment).toHaveBeenCalled();
    expect(bookAppointment.mock.calls[0][0]).toBe(ID);
    const data = bookAppointment.mock.calls[0][2] as FormData;
    expect(data.get("kind")).toBe("measure");
    expect(data.get("startsAt")).toBe("2026-09-20T10:00");
  });

  it("shows what went wrong", async () => {
    bookAppointment.mockResolvedValueOnce({ error: "Pick a date and time" });
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} />);
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pick a date and time");
  });

  it("carries the appointment being moved as the starting point", async () => {
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} label="Reschedule" kind="install" startsAt="2026-10-02T09:00" />);
    await user.click(screen.getByRole("button", { name: "Reschedule" }));
    expect(screen.getByLabelText("Date and time")).toHaveValue("2026-10-02T09:00");
    expect(screen.getByRole("radio", { name: "Install" })).toBeChecked();
  });

  it("degrades to a disclosure holding the same form without JavaScript", () => {
    // Static markup is what a browser with JavaScript off receives: no effects have run.
    const html = renderToStaticMarkup(<ScheduleDialog jobId={ID} />);
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain('name="startsAt"');
    expect(html).toContain('name="kind"');
    expect(html).toContain("Save");
    expect(html).not.toContain("<dialog");
  });
});
