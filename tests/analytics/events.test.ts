import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendGAEvent = vi.fn();
vi.mock("@next/third-parties/google", () => ({ sendGAEvent: (...args: unknown[]) => sendGAEvent(...args) }));

import { EVENTS, trackLead, trackGuideCta } from "@/lib/analytics/events";
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

  it("never throws when analytics fails", () => {
    sendGAEvent.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => trackGuideCta("x", "call")).not.toThrow();
  });
});
