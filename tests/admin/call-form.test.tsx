import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const callDaySchedule = vi.fn();
vi.mock("@/app/admin/jobs/call-actions", () => ({ logCallAction: vi.fn(), callDaySchedule: (...args: unknown[]) => callDaySchedule(...args) }));
const { CallForm } = await import("@/app/admin/jobs/[id]/call/CallForm");

const job = { id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", treatments: ["Shades"], windowCount: "6-10", budgetTier: "mid" as const, visitAt: null };

beforeEach(() => {
  callDaySchedule.mockReset().mockResolvedValue({ ok: true, items: [], notice: null });
});

const bookVisit = (datetime: string) => {
  render(<CallForm job={job} />);
  fireEvent.click(screen.getByRole("button", { name: "Booked a visit" }));
  fireEvent.change(screen.getByLabelText("Visit date and time"), { target: { value: datetime } });
};

describe("CallForm", () => {
  it("is pre-filled from the job", () => {
    render(<CallForm job={job} />);
    expect(screen.getByLabelText("Shades")).toBeChecked();
    expect(screen.getByLabelText("Shutters")).not.toBeChecked();
    expect(screen.getByLabelText("6-10")).toBeChecked();
    expect(screen.getByLabelText("Mid-range")).toBeChecked();
    expect(screen.getByLabelText("Notes")).toHaveValue("");
  });

  it("offers talked and no answer as direct saves", () => {
    render(<CallForm job={job} />);
    expect(screen.getByRole("button", { name: "Talked, no visit yet" })).toHaveAttribute("value", "talked");
    expect(screen.getByRole("button", { name: "No answer" })).toHaveAttribute("value", "no_answer");
  });

  it("asks for the visit time before saving a booked visit", () => {
    render(<CallForm job={job} />);
    expect(screen.queryByLabelText("Visit date and time")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Booked a visit" }));
    expect(screen.getByLabelText("Visit date and time")).toBeRequired();
    expect(screen.getByRole("button", { name: "Save booked visit" })).toHaveAttribute("value", "booked");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Visit date and time")).toBeNull();
  });

  it("fetches that day's schedule once a date is set", async () => {
    bookVisit("2026-09-20T10:30");
    await waitFor(() => expect(callDaySchedule).toHaveBeenCalledWith(job.id, "2026-09-20"));
    expect(callDaySchedule).toHaveBeenCalledTimes(1);
    await screen.findByText("Nothing else booked that day.");
  });

  it("does not refetch when only the time changes, but updates the clash highlight", async () => {
    callDaySchedule.mockResolvedValue({
      ok: true, notice: null,
      items: [{ key: "other:visit", allDay: false, start: "2026-09-20T17:00:00.000Z", end: "2026-09-20T18:00:00.000Z", title: "Visit · Other Job" }],
    });
    bookVisit("2026-09-20T09:00"); // 9am Vegas = 16:00 UTC, no clash with 10am-11am Vegas item
    await waitFor(() => expect(callDaySchedule).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/clashes with this time/)).toBeNull();

    fireEvent.change(screen.getByLabelText("Visit date and time"), { target: { value: "2026-09-20T10:30" } });
    await screen.findByText(/clashes with this time/);
    expect(callDaySchedule).toHaveBeenCalledTimes(1);
  });

  it("refetches when the date changes", async () => {
    bookVisit("2026-09-20T10:30");
    await waitFor(() => expect(callDaySchedule).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Visit date and time"), { target: { value: "2026-09-21T10:30" } });
    await waitFor(() => expect(callDaySchedule).toHaveBeenCalledWith(job.id, "2026-09-21"));
    expect(callDaySchedule).toHaveBeenCalledTimes(2);
  });

  it("never shows a late answer for a date that is no longer selected", async () => {
    let answerFirst: (value: unknown) => void = () => {};
    callDaySchedule
      .mockReturnValueOnce(new Promise((resolve) => { answerFirst = resolve; }))
      .mockResolvedValueOnce({ ok: true, notice: null, items: [] });
    bookVisit("2026-09-20T10:30");
    await waitFor(() => expect(callDaySchedule).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Visit date and time"), { target: { value: "2026-09-21T10:30" } });
    await screen.findByText("Nothing else booked that day.");
    answerFirst({ ok: true, notice: null,
      items: [{ key: "old", allDay: false, start: "2026-09-20T17:00:00.000Z", end: null, title: "Stale Item" }] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(/Stale Item/)).toBeNull();
  });

  it("shows loading again while a newly chosen date is fetched", async () => {
    callDaySchedule.mockResolvedValueOnce({ ok: true, notice: null, items: [] }).mockReturnValueOnce(new Promise(() => {}));
    bookVisit("2026-09-20T10:30");
    await screen.findByText("Nothing else booked that day.");
    fireEvent.change(screen.getByLabelText("Visit date and time"), { target: { value: "2026-09-21T10:30" } });
    expect(await screen.findByText("Loading that day…")).toBeInTheDocument();
    expect(screen.queryByText("Nothing else booked that day.")).toBeNull();
  });

  it("shows the overlap line and per-item clash text on a clash", async () => {
    callDaySchedule.mockResolvedValue({
      ok: true, notice: null,
      items: [{ key: "other:visit", allDay: false, start: "2026-09-20T17:00:00.000Z", end: "2026-09-20T18:00:00.000Z", title: "Visit · Other Job" }],
    });
    bookVisit("2026-09-20T10:30");
    await screen.findByText("This time overlaps something already booked.");
    expect(screen.getByText(/Visit · Other Job — clashes with this time/)).toBeTruthy();
  });

  it("labels an item with no end as lasting an hour", async () => {
    callDaySchedule.mockResolvedValue({
      ok: true, notice: null,
      items: [{ key: "x", allDay: false, start: "2026-09-20T17:00:00.000Z", end: null, title: "No End" }],
    });
    bookVisit("2026-09-20T08:00");
    expect(await screen.findByText("10:00 AM – 11:00 AM · No End")).toBeInTheDocument();
  });

  it("shows the notice under the heading", async () => {
    callDaySchedule.mockResolvedValue({ ok: true, notice: "Outlook isn't connected yet.", items: [] });
    bookVisit("2026-09-20T10:30");
    await screen.findByText("Outlook isn't connected yet.");
  });

  it("shows a failure message and still lets the form work", async () => {
    callDaySchedule.mockResolvedValue({ ok: false });
    bookVisit("2026-09-20T10:30");
    await screen.findByText("Couldn't load that day's schedule.");
    expect(screen.getByRole("button", { name: "Save booked visit" })).toBeEnabled();
  });
});
