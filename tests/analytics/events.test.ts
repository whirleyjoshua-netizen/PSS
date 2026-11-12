import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendGAEvent = vi.fn();
vi.mock("@next/third-parties/google", () => ({ sendGAEvent: (...args: unknown[]) => sendGAEvent(...args) }));

import { ADS_LEAD_CONVERSION, EVENTS, trackLead, trackGuideCta, trackOfferSignup } from "@/lib/analytics/events";
import { ADS_ID } from "@/components/analytics/SiteAnalytics";
import { PhoneClickTracking } from "@/components/analytics/PhoneClickTracking";

function tapOn(html: string, path: string) {
  window.history.pushState({}, "", path);
  document.body.innerHTML = html;
  render(createElement(PhoneClickTracking));
  (document.querySelector("[data-tap]") as HTMLElement).click();
}

beforeEach(() => {
  sendGAEvent.mockReset();
  document.body.innerHTML = "";
});

describe("trackLead", () => {
  it("sends GA4's generate_lead with the form that produced it", () => {
    trackLead("hero");
    expect(sendGAEvent).toHaveBeenCalledWith("event", "generate_lead", { form: "hero" });
  });

  it("also sends the Google Ads website conversion, on the same Ads account the site's tag loads", () => {
    trackLead("contact");
    expect(sendGAEvent).toHaveBeenCalledWith("event", "conversion", { send_to: ADS_LEAD_CONVERSION });
    expect(ADS_LEAD_CONVERSION.startsWith(`${ADS_ID}/`)).toBe(true);
    expect(sendGAEvent).toHaveBeenCalledTimes(2);
  });

  it("counts an offer sign-up with a phone number as a lead conversion, and one without as neither", () => {
    trackOfferSignup(true);
    expect(sendGAEvent).toHaveBeenCalledWith("event", "conversion", { send_to: ADS_LEAD_CONVERSION });
    sendGAEvent.mockReset();
    trackOfferSignup(false);
    expect(sendGAEvent).toHaveBeenCalledWith("event", "offer_signup", {});
    expect(sendGAEvent).not.toHaveBeenCalledWith("event", "conversion", expect.anything());
  });

  it("never throws when analytics fails", () => {
    sendGAEvent.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => trackLead("contact")).not.toThrow();
  });
});

describe("PhoneClickTracking", () => {
  it("counts a tap on any tel: link, including one on text inside the link", () => {
    tapOn(`<a href="tel:+17028598294"><span data-tap>(702) 859-8294</span></a>`, "/shutters");
    expect(sendGAEvent).toHaveBeenCalledWith("event", EVENTS.phone, { page: "/shutters" });
  });

  it("ignores links that are not phone numbers", () => {
    tapOn(`<a href="/contact" data-tap>Contact</a>`, "/");
    expect(sendGAEvent).not.toHaveBeenCalled();
  });

  it("does not count a tap from someone already counted or already a customer", () => {
    tapOn(`<a href="tel:+17028598294" data-tap>Call</a>`, "/thank-you/all-set");
    tapOn(`<a href="tel:+17028598294" data-tap>Call</a>`, "/project/abc");
    expect(sendGAEvent).not.toHaveBeenCalled();
  });
});

describe("trackGuideCta", () => {
  it("sends guide_cta_click with the guide and which button", () => {
    trackGuideCta("replace-a-broken-blind-slat", "book");
    expect(sendGAEvent).toHaveBeenCalledWith("event", "guide_cta_click", { guide: "replace-a-broken-blind-slat", kind: "book" });
  });

  it("also sends the Google Ads website conversion, on the same Ads account the site's tag loads", () => {
    trackLead("contact");
    expect(sendGAEvent).toHaveBeenCalledWith("event", "conversion", { send_to: ADS_LEAD_CONVERSION });
    expect(ADS_LEAD_CONVERSION.startsWith(`${ADS_ID}/`)).toBe(true);
    expect(sendGAEvent).toHaveBeenCalledTimes(2);
  });

  it("counts an offer sign-up with a phone number as a lead conversion, and one without as neither", () => {
    trackOfferSignup(true);
    expect(sendGAEvent).toHaveBeenCalledWith("event", "conversion", { send_to: ADS_LEAD_CONVERSION });
    sendGAEvent.mockReset();
    trackOfferSignup(false);
    expect(sendGAEvent).toHaveBeenCalledWith("event", "offer_signup", {});
    expect(sendGAEvent).not.toHaveBeenCalledWith("event", "conversion", expect.anything());
  });

  it("never throws when analytics fails", () => {
    sendGAEvent.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => trackGuideCta("x", "call")).not.toThrow();
  });
});
