import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Appointment } from "@/lib/admin/appointments";

vi.mock("@/app/admin/jobs/appointment-actions", () => ({
  bookAppointment: vi.fn(async () => ({})),
  confirmSchedule: vi.fn(async () => ({})),
  cancelAppointmentAction: vi.fn(async () => ({})),
}));

const { AppointmentsCard } = await import("@/app/admin/jobs/[id]/AppointmentsCard");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const APPT = "9c8b7a65-4d3e-4f21-8a0b-1c2d3e4f5a6b";
/** 10:00 AM in Las Vegas on Sunday, September 20 2026. */
const STARTS = new Date("2026-09-20T17:00:00Z");

const appointment = (over: Partial<Appointment> = {}): Appointment => ({
  id: APPT, jobId: ID, kind: "consultation", startsAt: STARTS, allDay: false,
  confirmedAt: null, confirmedBy: null, ...over,
});

const card = () => screen.getByRole("region", { name: "Appointments" });

describe("AppointmentsCard", () => {
  it("says nothing is scheduled, with a way to schedule one", () => {
    render(<AppointmentsCard jobId={ID} appointments={[]} />);
    expect(card()).toHaveTextContent("Nothing scheduled");
    expect(within(card()).getByRole("button", { name: "Schedule" })).toBeInTheDocument();
  });

  it("shows a pending appointment with its kind, time and the confirm step", () => {
    render(<AppointmentsCard jobId={ID} appointments={[appointment()]} />);
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
    render(<AppointmentsCard jobId={ID} appointments={[appointment({ kind: "install" })]} />);
    // The chip leads the row; the Reschedule form below it names the kinds too.
    const chip = within(card()).getByRole("listitem").querySelector("span")!;
    expect(chip).toHaveTextContent("Install");
    expect(chip.className).toMatch(/appt-install/);
    expect(chip.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it("offers Reschedule and Cancel, but no Confirm, once confirmed", () => {
    render(<AppointmentsCard jobId={ID} appointments={[appointment({
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
    render(<AppointmentsCard jobId={ID} appointments={[appointment({ kind: "install", allDay: true })]} />);
    const row = within(card()).getByRole("listitem");
    expect(row).toHaveTextContent("Sep 20, 2026");
    expect(row).not.toHaveTextContent("10:00 AM");
  });

  it("keeps every booking form's field ids to itself", () => {
    // Several dialogs share the page, so a repeated id would point a label at another row's input.
    const { container } = render(<AppointmentsCard jobId={ID} appointments={[
      appointment(),
      appointment({ id: "b", kind: "measure", startsAt: new Date("2026-09-24T17:00:00Z") }),
    ]} />);
    const ids = [...container.querySelectorAll("input[id]")].map((input) => input.id);
    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lists every appointment it is given", () => {
    render(<AppointmentsCard jobId={ID} appointments={[
      appointment(),
      appointment({ id: "b", kind: "measure", startsAt: new Date("2026-09-24T17:00:00Z") }),
    ]} />);
    expect(within(card()).getAllByRole("listitem")).toHaveLength(2);
  });
});
