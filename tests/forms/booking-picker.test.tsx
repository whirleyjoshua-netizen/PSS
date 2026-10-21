import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HeroForm } from "@/components/forms/HeroForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@next/third-parties/google", () => ({ sendGAEvent: vi.fn() }));

const SLOTS = {
  ok: true,
  days: [
    { date: "2026-10-21", weekday: "Wed", day: "Oct 21", slots: [{ start: "2026-10-21T15:00:00.000Z", label: "8:00 AM" }] },
    { date: "2026-10-22", weekday: "Thu", day: "Oct 22", slots: [
      { start: "2026-10-22T17:00:00.000Z", label: "10:00 AM" }, { start: "2026-10-22T21:00:00.000Z", label: "2:00 PM" },
    ] },
  ],
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (url: string) =>
    url === "/api/booking/slots" ? json(SLOTS) : json({ ok: true, booked: true }, 201));
  vi.stubGlobal("fetch", fetchMock);
  push.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^name/i), "Dana Reyes");
  await user.type(screen.getByLabelText(/^phone/i), "7025550134");
  await user.type(screen.getByLabelText(/^email/i), "dana@example.com");
}

describe("Pick a time on the home form", () => {
  it("is only on forms that ask for it", () => {
    render(<HeroForm />);
    expect(screen.queryByRole("button", { name: "Book an Appointment" })).toBeNull();
  });

  it("books the picked time and address with the request", async () => {
    const user = userEvent.setup();
    render(<HeroForm booking />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Book an Appointment" }));

    const dialog = await screen.findByRole("dialog", { name: "Pick a time for your visit." });
    await user.click(within(dialog).getByRole("button", { name: "Thursday, October 22" }));
    await user.click(within(dialog).getByRole("button", { name: "10:00 AM" }));
    await user.click(within(dialog).getByRole("button", { name: "Use this time" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Please enter the street address for your visit.");
    await user.type(within(dialog).getByLabelText("Street address"), "12 Sample St");
    await user.click(within(dialog).getByRole("button", { name: "Use this time" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Thu, Oct 22 at 10:00 AM")).toBeInTheDocument();
    expect(screen.getByText("12 Sample St")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Book my visit" }));
    const sent = JSON.parse(fetchMock.mock.calls.find(([url]) => url === "/api/consultation")![1].body);
    expect(sent).toMatchObject({ slot: "2026-10-22T17:00:00.000Z", address: "12 Sample St", name: "Dana Reyes" });
    expect(push).toHaveBeenCalledWith("/thank-you");
  });

  it("forgets the time on a new day, so a time from another day is never booked by mistake", async () => {
    const user = userEvent.setup();
    render(<HeroForm booking />);
    await user.click(screen.getByRole("button", { name: "Book an Appointment" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "8:00 AM" }));
    await user.click(within(dialog).getByRole("button", { name: "Thursday, October 22" }));
    await user.type(within(dialog).getByLabelText("Street address"), "12 Sample St");
    await user.click(within(dialog).getByRole("button", { name: "Use this time" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Pick a time.");
  });

  it("can be removed, and the form goes back to the call-back request", async () => {
    const user = userEvent.setup();
    render(<HeroForm booking />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Book an Appointment" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "8:00 AM" }));
    await user.type(within(dialog).getByLabelText("Street address"), "12 Sample St{Enter}");
    // Enter in the address chooses the time; it never sends the request.
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/consultation")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: /invite us over/i }));
    const sent = JSON.parse(fetchMock.mock.calls.find(([url]) => url === "/api/consultation")![1].body);
    expect(sent.slot).toBeUndefined();
    expect(sent.address).toBeUndefined();
  });

  it("shows the days as a calendar, with a day that has no times greyed out", async () => {
    const user = userEvent.setup();
    render(<HeroForm booking />);
    await user.click(screen.getByRole("button", { name: "Book an Appointment" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("October 2026")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Wednesday, October 21" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Friday, October 23" })).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: /Sunday/ })).toBeNull();
  });

  it("says when online booking is unavailable", async () => {
    fetchMock.mockImplementation(async () => json({ ok: false }, 503));
    const user = userEvent.setup();
    render(<HeroForm booking />);
    await user.click(screen.getByRole("button", { name: "Book an Appointment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Online booking isn't available right now.");
  });
});
