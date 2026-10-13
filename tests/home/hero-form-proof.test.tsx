import { act, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, it, expect, afterEach, vi } from "vitest";
import { Hero, HERO_SUBHEAD } from "@/components/home/Hero";
import { HeroOffer } from "@/components/home/HeroOffer";
import { PROMISES } from "@/components/booking/PromiseRow";
import { business } from "@/content/business";
import { HOLIDAY_FORM_LINE, HOLIDAY_LEAD_NOTE } from "@/content/holiday";
import { holidayOffer } from "@/content/promo";
import { pastWork } from "@/content/reviews";

const at = (iso: string) => vi.useFakeTimers({ toFake: ["Date"] }).setSystemTime(new Date(iso));
const form = () => screen.getByRole("button", { name: /invite us over/i }).closest("form")!;
const card = () => form().parentElement!;

afterEach(() => vi.useRealTimers());

describe("the hero subhead", () => {
  it("names the products and every service-area city, in the serviceArea order", () => {
    expect(HERO_SUBHEAD).toBe(
      "Custom blinds, shades, shutters and solar screens for Las Vegas, Henderson, Summerlin and North Las Vegas. Shade’ designs, Josh measures and installs. No call center, no subcontractors.",
    );
    const [first, ...rest] = business.serviceArea;
    expect(HERO_SUBHEAD).toContain(`for ${first}, ${rest.slice(0, -1).join(", ")} and ${rest.at(-1)}.`);
  });

  it("replaces the generic family line and keeps the tagline as the h1", () => {
    render(<Hero />);
    expect(screen.getByText(HERO_SUBHEAD)).toBeInTheDocument();
    expect(screen.queryByText(/streamlined/i)).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(business.tagline);
  });
});

describe("proof inside the hero form card", () => {
  it("states the past-work figures from content/reviews.ts, credited to Custom Decorators, under the button", () => {
    at("2026-12-26T19:00:00Z");
    render(<Hero />);
    // Owner-approved wording (2026-10-13): says the surveys pre-date this business.
    const line = "4.9 average from 44 client surveys of Josh and Shade’s work at Custom Decorators, before Premier Shade Solutions.";
    expect(`${pastWork.averageRating} ${pastWork.surveys} ${pastWork.source}`).toBe("4.9 44 Custom Decorators");
    const proof = within(card()).getByText(line);
    const button = within(form()).getByRole("button", { name: /invite us over/i });
    expect(button.compareDocumentPosition(proof) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("carries the promise badges", () => {
    at("2026-12-26T19:00:00Z");
    render(<Hero />);
    const badges = within(card()).getByRole("list", { name: "What you get" });
    expect(Array.from(badges.querySelectorAll("li")).map((li) => li.textContent)).toEqual(PROMISES);
  });

  it("gives the bar's Invite Us Over a #book anchor to scroll to", () => {
    render(<Hero />);
    expect(document.getElementById("book")).toContainElement(form());
  });
});

describe("the holiday offer in the hero form", () => {
  it("shows the offer above the button and tags the lead while the offer runs", () => {
    at("2026-11-10T20:00:00Z");
    const { container } = render(<Hero />);
    const offer = within(form()).getByText(HOLIDAY_FORM_LINE);
    const button = within(form()).getByRole("button", { name: /invite us over/i });
    expect(offer.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(form().querySelector<HTMLInputElement>('input[name="notes"]')?.value).toBe(HOLIDAY_LEAD_NOTE);
    // A page built during the offer carries a script that hides the line the moment the offer ends.
    const scripts = Array.from(container.querySelectorAll("script")).map((s) => s.textContent ?? "");
    expect(scripts.some((s) => s.includes("[data-holiday-offer]") && s.includes(String(new Date(holidayOffer.endsAt).getTime())))).toBe(true);
  });

  it("is gone, with no note, from the first moment of Nov 16 in Las Vegas", () => {
    at("2026-11-16T08:00:00Z");
    const { container } = render(<Hero />);
    expect(container.textContent).not.toMatch(/10%/);
    expect(form().querySelector('input[name="notes"]')).toBeNull();
    expect(container.querySelector("[data-holiday-offer]")).toBeNull();
    // A page built after the offer carries nothing of it, not even the script that would hide it.
    const scripts = Array.from(container.querySelectorAll("script")).map((s) => s.textContent ?? "");
    expect(scripts.some((s) => s.includes("[data-holiday-offer]"))).toBe(false);
  });

  it("is still there in the last minute of Nov 15", () => {
    at("2026-11-16T07:59:00Z");
    render(<Hero />);
    expect(within(form()).getByText(HOLIDAY_FORM_LINE)).toBeInTheDocument();
  });

  it("takes itself and its note down on a page built during the offer but opened after it", async () => {
    at("2026-11-10T20:00:00Z");
    const html = renderToString(<HeroOffer line={HOLIDAY_FORM_LINE} note={HOLIDAY_LEAD_NOTE} season={holidayOffer} />);
    expect(html).toContain(HOLIDAY_FORM_LINE);

    vi.setSystemTime(new Date("2026-11-20T20:00:00Z"));
    const container = document.createElement("form");
    container.innerHTML = html;
    document.body.appendChild(container);
    await act(async () => {
      render(<HeroOffer line={HOLIDAY_FORM_LINE} note={HOLIDAY_LEAD_NOTE} season={holidayOffer} />, { container, hydrate: true });
    });
    expect(container.textContent).not.toContain(HOLIDAY_FORM_LINE);
    expect(container.querySelector('input[name="notes"]')).toBeNull();
    container.remove();
  });
});
