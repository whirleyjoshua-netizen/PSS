import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BookingBlock, FAMILY_LINE } from "@/components/booking/BookingBlock";
import { consultationPhoto } from "@/content/gallery";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@next/third-parties/google", () => ({ sendGAEvent: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Fills the booking form, submits it, and returns the JSON body sent to /api/consultation. */
async function submitBooking() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/name/i), "Dana Reyes");
  await user.type(screen.getByLabelText(/phone/i), "7025550134");
  await user.type(screen.getByLabelText(/email/i), "dana@example.com");
  await user.click(screen.getByRole("button", { name: /invite us over/i }));
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe("BookingBlock", () => {
  it("puts the short form, the photo and the family line together", () => {
    const { container } = render(<BookingBlock photo={consultationPhoto} />);

    expect(screen.getByRole("button", { name: /invite us over/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: consultationPhoto.alt })).toBeInTheDocument();
    expect(screen.getByText(FAMILY_LINE)).toBeInTheDocument();
    expect(container.querySelector("section#book")).not.toBeNull();
    expect(document.getElementById("book-name")).not.toBeNull();
  });

  it("says the review is from the owners' work before Premier Shade and links every review", () => {
    render(<BookingBlock photo={consultationPhoto} />);
    const quote = screen.getByRole("figure");

    expect(within(quote).getByText(/before we opened premier shade solutions/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /read every review/i })).toHaveAttribute("href", "/reviews");
  });

  it("files the lead under the page's city and the booking source", () => {
    const { container } = render(<BookingBlock photo={consultationPhoto} city="Summerlin" />);
    expect(container.querySelector('input[name="city"]')).toHaveValue("Summerlin");
  });

  it("shows a section heading only when the page gives one", () => {
    const { rerender } = render(<BookingBlock photo={consultationPhoto} />);
    expect(screen.queryByRole("heading", { level: 2, name: /in henderson/i })).toBeNull();

    rerender(<BookingBlock photo={consultationPhoto} heading="Book a free consultation in Henderson" />);
    expect(screen.getByRole("heading", { level: 2, name: "Book a free consultation in Henderson" })).toBeInTheDocument();
  });

  it("puts the form first on a phone", () => {
    const { container } = render(<BookingBlock photo={consultationPhoto} />);
    const form = container.querySelector("form")!;
    const image = container.querySelector("img")!;
    expect(form.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sends the page's treatment with the lead, as the contact form's checkbox would", async () => {
    render(<BookingBlock photo={consultationPhoto} treatment="Shutters" />);
    expect(await submitBooking()).toMatchObject({ source: "booking", treatments: ["Shutters"] });
  });

  it("sends no treatment when the page gives none", async () => {
    const { container } = render(<BookingBlock photo={consultationPhoto} />);
    expect(container.querySelector('input[name="treatments"]')).toBeNull();
    expect((await submitBooking()).treatments).toEqual([]);
  });

  it("leaves the review out when the page says so", () => {
    render(<BookingBlock photo={consultationPhoto} showReview={false} />);
    expect(screen.queryByRole("figure")).toBeNull();
    expect(screen.queryByRole("link", { name: /read every review/i })).toBeNull();
    expect(screen.getByRole("button", { name: /invite us over/i })).toBeInTheDocument();
  });
});
