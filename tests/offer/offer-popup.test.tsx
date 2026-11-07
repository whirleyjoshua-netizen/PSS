import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HOLIDAY_FORM_LINE } from "@/content/holiday";
import { SOLAR_FORM_LINE } from "@/content/solar-offer";
import { LEAD_SENT_KEY, OFFER_SEEN_KEY } from "@/content/offer-popup";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
const sendGAEvent = vi.hoisted(() => vi.fn());
vi.mock("@next/third-parties/google", () => ({ sendGAEvent }));

const { OfferPopup } = await import("@/components/offer/OfferPopup");

const popup = () => screen.queryByRole("dialog");
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  nav.pathname = "/";
  window.localStorage.clear();
  vi.useFakeTimers().setSystemTime(new Date("2026-10-22T20:00:00Z"));
  sendGAEvent.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the offer pop-up (owner 2026-10-21)", () => {
  it("shows as soon as they land, with both running offers, and asks for a name and email, and an optional phone", async () => {
    render(<OfferPopup />);
    expect(popup()).toBeNull();
    await wait(1_500);
    expect(screen.getByRole("dialog", { name: "Claim your holiday offer before it's too late." })).toBeInTheDocument();
    expect(screen.getByText(HOLIDAY_FORM_LINE)).toBeInTheDocument();
    expect(screen.getByText(SOLAR_FORM_LINE)).toBeInTheDocument();
    expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^phone/i)).not.toBeRequired();
  });

  it("shows once per browser", async () => {
    const first = render(<OfferPopup />);
    await wait(1_500);
    expect(window.localStorage.getItem(OFFER_SEEN_KEY)).toBe("1");
    first.unmount();
    render(<OfferPopup />);
    await wait(60_000);
    expect(popup()).toBeNull();
  });

  it("never shows to someone who already sent a form", async () => {
    window.localStorage.setItem(LEAD_SENT_KEY, "1");
    render(<OfferPopup />);
    await wait(60_000);
    expect(popup()).toBeNull();
  });

  it("stays off the thank-you page and the customer portal", async () => {
    nav.pathname = "/thank-you";
    render(<OfferPopup />);
    await wait(60_000);
    expect(popup()).toBeNull();
  });

  it("stays off the deposit pay page, where a client is paying (owner 2026-11-04)", async () => {
    nav.pathname = "/pay/3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c/abcdefghijklmnopqrstuv";
    render(<OfferPopup />);
    await wait(60_000);
    expect(popup()).toBeNull();
  });

  it("is gone once the offers end", async () => {
    vi.setSystemTime(new Date("2026-11-16T08:00:00Z"));
    render(<OfferPopup />);
    await wait(60_000);
    expect(popup()).toBeNull();
  });

  it("waits while someone is typing in a form", async () => {
    render(<><input aria-label="typing" /><OfferPopup /></>);
    screen.getByLabelText("typing").focus();
    await wait(30_000);
    expect(popup()).toBeNull();
    screen.getByLabelText("typing").blur();
    await wait(5_000);
    expect(popup()).not.toBeNull();
  });

  it("sends the sign-up, remembers it, counts it apart from leads, and points them to booking", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<OfferPopup />);
    await wait(1_500);
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Dana Reyes" } });
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: "dana@example.com" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Claim my offer" })); });
    expect(fetchMock).toHaveBeenCalledWith("/api/offer", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ name: "Dana Reyes", email: "dana@example.com" });
    expect(screen.getByText("Check your email.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book a time" })).toHaveAttribute("href", "/#book");
    expect(window.localStorage.getItem(LEAD_SENT_KEY)).toBe("1");
    expect(sendGAEvent).toHaveBeenCalledWith("event", "offer_signup", {});
    expect(sendGAEvent).not.toHaveBeenCalledWith("event", "generate_lead", expect.anything());
  });

  it("with a phone number it is a consultation request: sends the digits, says we'll call, counts as a lead", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<OfferPopup />);
    await wait(1_500);
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Dana Reyes" } });
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: "dana@example.com" } });
    fireEvent.change(screen.getByLabelText(/^phone/i), { target: { value: "(702) 555-0142" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Claim my offer" })); });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ phone: "7025550142" });
    expect(screen.getByText("You're all set.")).toBeInTheDocument();
    expect(screen.getByText(/We'll call you within a business day/)).toBeInTheDocument();
    expect(sendGAEvent).toHaveBeenCalledWith("event", "generate_lead", { form: "offer" });
    expect(sendGAEvent).not.toHaveBeenCalledWith("event", "offer_signup", expect.anything());
  });

  it("refuses a phone number that isn't 10 digits, and sends nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<OfferPopup />);
    await wait(1_500);
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Dana Reyes" } });
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: "dana@example.com" } });
    fireEvent.change(screen.getByLabelText(/^phone/i), { target: { value: "555-01" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Claim my offer" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter a 10-digit phone number, or leave it blank.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the problem and sends nothing when the email is wrong", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<OfferPopup />);
    await wait(1_500);
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Dana Reyes" } });
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: "dana" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Claim my offer" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter a valid email address.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("closes with No thanks", async () => {
    render(<OfferPopup />);
    await wait(1_500);
    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
    expect(popup()).toBeNull();
  });
});
