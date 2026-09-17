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
const MINUTES = { consultation: 60, measure: 60, install: 240, service: 90 };

beforeEach(() => { bookAppointment.mockClear(); });

describe("ScheduleDialog", () => {
  it("offers Schedule as a button, not a link", () => {
    render(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} />);
    expect(screen.getByRole("button", { name: "Schedule" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Schedule" })).toBeNull();
  });

  it("asks for a date and what the appointment is for, defaulting to Consultation", async () => {
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} />);
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
    render(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} />);
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
    render(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} />);
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pick a date and time");
  });

  it("carries the appointment being moved as the starting point", async () => {
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} label="Reschedule" kind="install" startsAt="2026-10-02T09:00" />);
    await user.click(screen.getByRole("button", { name: "Reschedule" }));
    expect(screen.getByLabelText("Date and time")).toHaveValue("2026-10-02T09:00");
    expect(screen.getByRole("radio", { name: "Install" })).toBeChecked();
  });

  it("degrades to a disclosure holding the same form without JavaScript", () => {
    // Static markup is what a browser with JavaScript off receives: no effects have run.
    const html = renderToStaticMarkup(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} />);
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain('name="startsAt"');
    expect(html).toContain('name="kind"');
    expect(html).toContain("Save");
    expect(html).not.toContain("<dialog");
  });

  it("asks for an arrival window, Any time by default, from and to", async () => {
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} />);
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    const window = screen.getByRole("group", { name: "Arrival window" });
    for (const name of ["From", "To"]) {
      const select = within(window).getByRole("combobox", { name });
      expect(within(select).getAllByRole("option")[0]).toHaveTextContent("Any time");
      expect(select).toHaveValue("");
    }
  });

  it("pre-fills the length from the kind's default, following the kind until the owner types one", async () => {
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} kind="install" />);
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    const hours = screen.getByLabelText("Length (hours)");
    expect(hours).toHaveValue(4);
    await user.click(screen.getByRole("radio", { name: "Measure" }));
    expect(hours).toHaveValue(1);
    await user.clear(hours);
    await user.type(hours, "2");
    await user.click(screen.getByRole("radio", { name: "Install" }));
    expect(hours).toHaveValue(2);
  });

  it("books the window and length the owner picked", async () => {
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} />);
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "From" }), "08:00");
    await user.selectOptions(screen.getByRole("combobox", { name: "To" }), "10:00");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const data = bookAppointment.mock.calls[0][2] as FormData;
    expect(data.get("windowStart")).toBe("08:00");
    expect(data.get("windowEnd")).toBe("10:00");
    expect(data.get("hours")).toBe("1");
  });

  it("keeps a half-picked window when the submit fails", async () => {
    bookAppointment.mockResolvedValueOnce({
      error: "Pick both ends of the arrival window, or Any time", values: { windowStart: "08:00", windowEnd: "" },
    });
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} />);
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "From" }), "08:00");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("combobox", { name: "From" })).toHaveValue("08:00");
    expect(screen.getByRole("combobox", { name: "To" })).toHaveValue("");
  });

  it("keeps the date, kind and all-day the owner picked when the submit fails", async () => {
    bookAppointment.mockResolvedValueOnce({
      error: "Pick both ends of the arrival window, or Any time",
      values: { kind: "install", startsAt: "2026-09-20T10:00", allDay: "on", windowStart: "08:00", windowEnd: "" },
    });
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} />);
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.type(screen.getByLabelText("Date and time"), "2026-09-20T10:00");
    await user.click(screen.getByRole("radio", { name: "Install" }));
    await user.click(screen.getByLabelText("All day"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Date and time")).toHaveValue("2026-09-20T10:00");
    expect(screen.getByRole("radio", { name: "Install" })).toBeChecked();
    expect(screen.getByLabelText("All day")).toBeChecked();
  });

  it("clears all-day after a failed submit when the owner had unticked it", async () => {
    bookAppointment.mockResolvedValueOnce({ error: "Pick a date and time", values: { kind: "service", startsAt: "" } });
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} allDay kind="install" startsAt="2026-10-02T09:00" />);
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("All day")).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Service" })).toBeChecked();
    expect(screen.getByLabelText("Date and time")).toHaveValue("");
  });

  it("carries the window and length of the appointment being moved", async () => {
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} label="Reschedule" kind="install"
      windowStart="08:00" windowEnd="10:00" durationMinutes={90} />);
    await user.click(screen.getByRole("button", { name: "Reschedule" }));
    expect(screen.getByLabelText("Length (hours)")).toHaveValue(1.5);
    expect(screen.getByRole("combobox", { name: "From" })).toHaveValue("08:00");
    expect(screen.getByRole("combobox", { name: "To" })).toHaveValue("10:00");
  });
});
