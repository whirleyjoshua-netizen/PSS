import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { HD_RESTRICTED_EXCLUSION, HD_DEALER } from "@/content/offer-terms";
import { HOLIDAY_LEAD_NOTE } from "@/content/holiday";
import { SOLAR_LEAD_NOTE } from "@/content/solar-offer";
import { holidayOffer, solarOffer } from "@/content/promo";
import { HeroOffer } from "@/components/home/HeroOffer";
import { FAQ_GROUPS } from "@/content/faq";
import AboutPage from "@/app/(site)/about/page";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

afterEach(() => vi.useRealTimers());

/** Hunter Douglas 2026 Advertising Media Kit, read 2026-10-22: what the site must and may say. */
describe("Hunter Douglas advertising rules", () => {
  it("puts the restricted-products exclusion under every percentage offer", () => {
    vi.useFakeTimers({ toFake: ["Date"] }).setSystemTime(new Date("2026-10-22T20:00:00Z"));
    render(<HeroOffer line="10% off" note="n" season={solarOffer} />);
    expect(screen.getByText(HD_RESTRICTED_EXCLUSION)).toBeInTheDocument();
    expect(holidayOffer.message).toMatch(/Excludes Hunter Douglas restricted products/);
  });

  it("tells the quote to leave the restricted lines out of the discount", () => {
    for (const note of [HOLIDAY_LEAD_NOTE, SOLAR_LEAD_NOTE]) expect(note).toMatch(/Excludes Hunter Douglas restricted lines \(.*Silhouette.*PowerView\)/);
  });

  it("puts the exclusion in the offer email", async () => {
    vi.stubEnv("RESEND_API_KEY", "k");
    send.mockResolvedValue({ error: null });
    const { sendOfferEmail } = await import("@/lib/leads/offer-signup");
    await sendOfferEmail({ name: "Dana Reyes", email: "d@example.com" }, new Date("2026-10-22T20:00:00Z"));
    expect(send.mock.calls[0][0].text).toContain(HD_RESTRICTED_EXCLUSION);
  });

  it("calls us an Authorized Hunter Douglas Dealer, the wording HD allows, and never authorized for Alta or Norman", () => {
    render(<AboutPage />);
    expect(document.body.textContent).toContain(HD_DEALER);
    const faq = JSON.stringify(FAQ_GROUPS);
    expect(faq).toContain(HD_DEALER);
    expect(document.body.textContent + faq).not.toMatch(/Hunter Douglas (Las Vegas|Store|Showroom|Outlet|Lifetime Warranty)|exclusive dealer|only dealer|authorized (alta|norman)/i);
  });
});
