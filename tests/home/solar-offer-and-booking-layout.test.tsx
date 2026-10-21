import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { Hero } from "@/components/home/Hero";
import { HeroForm } from "@/components/forms/HeroForm";
import ProductPage from "@/app/(site)/[category]/[product]/page";
import { HOLIDAY_FORM_LINE, HOLIDAY_LEAD_NOTE } from "@/content/holiday";
import { SOLAR_FORM_LINE, SOLAR_LEAD_NOTE, SOLAR_PAGE_LINE } from "@/content/solar-offer";
import { solarOffer } from "@/content/promo";
import { isPromoLive } from "@/lib/promo";

vi.mock("next/navigation", async (original) => ({ ...(await original<object>()), useRouter: () => ({ push: vi.fn() }) }));

const at = (iso: string) => vi.useFakeTimers({ toFake: ["Date"] }).setSystemTime(new Date(iso));
const form = () => screen.getByRole("button", { name: /invite us over/i }).closest("form")!;
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const product = async (category: string, slug: string) =>
  render(await ProductPage({ params: Promise.resolve({ category, product: slug }) }));

afterEach(() => vi.useRealTimers());

describe("the home form layout (owner 2026-10-20)", () => {
  it("puts a big heading, then Book an Appointment, then the call-back line, the fields and Invite Us Over", () => {
    render(<HeroForm booking />);
    const heading = screen.getByRole("heading", { name: "Free in-home consultation" });
    expect(heading.className).toContain("text-3xl");
    const book = screen.getByRole("button", { name: "Book an Appointment" });
    const line = screen.getByText("Or leave your information and we’ll call you to schedule.");
    const name = screen.getByLabelText(/^name/i);
    const invite = screen.getByRole("button", { name: /invite us over/i });
    expect(before(heading, book)).toBe(true);
    expect(before(book, line)).toBe(true);
    expect(before(line, name)).toBe(true);
    expect(before(name, invite)).toBe(true);
  });

  it("leaves the other pages' forms as they were", () => {
    render(<HeroForm />);
    expect(screen.getByRole("heading", { name: "Free in-home consultation" }).className).toContain("text-xl");
    expect(screen.queryByText(/leave your information/)).toBeNull();
  });
});

describe("the 15% solar shades offer", () => {
  it("runs from Oct 20 to the end of Nov 15 in Las Vegas", () => {
    expect(isPromoLive(solarOffer, new Date("2026-10-20T07:00:00Z"))).toBe(true);
    expect(isPromoLive(solarOffer, new Date("2026-11-16T07:59:59Z"))).toBe(true);
    expect(isPromoLive(solarOffer, new Date("2026-11-16T08:00:00Z"))).toBe(false);
  });

  it("says no minimum, the last day, and that it never stacks, in the lead note", () => {
    expect(SOLAR_FORM_LINE).toBe("Solar shades: 15% off, any number, when you book by Nov 15.");
    expect(SOLAR_LEAD_NOTE).toMatch(/15% off interior solar shades, no minimum/);
    expect(SOLAR_LEAD_NOTE).toMatch(/Never stacked with the 10%/);
  });

  it("sits under the holiday line in the home form, and tags the lead with both notes", () => {
    at("2026-11-10T20:00:00Z");
    render(<Hero />);
    const holiday = within(form()).getByText(HOLIDAY_FORM_LINE);
    const solar = within(form()).getByText(SOLAR_FORM_LINE);
    expect(before(holiday, solar)).toBe(true);
    const notes = form().querySelectorAll<HTMLInputElement>('input[name="notes"]');
    expect(notes).toHaveLength(1);
    expect(notes[0].value).toBe(`${HOLIDAY_LEAD_NOTE} ${SOLAR_LEAD_NOTE}`);
  });

  it("is gone from the home form after Nov 15", () => {
    at("2026-11-16T08:00:00Z");
    const { container } = render(<Hero />);
    expect(container.textContent).not.toMatch(/15%/);
  });

  it("shows on the Solar Shades page form with its note, and on no other product page", async () => {
    at("2026-11-10T20:00:00Z");
    const { container, unmount } = await product("shades", "solar-shades");
    expect(within(form()).getByText(SOLAR_PAGE_LINE)).toBeInTheDocument();
    expect(form().querySelector<HTMLInputElement>('input[name="notes"]')?.value).toBe(SOLAR_LEAD_NOTE);
    const scripts = Array.from(container.querySelectorAll("script")).map((s) => s.textContent ?? "");
    expect(scripts.some((s) => s.includes("[data-holiday-offer]") && s.includes(String(new Date(solarOffer.endsAt).getTime())))).toBe(true);
    unmount();

    const roller = await product("shades", "roller-shades");
    expect(roller.container.textContent).not.toMatch(/15%/);
  });

  it("is gone from the Solar Shades page after Nov 15", async () => {
    at("2026-11-16T08:00:00Z");
    const { container } = await product("shades", "solar-shades");
    expect(container.textContent).not.toMatch(/15%/);
    expect(form().querySelector('input[name="notes"]')).toBeNull();
  });
});
