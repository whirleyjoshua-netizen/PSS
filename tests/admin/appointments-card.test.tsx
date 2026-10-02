import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Appointment } from "@/lib/admin/appointments";
import type { FormState } from "@/app/admin/jobs/actions";

const confirmSchedule = vi.fn<(...args: unknown[]) => Promise<FormState>>(async () => ({ ok: true }));
const cancelAppointmentAction = vi.fn<(...args: unknown[]) => Promise<FormState>>(async () => ({ ok: true }));
const updateAppointmentNotes = vi.fn<(...args: unknown[]) => Promise<FormState>>(async () => ({ ok: true }));
const bookAppointment = vi.fn<(...args: unknown[]) => Promise<FormState>>(async () => ({}));
vi.mock("@/app/admin/jobs/appointment-actions", () => ({
  bookAppointment, confirmSchedule, cancelAppointmentAction, updateAppointmentNotes,
}));

beforeEach(() => {
  confirmSchedule.mockClear().mockResolvedValue({ ok: true });
  cancelAppointmentAction.mockClear().mockResolvedValue({ ok: true });
  updateAppointmentNotes.mockClear().mockResolvedValue({ ok: true });
  bookAppointment.mockClear();
});

const { AppointmentsCard } = await import("@/app/admin/jobs/[id]/AppointmentsCard");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const MINUTES = { consultation: 60, measure: 60, install: 240, service: 90 };
const APPT = "9c8b7a65-4d3e-4f21-8a0b-1c2d3e4f5a6b";
/** 10:00 AM in Las Vegas on Sunday, September 20 2026. */
const STARTS = new Date("2026-09-20T17:00:00Z");

const appointment = (over: Partial<Appointment> = {}): Appointment => ({
  id: APPT, jobId: ID, kind: "consultation", startsAt: STARTS, allDay: false,
  confirmedAt: null, confirmedBy: null, designerNotes: null, windowStart: null, windowEnd: null, durationMinutes: null, ...over,
});

const card = () => screen.getByRole("region", { name: "Appointments" });
const renderConfirmed = () => render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment({
  confirmedAt: new Date("2026-09-18T12:00:00Z"), confirmedBy: "owner@example.com",
})]} />);

describe("AppointmentsCard", () => {
  it("says nothing is scheduled, with a way to schedule one", () => {
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[]} />);
    expect(card()).toHaveTextContent("Nothing scheduled");
    expect(within(card()).getByRole("button", { name: "Schedule" })).toBeInTheDocument();
  });

  it("shows a pending appointment with its kind, time and the confirm step", () => {
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment()]} />);
    const row = within(card()).getByRole("listitem");
    expect(row).toHaveTextContent("Consultation");
    expect(row).toHaveTextContent("Sep 20");
    expect(row).toHaveTextContent("10:00 AM");
    expect(row).toHaveTextContent("Pending confirmation");
    expect(within(row).getByRole("button", { name: "Confirm schedule" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Reschedule" })).toBeInTheDocument();
    expect(card()).not.toHaveTextContent("Nothing scheduled");
  });

  it("tints the kind chip for the kind of appointment", () => {
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment({ kind: "install" })]} />);
    // The chip leads the row; the Reschedule form below it names the kinds too.
    const chip = within(card()).getByRole("listitem").querySelector("span")!;
    expect(chip).toHaveTextContent("Install");
    expect(chip.className).toMatch(/appt-install/);
    expect(chip.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it("offers Reschedule and Cancel, but no Confirm, once confirmed", () => {
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment({
      confirmedAt: new Date("2026-09-18T12:00:00Z"), confirmedBy: "owner@example.com",
    })]} />);
    const row = within(card()).getByRole("listitem");
    expect(row).toHaveTextContent("Confirmed");
    expect(row).not.toHaveTextContent("Pending confirmation");
    expect(within(row).getByRole("button", { name: "Reschedule" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Confirm schedule" })).toBeNull();
  });

  it("describes an all-day appointment by its date alone", () => {
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment({ kind: "install", allDay: true })]} />);
    const row = within(card()).getByRole("listitem");
    // The row also holds the reschedule dialog's time options, so check the date line itself.
    expect(within(row).getByText("Sep 20, 2026")).toBeInTheDocument();
    expect(within(row).queryByText(/Sep 20, 2026.*\d:\d\d/)).toBeNull();
  });

  it("keeps every booking form's field ids to itself", () => {
    // Several dialogs share the page, so a repeated id would point a label at another row's input.
    const { container } = render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[
      appointment(),
      appointment({ id: "b", kind: "measure", startsAt: new Date("2026-09-24T17:00:00Z") }),
    ]} />);
    const ids = [...container.querySelectorAll("input[id]")].map((input) => input.id);
    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("confirms as the signed-in owner, for this appointment", async () => {
    const user = userEvent.setup();
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment()]} />);
    await user.click(screen.getByRole("button", { name: "Confirm schedule" }));
    expect(confirmSchedule).toHaveBeenCalled();
    expect(confirmSchedule.mock.calls[0].slice(0, 2)).toEqual([APPT, ID]);
  });

  // A confirmation whose email did not go out must say so: the customer was not told.
  it("shows the owner when confirming could not email the customer", async () => {
    confirmSchedule.mockResolvedValue({ error: "Confirmed, but the email could not be sent." });
    const user = userEvent.setup();
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment()]} />);
    await user.click(screen.getByRole("button", { name: "Confirm schedule" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Confirmed, but the email could not be sent.");
  });

  it("shows the owner when cancelling failed", async () => {
    cancelAppointmentAction.mockResolvedValue({ error: "That appointment no longer exists." });
    const user = userEvent.setup();
    renderConfirmed();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Yes, cancel" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That appointment no longer exists.");
  });

  // Cancelling deletes the appointment and its calendar event, with no undo: one stray tap must not do it.
  it("asks before cancelling, naming what a cancellation removes", async () => {
    const user = userEvent.setup();
    renderConfirmed();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelAppointmentAction).not.toHaveBeenCalled();
    expect(card()).toHaveTextContent("Cancel this appointment? It will be removed from the calendar.");
    expect(screen.getByRole("button", { name: "Keep it" })).toBeInTheDocument();
  });

  it("cancels this appointment only once the owner says yes", async () => {
    const user = userEvent.setup();
    renderConfirmed();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Yes, cancel" }));
    expect(cancelAppointmentAction).toHaveBeenCalled();
    expect(cancelAppointmentAction.mock.calls[0].slice(0, 2)).toEqual([APPT, ID]);
  });

  it("puts the row back, untouched, on Keep it", async () => {
    const user = userEvent.setup();
    renderConfirmed();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(cancelAppointmentAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yes, cancel" })).toBeNull();
    expect(card()).toHaveTextContent("Confirmed");
  });

  it("degrades the cancel confirmation to a disclosure without JavaScript", () => {
    const html = renderToStaticMarkup(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment({
      confirmedAt: new Date("2026-09-18T12:00:00Z"), confirmedBy: "owner@example.com",
    })]} />);
    expect(html).toContain("<details");
    expect(html).toContain("It will be removed from the calendar.");
    expect(html).toContain("Yes, cancel");
  });

  it("keeps a form out of phrasing-only markup", () => {
    const { container } = render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment()]} />);
    expect(container.querySelector("span form")).toBeNull();
  });

  it("lists every appointment it is given", () => {
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[
      appointment(),
      appointment({ id: "b", kind: "measure", startsAt: new Date("2026-09-24T17:00:00Z") }),
    ]} />);
    expect(within(card()).getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows the arrival window and the length", () => {
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment({
      windowStart: "08:00", windowEnd: "10:00", durationMinutes: 240,
    })]} />);
    const row = within(card()).getByRole("listitem");
    expect(row).toHaveTextContent("Arrives 8:00 – 10:00 AM");
    expect(row).toHaveTextContent("4 h");
  });

  it("says nothing of a window or length the appointment does not have", () => {
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment()]} />);
    const row = within(card()).getByRole("listitem");
    expect(row).not.toHaveTextContent("Arrives");
    expect(row).not.toHaveTextContent(/\d h/);
  });

  it("hands the notes and the client's gate code to Reschedule", async () => {
    const user = userEvent.setup();
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} gateCode="#4321"
      appointments={[appointment({ designerNotes: "Side gate sticks" })]} />);
    await user.click(screen.getByRole("button", { name: "Reschedule" }));
    const dialog = screen.getByRole("dialog", { name: "Reschedule" });
    expect(within(dialog).getByLabelText("Designer notes")).toHaveValue("Side gate sticks");
    expect(within(dialog).getByLabelText("Gate code")).toHaveValue("#4321");
  });

  it("hands the client's gate code to the empty card's Schedule", async () => {
    const user = userEvent.setup();
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} gateCode="#4321" appointments={[]} />);
    await user.click(within(card()).getByRole("button", { name: "Schedule" }));
    expect(screen.getByLabelText("Gate code")).toHaveValue("#4321");
  });

  it("hands the window and length to Reschedule", async () => {
    const user = userEvent.setup();
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment({
      kind: "install", windowStart: "08:00", windowEnd: "10:00", durationMinutes: 90,
    })]} />);
    await user.click(screen.getByRole("button", { name: "Reschedule" }));
    expect(screen.getByLabelText("Length (hours)")).toHaveValue(1.5);
    expect(screen.getByRole("combobox", { name: "From" })).toHaveValue("08:00");
    expect(screen.getByRole("combobox", { name: "To" })).toHaveValue("10:00");
  });

  it("shows an appointment's designer notes with their line breaks kept", () => {
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment({ designerNotes: "Side gate sticks\n  Dog in the yard" })]} />);
    const row = within(card()).getByRole("listitem");
    const notes = within(row).getByText((_, element) => element?.tagName === "P" && element.textContent === "Side gate sticks\n  Dog in the yard");
    expect(notes.className).toMatch(/whitespace-pre-wrap/);
  });

  it("shows no notes block for an appointment without notes", () => {
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment()]} />);
    expect(within(card()).getByRole("listitem").querySelector(".whitespace-pre-wrap")).toBeNull();
  });

  it("offers Edit notes on pending and confirmed appointments alike", () => {
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[
      appointment(),
      appointment({ id: "b", kind: "measure", confirmedAt: new Date("2026-09-18T12:00:00Z"), confirmedBy: "owner@example.com" }),
    ]} />);
    const rows = within(card()).getAllByRole("listitem");
    for (const row of rows) expect(within(row).getByRole("button", { name: "Edit notes" })).toBeInTheDocument();
  });

  it("edits just the notes and the gate code of this appointment, never rebooking it", async () => {
    const user = userEvent.setup();
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} gateCode="#4321" appointments={[appointment({
      confirmedAt: new Date("2026-09-18T12:00:00Z"), confirmedBy: "owner@example.com", designerNotes: "Old note",
    })]} />);
    await user.click(screen.getByRole("button", { name: "Edit notes" }));
    const dialog = screen.getByRole("dialog", { name: "Edit notes" });
    const notes = within(dialog).getByLabelText("Designer notes");
    expect(notes).toHaveValue("Old note");
    expect(within(dialog).getByLabelText("Gate code")).toHaveValue("#4321");
    await user.clear(notes);
    await user.type(notes, "New note");
    await user.click(within(dialog).getByRole("button", { name: "Save notes" }));
    expect(updateAppointmentNotes).toHaveBeenCalled();
    expect(updateAppointmentNotes.mock.calls[0].slice(0, 2)).toEqual([APPT, ID]);
    const data = updateAppointmentNotes.mock.calls[0][3] as FormData;
    expect(data.get("designerNotes")).toBe("New note");
    expect(data.get("gateCode")).toBe("#4321");
    expect(data.has("startsAt")).toBe(false);
    expect(bookAppointment).not.toHaveBeenCalled();
  });

  it("shows why a notes edit failed", async () => {
    updateAppointmentNotes.mockResolvedValue({ error: "Keep the designer notes to 2,000 characters or fewer." });
    const user = userEvent.setup();
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment()]} />);
    await user.click(screen.getByRole("button", { name: "Edit notes" }));
    await user.click(screen.getByRole("button", { name: "Save notes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Keep the designer notes to 2,000 characters or fewer.");
  });

  it("degrades Edit notes to a disclosure holding the same form without JavaScript", () => {
    const html = renderToStaticMarkup(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment({ designerNotes: "Old note" })]} />);
    expect(html).toContain("Edit notes</summary>");
    expect(html).toContain("Save notes");
  });
});
